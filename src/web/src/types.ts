export type ProviderId = 'openai' | 'anthropic' | 'openrouter' | 'gemini' | 'custom';

export interface ProviderOption {
  id: ProviderId;
  name: string;
  tagline: string;
  defaultUrl: string;
  keyPlaceholder: string;
  hint?: string;
}

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

export interface ToolInvocation {
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

export interface TerminalLogItem {
  id: string;
  projectId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  status: 'running' | 'completed' | 'error';
  timestamp: number;
}

export interface TerminalEvent {
  type: 'terminal_start' | 'terminal_output' | 'terminal_exit';
  id: string;
  projectId: string;
  command?: string;
  stream?: 'stdout' | 'stderr';
  chunk?: string;
  exitCode?: number;
  status?: 'running' | 'completed' | 'error';
  timestamp: number;
}

export interface ProjectFileEvent {
  type: 'file_created' | 'file_updated' | 'file_deleted';
  projectId: string;
  path: string;
  timestamp: number;
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

export interface ApprovalRequest {
  approvalId: string;
  action: string;
  path: string;
  inline?: boolean;
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
  tool_invocations?: ToolInvocation[];
  has_undoable_changes?: boolean;
  changes_undone?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  directory_path: string;
  created_at: number;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
}

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
}

export type BuiltInProviderId = 'openai' | 'openrouter' | 'gemini';

export interface BuiltInProviderItem {
  id: BuiltInProviderId;
  name: string;
  baseUrl: string;
  hasKey: boolean;
  models: string[];
  apiKey?: string;
  clearKey?: boolean;
}

export interface CustomProviderItem {
  id: string;
  name: string;
  baseUrl: string;
  hasKey: boolean;
  models: string[];
  apiKey?: string;
  clearKey?: boolean;
}

export interface AppConfig {
  isConfigured: boolean;
  provider?: ProviderId;
  apiUrl: string;
  customUrl?: string;
  models: string[];
  defaultModel?: string;
  contextLimit?: number;
  useDocker?: boolean;
  mcpServers?: McpServerConfig[];
  builtInProviders?: BuiltInProviderItem[];
  customProviders?: CustomProviderItem[];
}
