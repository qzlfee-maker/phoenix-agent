import fs from 'node:fs';
import path from 'node:path';
import { getPhoenixDir } from './config.js';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
}

const IGNORED_DIRS = new Set(['node_modules', '.git', '.DS_Store']);

export class PathTraversalError extends Error {
  statusCode = 403;
  constructor(message = 'Access denied: Path traversal detected') {
    super(message);
    this.name = 'PathTraversalError';
  }
}

export function getProjectsBaseDir(): string {
  const dir = path.join(getPhoenixDir(), 'projects');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function ensureProjectDirectory(projectId: string): string {
  // Sanitize projectId to prevent any path manipulation
  const safeId = path.basename(projectId);
  const projectDir = path.resolve(getProjectsBaseDir(), safeId);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  return projectDir;
}

/**
 * Safely resolves a relative path inside a project directory.
 * Throws PathTraversalError if the resolved path escapes the project root.
 */
export function resolveSafeProjectPath(projectDir: string, relativeFilePath: string): string {
  if (!relativeFilePath || typeof relativeFilePath !== 'string' || relativeFilePath.includes('\0')) {
    throw new PathTraversalError('Доступ запрещен');
  }

  const trimmed = relativeFilePath.trim();
  // Block any absolute paths (Windows drive letters, UNC paths, or leading slashes)
  if (
    path.isAbsolute(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    /^[a-zA-Z]:/.test(trimmed)
  ) {
    throw new PathTraversalError('Доступ запрещен');
  }

  const normalizedRoot = path.resolve(projectDir);
  const resolvedTarget = path.resolve(normalizedRoot, trimmed);

  const relFromRoot = path.relative(normalizedRoot, resolvedTarget);
  if (
    relFromRoot.startsWith('..') ||
    path.isAbsolute(relFromRoot) ||
    resolvedTarget === normalizedRoot
  ) {
    throw new PathTraversalError('Доступ запрещен');
  }

  return resolvedTarget;
}

export function buildFileTree(projectDir: string, currentRelDir = ''): FileTreeNode[] {
  const normalizedRoot = path.resolve(projectDir);
  const currentAbsDir = currentRelDir
    ? resolveSafeProjectPath(normalizedRoot, currentRelDir)
    : normalizedRoot;

  if (!fs.existsSync(currentAbsDir)) {
    return [];
  }

  const entries = fs.readdirSync(currentAbsDir, { withFileTypes: true });
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const relPath = currentRelDir ? `${currentRelDir}/${entry.name}` : entry.name;
    const absPath = path.join(currentAbsDir, entry.name);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'directory',
        children: buildFileTree(normalizedRoot, relPath),
      });
    } else if (entry.isFile()) {
      const stat = fs.statSync(absPath);
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'file',
        size: stat.size,
      });
    }
  }

  // Sort directories first, then files alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export function readProjectFile(projectDir: string, relativeFilePath: string): {
  content: string;
  size: number;
} {
  const targetPath = resolveSafeProjectPath(projectDir, relativeFilePath);
  if (!fs.existsSync(targetPath)) {
    const err = new Error('File not found') as any;
    err.statusCode = 404;
    throw err;
  }

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const err = new Error('Cannot read a directory as a file') as any;
    err.statusCode = 400;
    throw err;
  }

  const content = fs.readFileSync(targetPath, 'utf8');
  return { content, size: stat.size };
}

export function writeProjectFile(
  projectDir: string,
  relativeFilePath: string,
  content: string
): void {
  const targetPath = resolveSafeProjectPath(projectDir, relativeFilePath);
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  fs.writeFileSync(targetPath, content, 'utf8');
}

export function projectFileExists(projectDir: string, relativeFilePath: string): boolean {
  const targetPath = resolveSafeProjectPath(projectDir, relativeFilePath);
  return fs.existsSync(targetPath) && fs.statSync(targetPath).isFile();
}

export function deleteProjectFile(projectDir: string, relativeFilePath: string): void {
  const targetPath = resolveSafeProjectPath(projectDir, relativeFilePath);
  if (!fs.existsSync(targetPath)) {
    const err = new Error('File not found') as any;
    err.statusCode = 404;
    throw err;
  }

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const err = new Error('Cannot delete a directory with delete_file') as any;
    err.statusCode = 400;
    throw err;
  }

  fs.unlinkSync(targetPath);
}

export function removeProjectDirectory(projectDir: string): void {
  const normalizedBase = path.resolve(getProjectsBaseDir());
  const normalizedTarget = path.resolve(projectDir);
  const rel = path.relative(normalizedBase, normalizedTarget);

  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(normalizedTarget)) {
    fs.rmSync(normalizedTarget, { recursive: true, force: true });
  }
}
