import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createOpenAI } from '@ai-sdk/openai';
import { tool, jsonSchema, generateObject } from 'ai';
import { z } from 'zod';
import {
  McpServerConfig,
  PhoenixConfig,
  DEFAULT_API_URL,
  DEFAULT_MODEL,
  getPhoenixDir,
  loadConfig,
  upsertMcpServerConfig,
} from './config.js';
import { ToolInvocationRecord } from './db.js';

const execAsync = promisify(exec);

const PARALLEL_SEARCH_URLS = [
  'https://search.parallel.ai/mcp',
  'https://mcp.parallel.ai/mcp',
];

let parallelUnavailableUntil = 0;

function parseCommandLine(rawCommand: string, explicitArgs?: string[]): {
  command: string;
  args: string[];
} {
  if (explicitArgs && explicitArgs.length > 0) {
    return { command: rawCommand.trim(), args: explicitArgs };
  }
  const parts =
    rawCommand
      .trim()
      .match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
      ?.map((p) => p.replace(/^['"]|['"]$/g, '')) || [];
  return {
    command: parts[0] || '',
    args: parts.slice(1),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout (${ms}ms) connecting to MCP: ${label}`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function connectHttpMcp(urlStr: string, timeoutMs: number): Promise<Client> {
  const url = new URL(urlStr);

  // Try StreamableHTTP first (modern MCP), fall back to SSE
  const streamClient = new Client(
    { name: 'phoenix-agent', version: '0.1.0' },
    { capabilities: {} }
  );
  const streamTransport = new StreamableHTTPClientTransport(url);
  try {
    await withTimeout(streamClient.connect(streamTransport), timeoutMs, urlStr);
    return streamClient;
  } catch {
    try {
      await streamTransport.close();
    } catch {}
    try {
      await streamClient.close();
    } catch {}
  }

  const sseClient = new Client(
    { name: 'phoenix-agent', version: '0.1.0' },
    { capabilities: {} }
  );
  const sseTransport = new SSEClientTransport(url);
  try {
    await withTimeout(sseClient.connect(sseTransport), timeoutMs, urlStr);
    return sseClient;
  } catch (err) {
    try {
      await sseTransport.close();
    } catch {}
    try {
      await sseClient.close();
    } catch {}
    throw err;
  }
}

async function resolveLocalNpxBinary(
  command: string,
  args: string[],
  allowInstall: boolean
): Promise<{ command: string; args: string[] } | null> {
  if (command.toLowerCase() !== 'npx') return null;

  const pkgIndex = args.findIndex((a) => a && !a.startsWith('-'));
  if (pkgIndex === -1) return null;

  const rawSpec = args[pkgIndex];
  const extraArgs = args.slice(pkgIndex + 1);
  // Strip version suffix if present (e.g. @scope/pkg@1.0.0 -> @scope/pkg)
  const pkgName = rawSpec.startsWith('@')
    ? '@' + rawSpec.slice(1).replace(/@[^/]+$/, '')
    : rawSpec.replace(/@.*$/, '');
  const slug = pkgName.replace(/^@[^/]+\//, '').replace(/[^a-zA-Z0-9_.-]/g, '-');
  const pkgRoot = path.join(getPhoenixDir(), 'mcp-packages', slug);
  const installedPkgJsonPath = path.join(pkgRoot, 'node_modules', ...pkgName.split('/'), 'package.json');

  if (!fs.existsSync(installedPkgJsonPath)) {
    if (!allowInstall) return null;
    try {
      fs.mkdirSync(pkgRoot, { recursive: true });
      if (!fs.existsSync(path.join(pkgRoot, 'package.json'))) {
        fs.writeFileSync(
          path.join(pkgRoot, 'package.json'),
          JSON.stringify({ name: `mcp-pkg-${slug}`, version: '1.0.0', private: true }, null, 2),
          'utf8'
        );
      }
      await execAsync(`npm install --ignore-scripts --force "${rawSpec}"`, {
        cwd: pkgRoot,
        timeout: 30000,
      });
    } catch {
      return null;
    }
  }

  if (!fs.existsSync(installedPkgJsonPath)) return null;

  try {
    const pkgJson = JSON.parse(fs.readFileSync(installedPkgJsonPath, 'utf8'));
    const optDeps = pkgJson.optionalDependencies || {};

    // Check for platform-specific binary package (e.g. mcp-time-windows-x64 on win32)
    if (process.platform === 'win32') {
      const winDepName = Object.keys(optDeps).find(
        (k) =>
          (k.includes('windows') || k.includes('win32')) &&
          k.includes(process.arch === 'arm64' ? 'arm64' : 'x64')
      );
      if (winDepName) {
        const winBinDir = path.join(pkgRoot, 'node_modules', ...winDepName.split('/'), 'bin');
        if (!fs.existsSync(winBinDir) && allowInstall) {
          const ver = optDeps[winDepName];
          await execAsync(`npm install --ignore-scripts --force "${winDepName}@${ver}"`, {
            cwd: pkgRoot,
            timeout: 30000,
          }).catch(() => {});
        }
        if (fs.existsSync(winBinDir)) {
          const exeFile = fs.readdirSync(winBinDir).find((f) => f.toLowerCase().endsWith('.exe'));
          if (exeFile) {
            return {
              command: path.join(winBinDir, exeFile),
              args: extraArgs,
            };
          }
        }
      }
    }

    // Fallback to JS bin entry in package.json
    let binRel: string | undefined;
    if (typeof pkgJson.bin === 'string') {
      binRel = pkgJson.bin;
    } else if (pkgJson.bin && typeof pkgJson.bin === 'object') {
      binRel = Object.values(pkgJson.bin)[0] as string | undefined;
    }
    if (binRel) {
      const binAbs = path.join(path.dirname(installedPkgJsonPath), binRel);
      if (fs.existsSync(binAbs)) {
        return {
          command: process.execPath,
          args: [binAbs, ...extraArgs],
        };
      }
    }
  } catch {}

  return null;
}

async function connectMcpServer(server: McpServerConfig, timeoutMs = 5000): Promise<Client> {
  if (server.transport === 'http') {
    if (!server.url?.trim()) {
      throw new Error(`MCP server "${server.name}" has no URL`);
    }
    return connectHttpMcp(server.url.trim(), timeoutMs);
  }

  const { command, args } = parseCommandLine(server.command || '', server.args);
  if (!command) {
    throw new Error(`MCP server "${server.name}" has no command`);
  }

  const fullEnv = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => typeof v === 'string')
  ) as Record<string, string>;

  const trySpawnConnect = async (cmdToRun: string, argsToRun: string[]): Promise<Client> => {
    const client = new Client(
      { name: 'phoenix-agent', version: '0.1.0' },
      { capabilities: {} }
    );
    const isWin = process.platform === 'win32';
    const cmdLower = cmdToRun.toLowerCase();
    const winCmdShims = ['npx', 'npm', 'pnpm', 'yarn', 'bunx'];
    const finalCommand = isWin && winCmdShims.includes(cmdLower) ? 'cmd.exe' : cmdToRun;
    const finalArgs = isWin && winCmdShims.includes(cmdLower) ? ['/c', cmdToRun, ...argsToRun] : argsToRun;

    const transport = new StdioClientTransport({
      command: finalCommand,
      args: finalArgs,
      env: fullEnv,
      stderr: 'pipe',
    });

    let stderrBuffer = '';
    if (transport.stderr) {
      transport.stderr.on('data', (chunk: Buffer | string) => {
        stderrBuffer += chunk.toString();
        if (stderrBuffer.length > 2000) {
          stderrBuffer = stderrBuffer.slice(-2000);
        }
      });
    }

    try {
      await withTimeout(client.connect(transport), timeoutMs, server.name);
      return client;
    } catch (err: any) {
      try {
        await transport.close();
      } catch {}
      throw err;
    }
  };

  // 1. Check if we already have a pre-installed local binary/script for this npx package
  const cachedLocal = await resolveLocalNpxBinary(command, args, false);
  if (cachedLocal) {
    try {
      return await trySpawnConnect(cachedLocal.command, cachedLocal.args);
    } catch {}
  }

  // 2. Try standard command execution
  try {
    return await trySpawnConnect(command, args);
  } catch (primaryErr) {
    // 3. If npx failed (e.g., broken postinstall script on Windows like @theo.foobar/mcp-time),
    // install with --ignore-scripts into ~/.phoenix/mcp-packages and run binary directly
    const recoveredLocal = await resolveLocalNpxBinary(command, args, true);
    if (recoveredLocal) {
      return await trySpawnConnect(recoveredLocal.command, recoveredLocal.args);
    }
    throw primaryErr;
  }
}

async function connectParallelSearch(timeoutMs = 2500): Promise<Client | null> {
  if (Date.now() < parallelUnavailableUntil) {
    return null;
  }
  for (const url of PARALLEL_SEARCH_URLS) {
    try {
      const client = await connectHttpMcp(url, timeoutMs);
      return client;
    } catch {
      // Fall back to built-in web search
    }
  }
  // Avoid hammering unavailable endpoints on every request (10 min cooldown)
  parallelUnavailableUntil = Date.now() + 10 * 60 * 1000;
  return null;
}

function formatMcpResult(res: any): any {
  if (!res) return { result: 'empty' };
  if (Array.isArray(res.content)) {
    const textParts = res.content
      .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
      .map((c: any) => c.text);
    if (textParts.length > 0) {
      return textParts.join('\n\n');
    }
  }
  return res;
}

function stripHtmlToText(html: string, maxLen = 12000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

async function fallbackWebSearch(query: string): Promise<string> {
  const encoded = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    const results: string[] = [];
    const snippetRegex =
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)?/gi;
    let match: RegExpExecArray | null;
    while ((match = snippetRegex.exec(html)) !== null && results.length < 8) {
      const rawHref = match[1] || '';
      const title = stripHtmlToText(match[2] || '', 300);
      const snippet = stripHtmlToText(match[3] || match[4] || '', 500);
      let cleanUrl = rawHref;
      const uddgMatch = rawHref.match(/[?&]uddg=([^&]+)/);
      if (uddgMatch) {
        try {
          cleanUrl = decodeURIComponent(uddgMatch[1]);
        } catch {}
      }
      if (title) {
        results.push(`- ${title}\n  URL: ${cleanUrl}\n  ${snippet}`);
      }
    }
    if (results.length > 0) {
      return `Результаты поиска по запросу "${query}":\n\n${results.join('\n\n')}`;
    }
    const plain = stripHtmlToText(html, 4000);
    return plain || `По запросу "${query}" ничего не найдено.`;
  } finally {
    clearTimeout(timer);
  }
}

async function fallbackWebFetch(targetUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    return stripHtmlToText(text, 12000);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadMcpToolsForChat(options: {
  includeParallelSearch: boolean;
  userServers: McpServerConfig[];
  existingToolNames: Set<string>;
  recordToolStart: (toolName: string, args: Record<string, any>) => ToolInvocationRecord;
  recordToolFinish: (
    invocation: ToolInvocationRecord,
    state: 'completed' | 'error',
    result?: string
  ) => void;
}): Promise<{
  tools: Record<string, any>;
  cleanup: () => Promise<void>;
}> {
  const activeClients: Client[] = [];
  const tools: Record<string, any> = {};

  const enabledServers = (options.userServers || []).filter((s) => s.enabled);

  const registerClientTools = async (
    client: Client,
    serverLabel: string,
    preferExactName: boolean
  ) => {
    const listed = await withTimeout(client.listTools(), 4000, serverLabel);
    for (const mcpTool of listed.tools || []) {
      const baseName = mcpTool.name;
      const toolKey =
        preferExactName && !options.existingToolNames.has(baseName) && !tools[baseName]
          ? baseName
          : !options.existingToolNames.has(baseName) && !tools[baseName]
            ? baseName
            : `${serverLabel.replace(/[^a-zA-Z0-9_]/g, '_')}_${baseName}`;

      const schemaObj =
        mcpTool.inputSchema && typeof mcpTool.inputSchema === 'object'
          ? mcpTool.inputSchema
          : { type: 'object', properties: {} };

      tools[toolKey] = tool({
        description: mcpTool.description || `MCP tool ${baseName} (${serverLabel})`,
        inputSchema: jsonSchema(schemaObj as any),
        execute: async (args: Record<string, any>) => {
          const inv = options.recordToolStart(baseName, args || {});
          try {
            const callRes = await client.callTool({
              name: baseName,
              arguments: args || {},
            });
            const formatted = formatMcpResult(callRes);
            const summary =
              typeof formatted === 'string'
                ? formatted.slice(0, 180)
                : 'Выполнено';
            options.recordToolFinish(inv, callRes?.isError ? 'error' : 'completed', summary);
            return formatted;
          } catch (err: any) {
            options.recordToolFinish(inv, 'error', err?.message || 'Ошибка вызова MCP');
            return { error: err?.message || 'MCP tool call failed' };
          }
        },
      });
    }
  };

  if (options.includeParallelSearch) {
    // Register web_search and web_fetch tools so they are always available in the tool pool.
    // When invoked, they attempt Parallel Search MCP first and fall back to HTTP search/fetch or terminal curl advice.
    let parallelClient: Client | null = null;
    let parallelConnectAttempted = false;

    const getParallelClient = async (): Promise<Client | null> => {
      if (parallelConnectAttempted) return parallelClient;
      parallelConnectAttempted = true;
      parallelClient = await connectParallelSearch(2500);
      if (parallelClient) {
        activeClients.push(parallelClient);
      }
      return parallelClient;
    };

    if (!options.existingToolNames.has('web_search')) {
      tools.web_search = tool({
        description:
          'Поиск актуальной информации в интернете (Parallel Search MCP с автоматическим фолбэком). Возвращает найденные страницы и сниппеты.',
        inputSchema: z.object({
          query: z.string().describe('Поисковый запрос'),
        }),
        execute: async ({ query }) => {
          const cleanQuery = (query || '').trim();
          const inv = options.recordToolStart('web_search', { query: cleanQuery });
          try {
            const client = await getParallelClient();
            if (client) {
              try {
                const listed = await withTimeout(client.listTools(), 3000, 'parallel_search');
                const searchTool = (listed.tools || []).find(
                  (t) =>
                    t.name === 'web_search' ||
                    t.name.includes('search')
                );
                const toolName = searchTool ? searchTool.name : 'web_search';
                const callRes = await withTimeout(
                  client.callTool({
                    name: toolName,
                    arguments: {
                      query: cleanQuery,
                      objective: cleanQuery,
                      search_queries: [cleanQuery],
                    },
                  }),
                  8000,
                  'parallel_search.web_search'
                );
                if (!callRes?.isError) {
                  const formatted = formatMcpResult(callRes);
                  const summary =
                    typeof formatted === 'string' ? formatted.slice(0, 180) : 'Найдено (MCP)';
                  options.recordToolFinish(inv, 'completed', summary);
                  return formatted;
                }
              } catch {
                // Fallback to direct web search
              }
            }

            const fallbackResult = await fallbackWebSearch(cleanQuery);
            options.recordToolFinish(inv, 'completed', fallbackResult.slice(0, 180));
            return fallbackResult;
          } catch (err: any) {
            const errMsg = err?.message || 'Ошибка веб-поиска';
            options.recordToolFinish(inv, 'error', errMsg);
            return {
              error: `Поиск временно не дал результатов (${errMsg}). Попробуй переформулировать запрос в web_search или открыть конкретный URL через web_fetch.`,
            };
          }
        },
      });
    }

    if (!options.existingToolNames.has('web_fetch')) {
      tools.web_fetch = tool({
        description:
          'Загружает и извлекает текстовое содержимое веб-страницы по URL (Parallel Search MCP с фолбэком).',
        inputSchema: z.object({
          url: z.string().describe('Полный URL страницы (https://...)'),
        }),
        execute: async ({ url }) => {
          const cleanUrl = (url || '').trim();
          const inv = options.recordToolStart('web_fetch', { url: cleanUrl });
          try {
            const client = await getParallelClient();
            if (client) {
              try {
                const listed = await withTimeout(client.listTools(), 3000, 'parallel_search');
                const fetchTool = (listed.tools || []).find(
                  (t) =>
                    t.name === 'web_fetch' ||
                    t.name.includes('fetch') ||
                    t.name.includes('extract')
                );
                if (fetchTool) {
                  const callRes = await withTimeout(
                    client.callTool({
                      name: fetchTool.name,
                      arguments: { url: cleanUrl, urls: [cleanUrl] },
                    }),
                    8000,
                    'parallel_search.web_fetch'
                  );
                  if (!callRes?.isError) {
                    const formatted = formatMcpResult(callRes);
                    const summary =
                      typeof formatted === 'string'
                        ? formatted.slice(0, 180)
                        : 'Страница загружена (MCP)';
                    options.recordToolFinish(inv, 'completed', summary);
                    return formatted;
                  }
                }
              } catch {
                // Fallback to direct web fetch
              }
            }

            const fallbackText = await fallbackWebFetch(cleanUrl);
            options.recordToolFinish(inv, 'completed', fallbackText.slice(0, 180));
            return fallbackText;
          } catch (err: any) {
            const errMsg = err?.message || 'Ошибка загрузки страницы';
            options.recordToolFinish(inv, 'error', errMsg);
            return {
              error: `Не удалось загрузить ${cleanUrl} (${errMsg}). Попробуй другой URL или запрос через web_search.`,
            };
          }
        },
      });
    }
  }

  const tasks: Promise<void>[] = [];
  for (const srv of enabledServers) {
    tasks.push(
      (async () => {
        try {
          const client = await connectMcpServer(srv, 15000);
          activeClients.push(client);
          await registerClientTools(client, srv.name || srv.id, false);
        } catch {
          // Ignore unreachable MCP server during chat tool registration
        }
      })()
    );
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }

  const cleanup = async () => {
    await Promise.allSettled(
      activeClients.map(async (c) => {
        try {
          await c.close();
        } catch {}
      })
    );
  };

  return { tools, cleanup };
}

interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  branch?: string;
  subPath?: string;
  cleanUrl: string;
}

function parseGitHubRepoUrl(rawInput: string): ParsedGitHubRepo | null {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  const treeMatch = trimmed.match(
    /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)\/(?:tree|blob)\/([^/\s]+)\/([^\s#?]+)/i
  );
  if (treeMatch) {
    const owner = treeMatch[1];
    const repo = treeMatch[2].replace(/\.git$/i, '');
    const branch = treeMatch[3];
    const subPath = treeMatch[4].replace(/\/+$/, '').replace(/\/README\.md$/i, '');
    return {
      owner,
      repo,
      branch,
      subPath: subPath || undefined,
      cleanUrl: `https://github.com/${owner}/${repo}`,
    };
  }

  const urlMatch = trimmed.match(
    /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git|\/|#|\?|$)/i
  );
  if (urlMatch) {
    const owner = urlMatch[1];
    const repo = urlMatch[2];
    return {
      owner,
      repo,
      cleanUrl: `https://github.com/${owner}/${repo}`,
    };
  }

  const shortMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shortMatch) {
    const owner = shortMatch[1];
    const repo = shortMatch[2];
    return {
      owner,
      repo,
      cleanUrl: `https://github.com/${owner}/${repo}`,
    };
  }

  return null;
}

async function fetchTextWithTimeout(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 8000
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Phoenix-Agent/0.1.0',
        ...headers,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractQueryKeywords(queryHint?: string): string[] {
  if (!queryHint) return [];
  const stopWords = new Set([
    'mcp',
    'server',
    'сервер',
    'установи',
    'установить',
    'найди',
    'найти',
    'для',
    'пожалуйста',
    'подключи',
    'подключить',
    'github',
    'com',
    'https',
    'http',
    'modelcontextprotocol',
    'servers',
    'вот',
    'ссылка',
    'и',
    'в',
    'на',
    'the',
    'for',
    'and',
    'with',
    'install',
  ]);
  return queryHint
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, ' ')
    .split(/[^a-z0-9а-яё_-]+/i)
    .map((w) => w.replace(/^(mcp[-_]?|server[-_]?)/, '').trim())
    .filter((w) => w.length >= 2 && !stopWords.has(w));
}

async function resolveMonorepoSubPath(
  owner: string,
  repo: string,
  keywords: string[],
  clonedDir: string | null
): Promise<string | undefined> {
  if (keywords.length === 0) return undefined;

  const candidateDirs: string[] = [];

  // 1. Check local cloned monorepo directories (src/*, packages/*)
  if (clonedDir) {
    for (const parent of ['src', 'packages']) {
      const parentPath = path.join(clonedDir, parent);
      if (fs.existsSync(parentPath) && fs.statSync(parentPath).isDirectory()) {
        for (const entry of fs.readdirSync(parentPath)) {
          candidateDirs.push(`${parent}/${entry}`);
        }
      }
    }
  }

  // 2. Check GitHub Contents API for src/ and packages/
  if (candidateDirs.length === 0) {
    for (const parent of ['src', 'packages']) {
      const jsonText = await fetchTextWithTimeout(
        `https://api.github.com/repos/${owner}/${repo}/contents/${parent}`,
        { Accept: 'application/vnd.github+json' },
        5000
      );
      if (jsonText) {
        try {
          const items = JSON.parse(jsonText);
          if (Array.isArray(items)) {
            for (const item of items) {
              if (item?.type === 'dir' && typeof item.path === 'string') {
                candidateDirs.push(item.path);
              }
            }
          }
        } catch {}
      }
    }
  }

  if (candidateDirs.length === 0) return undefined;

  // Score directories against keywords (exact basename match wins)
  let bestPath: string | undefined;
  let bestScore = 0;

  for (const dirPath of candidateDirs) {
    const baseName = path.posix.basename(dirPath).toLowerCase();
    for (const kw of keywords) {
      if (baseName === kw) {
        return dirPath;
      }
      if (baseName.includes(kw) || kw.includes(baseName)) {
        const score = baseName.length;
        if (score > bestScore) {
          bestScore = score;
          bestPath = dirPath;
        }
      }
    }
  }

  return bestPath;
}

async function fetchGitHubReadme(
  owner: string,
  repo: string,
  branch?: string,
  subPath?: string
): Promise<string | null> {
  const cleanSub = subPath ? subPath.replace(/^\/+|\/+$/g, '') : '';
  const refQuery = branch ? `?ref=${encodeURIComponent(branch)}` : '';

  if (cleanSub) {
    const apiSubReadme = await fetchTextWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/contents/${cleanSub}/README.md${refQuery}`,
      { Accept: 'application/vnd.github.raw+json' }
    );
    if (apiSubReadme && apiSubReadme.trim().length > 0) {
      return apiSubReadme;
    }

    const branches = branch ? [branch] : ['HEAD', 'main', 'master'];
    for (const b of branches) {
      for (const fileName of ['README.md', 'readme.md']) {
        const text = await fetchTextWithTimeout(
          `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${cleanSub}/${fileName}`
        );
        if (text && text.trim().length > 0) {
          return text;
        }
      }
    }
    return null;
  }

  // Root README
  const apiReadme = await fetchTextWithTimeout(
    `https://api.github.com/repos/${owner}/${repo}/readme${refQuery}`,
    { Accept: 'application/vnd.github.raw+json' }
  );
  if (apiReadme && apiReadme.trim().length > 0) {
    return apiReadme;
  }

  const branches = branch ? [branch] : ['HEAD', 'main', 'master'];
  for (const b of branches) {
    for (const fileName of ['README.md', 'readme.md']) {
      const text = await fetchTextWithTimeout(
        `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${fileName}`
      );
      if (text && text.trim().length > 0) {
        return text;
      }
    }
  }

  return null;
}

const mcpCommandExtractionSchema = z.object({
  confident: z
    .boolean()
    .describe(
      'true только если в README однозначно определена одна конкретная команда запуска для нужного MCP-сервера; false если команда не найдена или есть несколько разных вариантов без уверенности'
    ),
  serverName: z
    .string()
    .optional()
    .describe('Короткое имя MCP-сервера (например, fetch, filesystem, memory, time)'),
  command: z
    .string()
    .describe('Исполняемая команда запуска (например, npx, uvx, python, python3, docker, node)'),
  args: z
    .array(z.string())
    .describe('Аргументы команды (например, ["-y", "@modelcontextprotocol/server-fetch"] или ["mcp-server-fetch"])'),
  reason: z.string().optional().describe('Краткое пояснение выбора или причины неуверенности'),
});

const AMBIGUOUS_COMMAND_ERROR =
  'Не удалось однозначно определить команду. Пожалуйста, уточните ссылку на конкретный репозиторий или введите команду вручную';

function resolveExtractionModel(explicitModel?: any): any {
  if (explicitModel) return explicitModel;
  const cfg = loadConfig();
  if (!cfg?.apiKey && cfg?.provider !== 'custom') {
    throw new Error(AMBIGUOUS_COMMAND_ERROR);
  }
  const openai = createOpenAI({
    apiKey: cfg?.apiKey || '',
    baseURL: cfg?.apiUrl || DEFAULT_API_URL,
  });
  const modelId = cfg?.defaultModel || cfg?.models?.[0] || DEFAULT_MODEL;
  return openai.chat(modelId);
}

async function extractMcpCommandWithLLM(
  readmeText: string,
  userQuery: string,
  repoLabel: string,
  explicitModel?: any
): Promise<{ command: string; args: string[]; serverName?: string }> {
  if (!readmeText || !readmeText.trim()) {
    throw new Error(AMBIGUOUS_COMMAND_ERROR);
  }

  const model = resolveExtractionModel(explicitModel);
  const clippedReadme = readmeText.slice(0, 28000);

  const { object } = await generateObject({
    model,
    schema: mcpCommandExtractionSchema,
    prompt: [
      'Найди в этом README команду запуска (npx, uvx, python, docker) именно для сервера, который просил пользователь.',
      'Если это монорепозиторий, найди команду, которая относится именно к нужному серверу.',
      'Верни JSON: { confident: boolean, serverName?: string, command: string, args: string[], reason?: string }.',
      'Если подходящей команды нет или в README приведено несколько вариантов для разных серверов и нельзя однозначно выбрать нужный — верни confident: false.',
      '',
      `Запрос пользователя / целевой сервер: ${userQuery || repoLabel}`,
      `Репозиторий / путь: ${repoLabel}`,
      '',
      'Содержимое README.md:',
      clippedReadme,
    ].join('\n'),
  });

  const cleanCmd = (object.command || '').trim();
  const cleanArgs = (object.args || []).map((a) => a.trim()).filter(Boolean);

  if (!object.confident || !cleanCmd || cleanArgs.length === 0) {
    throw new Error(AMBIGUOUS_COMMAND_ERROR);
  }

  // Ensure npx runs non-interactively with -y
  if (cleanCmd.toLowerCase() === 'npx' && !cleanArgs.includes('-y')) {
    cleanArgs.unshift('-y');
  }

  return {
    command: cleanCmd,
    args: cleanArgs,
    serverName: object.serverName?.trim() || undefined,
  };
}

export async function parseMcpServerFromGitHub(
  source: string,
  options?: { cloneRepo?: boolean; query?: string; model?: any }
): Promise<{
  server: McpServerConfig;
  fullCommand: string;
  repoUrl: string;
}> {
  const parsedRepo = parseGitHubRepoUrl(source);
  if (!parsedRepo) {
    throw new Error(
      'Некорректная ссылка на GitHub репозиторий. Укажите ссылку вида https://github.com/owner/repo'
    );
  }

  const { owner, repo, branch, cleanUrl } = parsedRepo;
  let subPath = parsedRepo.subPath;
  let clonedDir: string | null = null;

  if (options?.cloneRepo) {
    try {
      const reposRoot = path.join(getPhoenixDir(), 'mcp-repos');
      if (!fs.existsSync(reposRoot)) {
        fs.mkdirSync(reposRoot, { recursive: true });
      }
      const targetDir = path.join(reposRoot, `${owner}-${repo}`.replace(/[^a-zA-Z0-9_.-]/g, '_'));
      if (!fs.existsSync(targetDir)) {
        await execAsync(`git clone --depth 1 "${cleanUrl}.git" "${targetDir}"`, {
          timeout: 25000,
        });
      }
      if (fs.existsSync(targetDir)) {
        clonedDir = targetDir;
      }
    } catch {
      // Git clone skipped/failed, fallback to API README fetch
    }
  }

  const keywords = extractQueryKeywords(options?.query || source);

  // Monorepo handling: if URL points to root without /tree/.../subpath, try resolving matching subfolder (e.g. src/fetch)
  if (!subPath && keywords.length > 0) {
    subPath = await resolveMonorepoSubPath(owner, repo, keywords, clonedDir);
  }

  let readmeText: string | null = null;

  if (subPath) {
    readmeText = await fetchGitHubReadme(owner, repo, branch, subPath);
    if (!readmeText && clonedDir) {
      for (const candidate of ['README.md', 'readme.md', 'Readme.md']) {
        const p = path.join(clonedDir, subPath, candidate);
        if (fs.existsSync(p)) {
          readmeText = fs.readFileSync(p, 'utf8');
          break;
        }
      }
    }
  } else {
    readmeText = await fetchGitHubReadme(owner, repo, branch);
    if (!readmeText && clonedDir) {
      for (const candidate of ['README.md', 'readme.md', 'Readme.md']) {
        const p = path.join(clonedDir, candidate);
        if (fs.existsSync(p)) {
          readmeText = fs.readFileSync(p, 'utf8');
          break;
        }
      }
    }

    // If root README links to a matching subfolder in a monorepo (e.g. /tree/main/src/fetch or src/fetch), follow that subfolder instead of parsing root README
    if (readmeText && keywords.length > 0) {
      for (const kw of keywords) {
        const linkRe = new RegExp(
          `(?:tree/[^/\\s]+/|\\./)?((?:src|packages)/[^\\s)"'\`]*${kw}[^\\s)"'\`]*)`,
          'i'
        );
        const m = readmeText.match(linkRe);
        if (m && m[1]) {
          const detectedSub = m[1].replace(/\/README\.md$/i, '').replace(/\/+$/, '');
          const subReadme = await fetchGitHubReadme(owner, repo, branch, detectedSub);
          if (subReadme) {
            subPath = detectedSub;
            readmeText = subReadme;
            break;
          }
        }
      }
    }
  }

  if (!readmeText) {
    throw new Error(AMBIGUOUS_COMMAND_ERROR);
  }

  const repoLabel = subPath ? `${owner}/${repo}/${subPath}` : `${owner}/${repo}`;
  const extracted = await extractMcpCommandWithLLM(
    readmeText,
    options?.query || subPath || repo,
    repoLabel,
    options?.model
  );

  const serverSlugSource =
    extracted.serverName || (subPath ? path.posix.basename(subPath) : repo);
  const serverName = serverSlugSource.replace(/[^a-zA-Z0-9_.-]/g, '-');

  const server: McpServerConfig = {
    id: `mcp_${serverName.toLowerCase()}`,
    name: serverName,
    transport: 'stdio',
    command: extracted.command,
    args: extracted.args,
    enabled: true,
  };

  const fullCommand = `${extracted.command} ${extracted.args.join(' ')}`.trim();

  return {
    server,
    fullCommand,
    repoUrl: subPath ? `${cleanUrl}/tree/${branch || 'main'}/${subPath}` : cleanUrl,
  };
}

export async function finalizeMcpInstallation(server: McpServerConfig): Promise<{
  config: PhoenixConfig;
  server: McpServerConfig;
  discoveredTools: string[];
}> {
  const updatedConfig = upsertMcpServerConfig(server);
  const discoveredTools: string[] = [];

  // Restart / test-connect the MCP client so tools are initialized and verified
  try {
    const client = await connectMcpServer(server, 12000);
    try {
      const listed = await withTimeout(client.listTools(), 6000, server.name);
      for (const t of listed.tools || []) {
        if (t?.name) discoveredTools.push(t.name);
      }
      } finally {
        try {
          await client.close();
        } catch {}
      }
    } catch {
      // Server saved to mcp-config.json; initial warm-up optional
    }

  return {
    config: updatedConfig,
    server,
    discoveredTools,
  };
}
