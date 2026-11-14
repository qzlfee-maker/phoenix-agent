import {
  AppConfig,
  Chat,
  Message,
  Project,
  FileTreeNode,
  ToolInvocation,
  ProjectFileEvent,
  TerminalEvent,
  TokenUsage,
  ChatAttachment,
  ApprovalRequest,
  McpServerConfig,
  BuiltInProviderId,
} from './types.js';

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Failed to fetch config');
  return res.json();
}

export async function updateConfig(data: {
  apiKey?: string;
  apiUrl?: string;
  customUrl?: string;
  provider?: string;
  models?: string[];
  defaultModel?: string;
  contextLimit?: number;
  useDocker?: boolean;
  mcpServers?: McpServerConfig[];
  builtInProviders?: Array<{
    id: BuiltInProviderId;
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    clearKey?: boolean;
    models?: string[];
  }>;
  customProviders?: Array<{
    id: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    clearKey?: boolean;
    models?: string[];
  }>;
}): Promise<AppConfig> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to update config');
  }
  return res.json();
}

export async function stopTerminalProcess(id: string): Promise<{
  success: boolean;
  stopped: boolean;
}> {
  const res = await fetch('/api/terminal/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  return res.json().catch(() => ({ success: false, stopped: false }));
}

export async function installMcpFromUrl(url: string): Promise<{
  success: boolean;
  server: McpServerConfig;
  command: string;
  repoUrl: string;
  discoveredTools: string[];
  mcpServers: McpServerConfig[];
}> {
  const res = await fetch('/api/mcp/install-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(
      data.error || 'Не удалось установить MCP-сервер. Пожалуйста, проверьте ссылку.'
    );
  }
  return data;
}

export interface FetchModelsResponse {
  success: boolean;
  models?: string[];
  error?: string;
}

export async function fetchProviderModels(data: {
  provider: string;
  providerId?: string;
  baseUrl: string;
  apiKey?: string;
}): Promise<FetchModelsResponse> {
  const res = await fetch('/api/config/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchChats(projectId?: string): Promise<Chat[]> {
  const url =
    projectId !== undefined
      ? `/api/chats?project_id=${encodeURIComponent(projectId)}`
      : '/api/chats';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch chats');
  return res.json();
}

export async function createChat(title = 'Новый чат', projectId?: string): Promise<Chat> {
  const res = await fetch('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, project_id: projectId, projectId }),
  });
  if (!res.ok) throw new Error('Failed to create chat');
  return res.json();
}

export async function renameChat(id: string, title: string): Promise<Chat> {
  const res = await fetch(`/api/chats/${id}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to rename chat');
  }
  return res.json();
}

export async function deleteChat(id: string): Promise<void> {
  const res = await fetch(`/api/chats/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete chat');
}

export async function fetchMessages(chatId: string): Promise<Message[]> {
  const res = await fetch(`/api/chats/${chatId}/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

// --- Projects & Workspace File System API ---

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function createProject(data: {
  name: string;
  description?: string;
}): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create project');
  }
  return res.json();
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete project');
}

export async function openProjectFolder(id: string): Promise<{ success: boolean; path?: string }> {
  const res = await fetch(`/api/projects/${id}/open-folder`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось открыть папку проекта');
  }
  return res.json();
}

export async function fetchProjectFiles(projectId: string): Promise<FileTreeNode[]> {
  const res = await fetch(`/api/projects/${projectId}/files`);
  if (!res.ok) throw new Error('Failed to fetch project files');
  const data = await res.json();
  return data.files || [];
}

export async function readProjectFile(
  projectId: string,
  filePath: string
): Promise<{ path: string; content: string; size: number }> {
  const res = await fetch(
    `/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to read file');
  }
  return res.json();
}

export async function saveProjectFile(
  projectId: string,
  filePath: string,
  content: string
): Promise<{ success: boolean; path: string }> {
  const res = await fetch(`/api/projects/${projectId}/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save file');
  }
  return res.json();
}

export async function deleteProjectFile(
  projectId: string,
  filePath: string
): Promise<{ success: boolean; path: string }> {
  const res = await fetch(
    `/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`,
    {
      method: 'DELETE',
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось удалить файл');
  }
  return res.json();
}

export async function uploadProjectFiles(
  projectId: string,
  files: FileList | File[]
): Promise<{ success: boolean; uploaded: string[] }> {
  const formData = new FormData();
  const fileArray = Array.from(files);
  for (const file of fileArray) {
    formData.append('file', file, file.name);
  }

  const res = await fetch(`/api/projects/${projectId}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to upload files');
  }
  return res.json();
}

export async function undoProjectChanges(
  projectId: string,
  messageId: string
): Promise<{
  success: boolean;
  restoredFiles: { path: string; action: 'restored' | 'deleted' }[];
  message?: Message;
}> {
  const res = await fetch(`/api/projects/${projectId}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось отменить изменения');
  }
  return res.json();
}

export async function approveToolExecution(
  approvalId: string,
  approved: boolean
): Promise<void> {
  const res = await fetch('/api/chat/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalId, approved }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send approval');
  }
}

export async function editChatMessage(
  chatId: string,
  messageId: string,
  content: string
): Promise<{ success: boolean; messages: Message[] }> {
  const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось отредактировать сообщение');
  }
  return res.json();
}

export interface StreamChatOptions {
  chatId: string;
  content: string;
  attachments?: ChatAttachment[];
  model?: string;
  providerId?: string;
  projectId?: string;
  fullAccess?: boolean;
  skipUserSave?: boolean;
  userMessageId?: string;
  onChunk: (chunk: string) => void;
  onToolInvocation?: (invocation: ToolInvocation) => void;
  onFileEvent?: (fileEvent: ProjectFileEvent) => void;
  onTerminalEvent?: (terminalEvent: TerminalEvent) => void;
  onRequireApproval?: (approval: ApprovalRequest) => void;
  onUsage?: (usage: TokenUsage) => void;
  onDone: (message: Message) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

export async function streamChat({
  chatId,
  content,
  attachments,
  model,
  providerId,
  projectId,
  fullAccess,
  skipUserSave,
  userMessageId,
  onChunk,
  onToolInvocation,
  onFileEvent,
  onTerminalEvent,
  onRequireApproval,
  onUsage,
  onDone,
  onError,
  signal,
}: StreamChatOptions): Promise<void> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        content,
        attachments,
        model,
        providerId,
        projectId,
        fullAccess,
        skipUserSave,
        userMessageId,
      }),
      signal,
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Server error (${res.status})`);
    }

    if (!res.body) {
      throw new Error('ReadableStream not supported on this response');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.error) {
              onError(data.error);
              return;
            }
            if (data.toolInvocation && onToolInvocation) {
              onToolInvocation(data.toolInvocation);
            }
            if (data.fileEvent && onFileEvent) {
              onFileEvent(data.fileEvent);
            }
            if (data.terminalEvent && onTerminalEvent) {
              onTerminalEvent(data.terminalEvent);
            }
            if (data.require_approval && onRequireApproval) {
              onRequireApproval(data.require_approval);
            }
            if (data.usage && onUsage) {
              onUsage(data.usage);
            }
            if (data.chunk) {
              onChunk(data.chunk);
            }
            if (data.done && data.message) {
              onDone(data.message);
              return;
            }
          } catch {
            // Ignore parse errors on partial chunks
          }
        }
      }
    }
  } catch (err: any) {
    if (signal?.aborted) {
      return;
    }
    onError(err?.message || 'Connection error while streaming');
  }
}
