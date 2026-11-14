import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { ensurePhoenixDir, getDbPath } from './config.js';

export interface Chat {
  id: string;
  title: string;
  project_id?: string | null;
  created_at: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ToolInvocationRecord {
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
  state: 'running' | 'completed' | 'error';
  result?: string;
  fileAction?: 'created' | 'updated' | 'deleted';
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export interface ChatAttachment {
  id: string;
  name: string;
  type: 'image' | 'text';
  mimeType: string;
  size: number;
  dataUrl?: string;
  content?: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatAttachment[];
  model?: string | null;
  usage?: TokenUsage;
  created_at: number;
  project_id?: string | null;
  tool_invocations?: ToolInvocationRecord[];
  has_undoable_changes?: boolean;
  changes_undone?: boolean;
}

export interface FileSnapshot {
  id: string;
  message_id: string;
  project_id: string;
  file_path: string;
  existed: number;
  previous_content: string | null;
  restored: number;
  created_at: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  directory_path: string;
  created_at: number;
}

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    ensurePhoenixDir();
    const dbPath = getDbPath();
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');

    // Create tables
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        directory_path TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        attachments TEXT,
        model TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        project_id TEXT,
        tool_invocations_json TEXT,
        changes_undone INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS file_snapshots (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        existed INTEGER NOT NULL,
        previous_content TEXT,
        restored INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages (chat_id);
      CREATE INDEX IF NOT EXISTS idx_file_snapshots_message_id ON file_snapshots (message_id);
    `);

    // Migrations for existing databases
    const migrations = [
      `ALTER TABLE chats ADD COLUMN project_id TEXT REFERENCES projects (id) ON DELETE CASCADE;`,
      `ALTER TABLE messages ADD COLUMN project_id TEXT;`,
      `ALTER TABLE messages ADD COLUMN tool_invocations_json TEXT;`,
      `ALTER TABLE messages ADD COLUMN changes_undone INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE messages ADD COLUMN model TEXT;`,
      `ALTER TABLE messages ADD COLUMN prompt_tokens INTEGER;`,
      `ALTER TABLE messages ADD COLUMN completion_tokens INTEGER;`,
      `ALTER TABLE messages ADD COLUMN total_tokens INTEGER;`,
      `ALTER TABLE messages ADD COLUMN attachments TEXT;`,
      `CREATE INDEX IF NOT EXISTS idx_chats_project_id ON chats (project_id);`,
    ];
    for (const sql of migrations) {
      try {
        dbInstance.exec(sql);
      } catch {
        // Column or index already exists
      }
    }
  }
  return dbInstance;
}

export function getAllChats(projectId?: string): Chat[] {
  const db = getDb();
  if (projectId !== undefined) {
    if (projectId === '' || projectId === 'null') {
      const stmt = db.prepare(
        'SELECT id, title, project_id, created_at FROM chats WHERE project_id IS NULL ORDER BY created_at DESC'
      );
      return stmt.all() as Chat[];
    }
    const stmt = db.prepare(
      'SELECT id, title, project_id, created_at FROM chats WHERE project_id = ? ORDER BY created_at DESC'
    );
    return stmt.all(projectId) as Chat[];
  }
  const stmt = db.prepare('SELECT id, title, project_id, created_at FROM chats ORDER BY created_at DESC');
  return stmt.all() as Chat[];
}

export function getChatById(id: string): Chat | undefined {
  const db = getDb();
  const stmt = db.prepare('SELECT id, title, project_id, created_at FROM chats WHERE id = ?');
  return stmt.get(id) as Chat | undefined;
}

export function createChat(title = 'Новый чат', id = crypto.randomUUID(), projectId?: string | null): Chat {
  const db = getDb();
  const now = Date.now();
  const resolvedProjectId = projectId && projectId.trim() ? projectId.trim() : null;
  const stmt = db.prepare('INSERT INTO chats (id, title, project_id, created_at) VALUES (?, ?, ?, ?)');
  stmt.run(id, title, resolvedProjectId, now);
  return { id, title, project_id: resolvedProjectId, created_at: now };
}

export function updateChatTitle(id: string, title: string): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE chats SET title = ? WHERE id = ?');
  stmt.run(title, id);
}

export function deleteChat(id: string): void {
  const db = getDb();
  const deleteMessages = db.prepare('DELETE FROM messages WHERE chat_id = ?');
  const deleteChatStmt = db.prepare('DELETE FROM chats WHERE id = ?');

  const transaction = db.transaction(() => {
    deleteMessages.run(id);
    deleteChatStmt.run(id);
  });

  transaction();
}

function mapMessageRow(row: any): Message {
  let toolInvocations: ToolInvocationRecord[] | undefined;
  if (row.tool_invocations_json) {
    try {
      toolInvocations = JSON.parse(row.tool_invocations_json);
    } catch {
      toolInvocations = undefined;
    }
  }

  let usage: TokenUsage | undefined;
  if (
    typeof row.total_tokens === 'number' ||
    typeof row.prompt_tokens === 'number' ||
    typeof row.completion_tokens === 'number'
  ) {
    const promptTokens = Number(row.prompt_tokens || 0);
    const completionTokens = Number(row.completion_tokens || 0);
    const totalTokens = Number(row.total_tokens || promptTokens + completionTokens);
    if (totalTokens > 0 || promptTokens > 0 || completionTokens > 0) {
      usage = { promptTokens, completionTokens, totalTokens };
    }
  }

  let attachments: ChatAttachment[] | undefined;
  if (row.attachments) {
    try {
      const parsed = JSON.parse(row.attachments);
      if (Array.isArray(parsed) && parsed.length > 0) {
        attachments = parsed;
      }
    } catch {
      attachments = undefined;
    }
  }

  return {
    id: row.id,
    chat_id: row.chat_id,
    role: row.role,
    content: row.content,
    attachments,
    model: row.model || null,
    usage,
    project_id: row.project_id || null,
    created_at: row.created_at,
    tool_invocations: toolInvocations,
    has_undoable_changes: Number(row.snapshot_count) > 0,
    changes_undone: Boolean(row.changes_undone),
  };
}

export function getChatMessages(chatId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        m.id,
        m.chat_id,
        m.role,
        m.content,
        m.attachments,
        m.model,
        m.prompt_tokens,
        m.completion_tokens,
        m.total_tokens,
        m.project_id,
        m.tool_invocations_json,
        m.changes_undone,
        m.created_at,
        (SELECT COUNT(*) FROM file_snapshots fs WHERE fs.message_id = m.id) AS snapshot_count
      FROM messages m
      WHERE m.chat_id = ?
      ORDER BY m.created_at ASC`
    )
    .all(chatId) as any[];

  return rows.map(mapMessageRow);
}

export function editUserMessageAndTruncate(
  chatId: string,
  messageId: string,
  newContent: string
): Message[] | null {
  const db = getDb();
  const target = db
    .prepare(
      `SELECT id, chat_id, role, created_at, rowid FROM messages WHERE id = ? AND chat_id = ?`
    )
    .get(messageId, chatId) as
    | { id: string; chat_id: string; role: string; created_at: number; rowid: number }
    | undefined;

  if (!target) {
    return null;
  }

  const updateStmt = db.prepare(`UPDATE messages SET content = ? WHERE id = ? AND chat_id = ?`);
  const deleteLaterStmt = db.prepare(
    `DELETE FROM messages WHERE chat_id = ? AND (created_at > ? OR (created_at = ? AND rowid > ?))`
  );

  const tx = db.transaction(() => {
    updateStmt.run(newContent, messageId, chatId);
    deleteLaterStmt.run(chatId, target.created_at, target.created_at, target.rowid);
  });

  tx();
  return getChatMessages(chatId);
}

export function getMessageById(messageId: string): Message | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        m.id,
        m.chat_id,
        m.role,
        m.content,
        m.attachments,
        m.model,
        m.prompt_tokens,
        m.completion_tokens,
        m.total_tokens,
        m.project_id,
        m.tool_invocations_json,
        m.changes_undone,
        m.created_at,
        (SELECT COUNT(*) FROM file_snapshots fs WHERE fs.message_id = m.id) AS snapshot_count
      FROM messages m
      WHERE m.id = ?`
    )
    .get(messageId) as any;

  if (!row) return undefined;
  return mapMessageRow(row);
}

export function saveMessage(
  chatId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  options?: {
    id?: string;
    attachments?: ChatAttachment[];
    model?: string | null;
    usage?: TokenUsage;
    projectId?: string | null;
    toolInvocations?: ToolInvocationRecord[];
  }
): Message {
  const db = getDb();
  const id = options?.id || crypto.randomUUID();
  const now = Date.now();
  const attachmentsJson =
    options?.attachments && options.attachments.length > 0
      ? JSON.stringify(options.attachments)
      : null;
  const toolJson =
    options?.toolInvocations && options.toolInvocations.length > 0
      ? JSON.stringify(options.toolInvocations)
      : null;
  const projectId = options?.projectId || null;
  const model = options?.model || null;
  const promptTokens = options?.usage?.promptTokens ?? null;
  const completionTokens = options?.usage?.completionTokens ?? null;
  const totalTokens = options?.usage?.totalTokens ?? null;

  const stmt = db.prepare(
    `INSERT INTO messages (
      id, chat_id, role, content, attachments, model, prompt_tokens, completion_tokens, total_tokens, project_id, tool_invocations_json, changes_undone, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  );
  stmt.run(
    id,
    chatId,
    role,
    content,
    attachmentsJson,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    projectId,
    toolJson,
    now
  );

  const snapshotCountRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM file_snapshots WHERE message_id = ?')
    .get(id) as { cnt: number } | undefined;

  return {
    id,
    chat_id: chatId,
    role,
    content,
    attachments:
      options?.attachments && options.attachments.length > 0
        ? options.attachments
        : undefined,
    model,
    usage: options?.usage,
    project_id: projectId,
    created_at: now,
    tool_invocations: options?.toolInvocations,
    has_undoable_changes: Number(snapshotCountRow?.cnt || 0) > 0,
    changes_undone: false,
  };
}

// --- File Snapshots (Undo System) ---

export function saveFileSnapshot(
  messageId: string,
  projectId: string,
  filePath: string,
  existed: boolean,
  previousContent: string | null
): void {
  const db = getDb();
  const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');

  const existing = db
    .prepare('SELECT id FROM file_snapshots WHERE message_id = ? AND file_path = ?')
    .get(messageId, cleanPath);

  if (existing) {
    return;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO file_snapshots (id, message_id, project_id, file_path, existed, previous_content, restored, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, messageId, projectId, cleanPath, existed ? 1 : 0, previousContent, now);
}

export function getSnapshotsByMessage(messageId: string): FileSnapshot[] {
  const db = getDb();
  return db
    .prepare(
      'SELECT id, message_id, project_id, file_path, existed, previous_content, restored, created_at FROM file_snapshots WHERE message_id = ? ORDER BY created_at DESC'
    )
    .all(messageId) as FileSnapshot[];
}

export function markSnapshotsRestored(messageId: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('UPDATE file_snapshots SET restored = 1 WHERE message_id = ?').run(messageId);
    db.prepare('UPDATE messages SET changes_undone = 1 WHERE id = ?').run(messageId);
  });
  tx();
}

// --- Projects Queries ---

export function getAllProjects(): Project[] {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT id, name, description, directory_path, created_at FROM projects ORDER BY created_at DESC'
  );
  return stmt.all() as Project[];
}

export function getProjectById(id: string): Project | undefined {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT id, name, description, directory_path, created_at FROM projects WHERE id = ?'
  );
  return stmt.get(id) as Project | undefined;
}

export function createProjectRecord(
  id: string,
  name: string,
  description: string,
  directoryPath: string
): Project {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT INTO projects (id, name, description, directory_path, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(id, name, description, directoryPath, now);
  return {
    id,
    name,
    description,
    directory_path: directoryPath,
    created_at: now,
  };
}

export function deleteProjectRecord(id: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const projectChats = db
      .prepare('SELECT id FROM chats WHERE project_id = ?')
      .all(id) as { id: string }[];
    for (const c of projectChats) {
      db.prepare('DELETE FROM messages WHERE chat_id = ?').run(c.id);
    }
    db.prepare('DELETE FROM chats WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM file_snapshots WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  });
  tx();
}
