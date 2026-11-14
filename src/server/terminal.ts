import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import Docker from 'dockerode';

export interface ExecuteCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
  sandboxed?: boolean;
}

export interface ExecuteCommandOptions {
  id?: string;
  cwd: string;
  command: string;
  timeoutMs?: number;
  useDocker?: boolean;
  signal?: AbortSignal;
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
}

const MAX_OUTPUT_LENGTH = 64 * 1024; // 64 KB cap per stream
const DOCKER_IMAGE = 'node:20-alpine';

// Active running processes/containers registry (id -> stop handler)
const activeProcesses = new Map<string, () => Promise<void>>();

/**
 * Checks if a command matches the strict security Blocklist:
 * - rm -rf / (or rm -fr /, rm -rf /*)
 * - format C: (or any drive format)
 * - del /f /s /q C:\* (or rd /s /q C:\)
 */
export function checkBlockedCommand(command: string): string | null {
  const normalized = command.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  const blocklistPatterns: Array<{ pattern: RegExp; label: string }> = [
    {
      pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\s+(\/\*?|--no-preserve-root)\b/i,
      label: 'rm -rf /',
    },
    {
      pattern: /(?:^|[;&|])\s*rm\s+-[rf]+\s+\/(?:\s|$|\*)/i,
      label: 'rm -rf /',
    },
    {
      pattern: /\bformat\s+[a-zA-Z]:/i,
      label: 'format C:',
    },
    {
      pattern: /\bdel\b(?=.*\/f)(?=.*\/s)(?=.*\/q).*[a-zA-Z]:\\(?:\*|$|\s)/i,
      label: 'del /f /s /q C:\\*',
    },
    {
      pattern: /\b(?:rd|rmdir)\s+\/s\s+\/q\s+[a-zA-Z]:\\(?:$|\s|\*)/i,
      label: 'rd /s /q C:\\',
    },
  ];

  for (const item of blocklistPatterns) {
    if (item.pattern.test(normalized)) {
      return `Команда заблокирована системой безопасности Phoenix (Blocklist: ${item.label}).`;
    }
  }

  return null;
}

export async function stopRunningProcess(id: string): Promise<boolean> {
  const stopper = activeProcesses.get(id);
  if (!stopper) {
    return false;
  }
  activeProcesses.delete(id);
  try {
    await stopper();
  } catch {
    // Ignore stop errors
  }
  return true;
}

function killProcessTree(pid: number | undefined, signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL' = 'SIGKILL'): void {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-pid, signal);
      } catch {
        process.kill(pid, signal);
      }
    }
  } catch {
    // Ignore errors if process already exited
  }
}

async function isDockerRunning(docker: Docker): Promise<boolean> {
  try {
    await Promise.race([
      docker.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Docker ping timeout')), 1500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function executeInDocker({
  id,
  resolvedCwd,
  command,
  timeoutMs,
  signal,
  onOutput,
}: {
  id?: string;
  resolvedCwd: string;
  command: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
}): Promise<ExecuteCommandResult | null> {
  const docker = new Docker();
  if (!(await isDockerRunning(docker))) {
    return null;
  }

  let container: Docker.Container | null = null;
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let aborted = false;

  try {
    // Normalize Windows path for Docker bind mount if needed
    const bindMount = `${resolvedCwd}:/workspace`;

    container = await docker.createContainer({
      Image: DOCKER_IMAGE,
      Cmd: ['sh', '-c', command],
      WorkingDir: '/workspace',
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      HostConfig: {
        Binds: [bindMount],
        Memory: 512 * 1024 * 1024, // 512 MB limit
        NanoCpus: 1_000_000_000, // 1 CPU limit
        AutoRemove: false,
      },
    });
  } catch {
    // Image missing or container creation failed -> fallback to host spawn
    return null;
  }

  const stopContainer = async () => {
    if (!container) return;
    try {
      await container.kill({ signal: 'SIGTERM' });
    } catch {
      try {
        await container.stop({ t: 1 });
      } catch {}
    }
  };

  if (id) {
    activeProcesses.set(id, async () => {
      aborted = true;
      const stopMsg = '\n[Процесс остановлен пользователем (SIGTERM)]\n';
      stderr += stopMsg;
      onOutput?.('stderr', stopMsg);
      await stopContainer();
    });
  }

  const onAbort = () => {
    aborted = true;
    const abortMsg = '\n[Процесс прерван пользователем]\n';
    stderr += abortMsg;
    onOutput?.('stderr', abortMsg);
    void stopContainer();
  };

  if (signal) {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    timedOut = true;
    const timeoutMsg = `\n[Превышен лимит времени выполнения команды (${Math.round(
      timeoutMs / 1000
    )} сек). Контейнер принудительно остановлен.]\n`;
    stderr += timeoutMsg;
    onOutput?.('stderr', timeoutMsg);
    void stopContainer();
  }, timeoutMs);

  try {
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    const outStream = new PassThrough();
    const errStream = new PassThrough();

    outStream.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (stdout.length < MAX_OUTPUT_LENGTH) {
        stdout += text.slice(0, MAX_OUTPUT_LENGTH - stdout.length);
      }
      onOutput?.('stdout', text);
    });

    errStream.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (stderr.length < MAX_OUTPUT_LENGTH) {
        stderr += text.slice(0, MAX_OUTPUT_LENGTH - stderr.length);
      }
      onOutput?.('stderr', text);
    });

    docker.modem.demuxStream(stream, outStream, errStream);

    await container.start();
    const waitResult = await container.wait();
    const code =
      typeof waitResult?.StatusCode === 'number'
        ? waitResult.StatusCode
        : timedOut
          ? 124
          : aborted
            ? 130
            : 1;

    return {
      stdout,
      stderr,
      exitCode: code,
      timedOut,
      sandboxed: true,
    };
  } catch (err: any) {
    return {
      stdout,
      stderr: stderr || `Ошибка Docker-контейнера: ${err?.message || err}`,
      exitCode: timedOut ? 124 : aborted ? 130 : 1,
      timedOut,
      sandboxed: true,
    };
  } finally {
    clearTimeout(timer);
    if (id) {
      activeProcesses.delete(id);
    }
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // Ignore container removal error
      }
    }
  }
}

export async function executeProjectCommand({
  id,
  cwd,
  command,
  timeoutMs = 30_000,
  useDocker = false,
  signal,
  onOutput,
}: ExecuteCommandOptions): Promise<ExecuteCommandResult> {
  // 1. Check security Blocklist first
  const blockedReason = checkBlockedCommand(command);
  if (blockedReason) {
    onOutput?.('stderr', `${blockedReason}\n`);
    return {
      stdout: '',
      stderr: blockedReason,
      exitCode: 126,
    };
  }

  const resolvedCwd = path.resolve(cwd);
  if (!fs.existsSync(resolvedCwd)) {
    fs.mkdirSync(resolvedCwd, { recursive: true });
  }

  // 2. If Docker Sandbox is enabled and Docker is running, run inside ephemeral container
  if (useDocker) {
    const dockerResult = await executeInDocker({
      id,
      resolvedCwd,
      command,
      timeoutMs,
      signal,
      onOutput,
    });
    if (dockerResult !== null) {
      return dockerResult;
    }
  }

  // 3. Fallback: Direct execution via child_process.spawn with strict 30s timeout and taskkill / kill
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const childEnv = { ...process.env };
    if (childEnv.HTTP_PROXY === 'http://127.0.0.1:53200') {
      delete childEnv.HTTP_PROXY;
      delete childEnv.HTTPS_PROXY;
      delete childEnv.NODE_USE_ENV_PROXY;
    }

    const child = spawn(command, {
      cwd: resolvedCwd,
      shell: true,
      env: childEnv,
      windowsHide: true,
      detached: process.platform !== 'win32',
    });

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (id) {
        activeProcesses.delete(id);
      }
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
      resolve({
        stdout,
        stderr,
        exitCode,
        timedOut,
        sandboxed: false,
      });
    };

    if (id) {
      activeProcesses.set(id, async () => {
        if (settled) return;
        const stopMsg = '\n[Процесс остановлен пользователем (SIGTERM)]\n';
        stderr += stopMsg;
        onOutput?.('stderr', stopMsg);
        killProcessTree(child.pid, 'SIGTERM');
        finish(130);
      });
    }

    const handleAbort = () => {
      if (settled) return;
      stderr += '\n[Процесс прерван пользователем]\n';
      onOutput?.('stderr', '\n[Процесс прерван пользователем]\n');
      killProcessTree(child.pid, 'SIGTERM');
      finish(130);
    };

    if (signal) {
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      const timeoutMsg = `\n[Превышен лимит времени выполнения команды (${Math.round(
        timeoutMs / 1000
      )} сек). Процесс принудительно завершён.]\n`;
      stderr += timeoutMsg;
      onOutput?.('stderr', timeoutMsg);
      killProcessTree(child.pid, 'SIGKILL');
      finish(124);
    }, timeoutMs);

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString('utf8');
      if (stdout.length < MAX_OUTPUT_LENGTH) {
        stdout += text.slice(0, MAX_OUTPUT_LENGTH - stdout.length);
      }
      onOutput?.('stdout', text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf8');
      if (stderr.length < MAX_OUTPUT_LENGTH) {
        stderr += text.slice(0, MAX_OUTPUT_LENGTH - stderr.length);
      }
      onOutput?.('stderr', text);
    });

    child.on('error', (err) => {
      const errMsg = `\n[Ошибка запуска процесса: ${err.message}]\n`;
      stderr += errMsg;
      onOutput?.('stderr', errMsg);
      finish(1);
    });

    child.on('close', (code) => {
      finish(typeof code === 'number' ? code : timedOut ? 124 : 1);
    });
  });
}
