import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'coverage',
  '.DS_Store',
  '__pycache__',
  '.venv',
  'venv',
]);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.h', '.hpp',
  '.vue', '.svelte', '.php', '.rb', '.kt', '.swift',
]);

const MAP_EXTRA_EXTENSIONS = new Set([
  ...CODE_EXTENSIONS,
  '.html', '.css', '.scss', '.sql', '.json', '.md',
]);

const TEXT_SEARCH_EXTENSIONS = new Set([
  ...MAP_EXTRA_EXTENSIONS,
  '.txt', '.yaml', '.yml', '.toml', '.ini', '.env', '.sh', '.bash', '.xml',
]);

// In-memory Repo Map cache keyed by resolved project directory path
const repoMapCache = new Map<string, string>();

export function invalidateRepoMapCache(projectPath: string): void {
  const key = path.resolve(projectPath);
  repoMapCache.delete(key);
}

interface CollectedFile {
  relPath: string;
  absPath: string;
  depth: number;
  priority: number;
}

function getFilePriority(relPath: string): number {
  const lower = relPath.toLowerCase();
  const ext = path.extname(lower);
  if (lower === 'package.json' || lower === 'tsconfig.json' || lower === 'readme.md') {
    return 0;
  }
  if (/^(src|app|server|lib|components|pages|routes|api)\//i.test(lower)) {
    return CODE_EXTENSIONS.has(ext) ? 1 : 2;
  }
  if (CODE_EXTENSIONS.has(ext)) {
    return 2;
  }
  return 3;
}

function collectProjectFiles(
  rootDir: string,
  allowedExts: Set<string>,
  currentRel = '',
  depth = 0,
  out: CollectedFile[] = []
): CollectedFile[] {
  const absDir = currentRel ? path.join(rootDir, currentRel) : rootDir;
  if (!fs.existsSync(absDir)) return out;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.git')) {
      continue;
    }

    const relPath = currentRel ? `${currentRel}/${entry.name}` : entry.name;
    const absPath = path.join(absDir, entry.name);

    if (entry.isDirectory()) {
      collectProjectFiles(rootDir, allowedExts, relPath, depth + 1, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (allowedExts.has(ext)) {
        out.push({
          relPath,
          absPath,
          depth,
          priority: getFilePriority(relPath),
        });
      }
    }
  }

  return out;
}

function extractSymbols(content: string, ext: string): {
  exports: string[];
  imports: string[];
} {
  const exportsSet = new Set<string>();
  const importsSet = new Set<string>();

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'].includes(ext)) {
    // Named exports: export function/class/const/let/var/type/interface/enum Name
    const declExportRe =
      /export\s+(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
    let m: RegExpExecArray | null;
    while ((m = declExportRe.exec(content)) !== null) {
      exportsSet.add(m[1]);
    }

    // export default (function|class)? Name
    const defaultExportRe = /export\s+default\s+(?:(?:async\s+)?(?:function|class)\s+)?([A-Za-z_$][\w$]*)/g;
    while ((m = defaultExportRe.exec(content)) !== null) {
      if (m[1] !== 'function' && m[1] !== 'class') {
        exportsSet.add(m[1]);
      } else {
        exportsSet.add('default');
      }
    }

    // export { a, b as c }
    const braceExportRe = /export\s*\{([^}]+)\}/g;
    while ((m = braceExportRe.exec(content)) !== null) {
      for (const part of m[1].split(',')) {
        const cleaned = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (cleaned && /^[A-Za-z_$][\w$]*$/.test(cleaned)) {
          exportsSet.add(cleaned);
        }
      }
    }

    // ES imports: import ... from '...' or import '...'
    const importRe = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    while ((m = importRe.exec(content)) !== null) {
      importsSet.add(m[1]);
    }

    // CommonJS require('...')
    const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = requireRe.exec(content)) !== null) {
      importsSet.add(m[1]);
    }
  } else if (ext === '.py') {
    const pyDefRe = /^(?:def|async\s+def|class)\s+([A-Za-z_]\w*)/gm;
    let m: RegExpExecArray | null;
    while ((m = pyDefRe.exec(content)) !== null) {
      if (!m[1].startsWith('_')) {
        exportsSet.add(m[1]);
      }
    }

    const pyImportRe = /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
    while ((m = pyImportRe.exec(content)) !== null) {
      importsSet.add(m[1] || m[2]);
    }
  } else if (ext === '.go') {
    const goExportRe = /^(?:func(?:\s*\([^)]*\))?|type)\s+([A-Z]\w*)/gm;
    let m: RegExpExecArray | null;
    while ((m = goExportRe.exec(content)) !== null) {
      exportsSet.add(m[1]);
    }
  } else if (ext === '.rs') {
    const rsPubRe = /pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const)\s+([A-Za-z_]\w*)/g;
    let m: RegExpExecArray | null;
    while ((m = rsPubRe.exec(content)) !== null) {
      exportsSet.add(m[1]);
    }
  }

  return {
    exports: Array.from(exportsSet).slice(0, 15),
    imports: Array.from(importsSet).slice(0, 12),
  };
}

/**
 * Generates a compact Repo Map for a project directory and caches it in memory.
 */
export function generateRepoMap(
  projectPath: string,
  options?: { maxFiles?: number; maxChars?: number }
): string {
  const normalizedRoot = path.resolve(projectPath);
  const cached = repoMapCache.get(normalizedRoot);
  if (cached !== undefined) {
    return cached;
  }

  const maxFiles = options?.maxFiles ?? 120;
  const maxChars = options?.maxChars ?? 12000;

  const files = collectProjectFiles(normalizedRoot, MAP_EXTRA_EXTENSIONS);
  files.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.relPath.localeCompare(b.relPath);
  });

  const selected = files.slice(0, maxFiles);
  const lines: string[] = [];
  let totalChars = 0;

  for (const file of selected) {
    let line = file.relPath;
    const ext = path.extname(file.relPath).toLowerCase();

    try {
      const stat = fs.statSync(file.absPath);
      if (stat.size <= 256 * 1024 && CODE_EXTENSIONS.has(ext)) {
        const content = fs.readFileSync(file.absPath, 'utf8');
        const { exports: exps, imports: imps } = extractSymbols(content, ext);
        line = `${file.relPath}: exports [${exps.join(', ')}] -> imports [${imps.join(', ')}]`;
      }
    } catch {
      // Fall back to file path only
    }

    if (totalChars + line.length + 1 > maxChars) {
      lines.push(`... (ещё файлов: ${files.length - lines.length})`);
      break;
    }

    lines.push(line);
    totalChars += line.length + 1;
  }

  const result =
    lines.length > 0 ? lines.join('\n') : '(Проект пока пуст — файлов кода не найдено)';
  repoMapCache.set(normalizedRoot, result);
  return result;
}

export interface CodeSearchMatch {
  file: string;
  line: number;
  context: string;
}

/**
 * Performs a case-insensitive grep across project code files and returns matching lines with 3 lines of context.
 */
export function searchCodebase(
  projectPath: string,
  query: string,
  options?: { maxMatches?: number }
): { matches: CodeSearchMatch[]; totalMatches: number; truncated: boolean } {
  const normalizedRoot = path.resolve(projectPath);
  const needle = (query || '').trim().toLowerCase();
  if (!needle) {
    return { matches: [], totalMatches: 0, truncated: false };
  }

  const maxMatches = options?.maxMatches ?? 25;
  const files = collectProjectFiles(normalizedRoot, TEXT_SEARCH_EXTENSIONS);
  files.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.relPath.localeCompare(b.relPath);
  });

  const matches: CodeSearchMatch[] = [];
  let totalMatches = 0;

  for (const file of files) {
    let content: string;
    try {
      const stat = fs.statSync(file.absPath);
      if (stat.size > 512 * 1024) continue;
      content = fs.readFileSync(file.absPath, 'utf8');
    } catch {
      continue;
    }

    if (!content.toLowerCase().includes(needle)) {
      continue;
    }

    const fileLines = content.split(/\r?\n/);
    for (let i = 0; i < fileLines.length; i++) {
      if (fileLines[i].toLowerCase().includes(needle)) {
        totalMatches++;
        if (matches.length < maxMatches) {
          const start = Math.max(0, i - 1);
          const end = Math.min(fileLines.length - 1, i + 1);
          const snippetLines: string[] = [];
          for (let j = start; j <= end; j++) {
            const marker = j === i ? '>' : ' ';
            snippetLines.push(`${marker} ${j + 1}: ${fileLines[j]}`);
          }
          matches.push({
            file: file.relPath,
            line: i + 1,
            context: snippetLines.join('\n'),
          });
        }
      }
    }
  }

  return {
    matches,
    totalMatches,
    truncated: totalMatches > maxMatches,
  };
}
