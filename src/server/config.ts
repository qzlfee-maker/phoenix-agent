import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

export interface BuiltInProviderConfig {
  id: BuiltInProviderId;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models?: string[];
}

export interface CustomProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models?: string[];
}

export const DEFAULT_BUILT_IN_PROVIDERS: BuiltInProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: [],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    models: [],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: '',
    models: [],
  },
];

export interface PhoenixConfig {
  apiKey: string;
  apiUrl: string;
  models: string[];
  defaultModel?: string;
  provider?: string;
  customUrl?: string;
  contextLimit?: number;
  useDocker?: boolean;
  mcpServers?: McpServerConfig[];
  builtInProviders?: BuiltInProviderConfig[];
  customProviders?: CustomProviderConfig[];
}

export const DEFAULT_API_URL = 'https://api.openai.com/v1';
export const DEFAULT_MODEL = 'gpt-4o';
export const DEFAULT_CONTEXT_LIMIT = 128000;

export function getPhoenixDir(): string {
  return path.join(os.homedir(), '.phoenix');
}

export function getConfigPath(): string {
  return path.join(getPhoenixDir(), 'config.json');
}

export function getMcpConfigPath(): string {
  return path.join(getPhoenixDir(), 'mcp-config.json');
}

export function getDbPath(): string {
  const dir = getPhoenixDir();
  const newDbPath = path.join(dir, 'phoenix.db');
  const legacyDbPath = path.join(dir, 'data.db');
  try {
    if (!fs.existsSync(newDbPath) && fs.existsSync(legacyDbPath)) {
      fs.copyFileSync(legacyDbPath, newDbPath);
    }
  } catch {
    // Ignore migration copy errors
  }
  return newDbPath;
}

export function ensurePhoenixDir(): void {
  const dir = getPhoenixDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'projects'), { recursive: true });
}

export function loadMcpConfigFile(): McpServerConfig[] {
  try {
    const mcpPath = getMcpConfigPath();
    if (!fs.existsSync(mcpPath)) {
      return [];
    }
    const raw = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    if (Array.isArray(raw)) {
      return raw;
    }
    if (Array.isArray(raw?.servers)) {
      return raw.servers;
    }
    if (Array.isArray(raw?.mcpServers)) {
      return raw.mcpServers;
    }
    if (raw?.mcpServers && typeof raw.mcpServers === 'object') {
      return Object.entries(raw.mcpServers).map(([name, val]: [string, any]) => ({
        id: val?.id || `mcp_${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        name,
        transport: val?.url ? 'http' : 'stdio',
        command: val?.command,
        args: Array.isArray(val?.args) ? val.args : [],
        url: val?.url,
        enabled: val?.enabled !== false,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export function saveMcpConfigFile(servers: McpServerConfig[]): void {
  try {
    ensurePhoenixDir();
    const mcpServersMap: Record<string, any> = {};
    for (const s of servers) {
      if (s.transport === 'http') {
        mcpServersMap[s.name] = {
          id: s.id,
          transport: 'http',
          url: s.url,
          enabled: s.enabled,
        };
      } else {
        mcpServersMap[s.name] = {
          id: s.id,
          transport: 'stdio',
          command: s.command,
          args: s.args || [],
          enabled: s.enabled,
        };
      }
    }
    fs.writeFileSync(
      getMcpConfigPath(),
      JSON.stringify({ servers, mcpServers: mcpServersMap }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('Failed to write mcp-config.json:', err);
  }
}

export function loadConfig(): PhoenixConfig | null {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const data = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(data) as any;

    // Backward compatibility: migrate legacy single `model` string to `models` array
    let models: string[] = [];
    if (Array.isArray(parsed.models)) {
      models = parsed.models
        .map((m: any) => (typeof m === 'string' ? m.trim() : ''))
        .filter((m: string) => m.length > 0);
    } else if (typeof parsed.model === 'string' && parsed.model.trim().length > 0) {
      models = [parsed.model.trim()];
    }

    const defaultModel =
      typeof parsed.defaultModel === 'string' && parsed.defaultModel.trim().length > 0
        ? parsed.defaultModel.trim()
        : models[0] || DEFAULT_MODEL;

    const contextLimit =
      typeof parsed.contextLimit === 'number' && parsed.contextLimit > 0
        ? parsed.contextLimit
        : DEFAULT_CONTEXT_LIMIT;

    const fileMcpServers = loadMcpConfigFile();
    const hasConfigMcpArray = Array.isArray(parsed.mcpServers);
    const mergedMcpServers: McpServerConfig[] = hasConfigMcpArray
      ? parsed.mcpServers
      : fileMcpServers;

    const legacyApiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
    const legacyApiUrl = (parsed.apiUrl || parsed.baseURL || DEFAULT_API_URL).trim();
    const legacyProvider = typeof parsed.provider === 'string' ? parsed.provider : 'openai';

    // Hydrate builtInProviders (always present in system, inactive until apiKey is set)
    const rawBuiltIn: any[] = Array.isArray(parsed.builtInProviders) ? parsed.builtInProviders : [];
    const builtInProviders: BuiltInProviderConfig[] = DEFAULT_BUILT_IN_PROVIDERS.map((def) => {
      const savedEntry = rawBuiltIn.find((b) => b?.id === def.id);
      const savedKey = typeof savedEntry?.apiKey === 'string' ? savedEntry.apiKey.trim() : '';
      const savedModels = Array.isArray(savedEntry?.models)
        ? savedEntry.models.filter((m: any) => typeof m === 'string' && m.trim().length > 0)
        : [];
      const shouldMigrateLegacy =
        !Array.isArray(parsed.builtInProviders) && legacyProvider === def.id && legacyApiKey.length > 0;

      return {
        id: def.id,
        name: def.name,
        baseUrl: (savedEntry?.baseUrl || def.baseUrl).trim(),
        apiKey: shouldMigrateLegacy ? legacyApiKey : savedKey,
        models: shouldMigrateLegacy && savedModels.length === 0 ? models : savedModels,
      };
    });

    // Hydrate customProviders (unlimited user-defined providers)
    let customProviders: CustomProviderConfig[] = [];
    if (Array.isArray(parsed.customProviders)) {
      customProviders = parsed.customProviders
        .filter((c: any) => c && typeof c.name === 'string' && typeof c.baseUrl === 'string')
        .map((c: any) => ({
          id: String(c.id || `custom_${Date.now()}`),
          name: c.name.trim(),
          baseUrl: c.baseUrl.trim(),
          apiKey: typeof c.apiKey === 'string' ? c.apiKey.trim() : '',
          models: Array.isArray(c.models)
            ? c.models.filter((m: any) => typeof m === 'string' && m.trim().length > 0)
            : [],
        }));
    } else if (legacyProvider === 'custom' && legacyApiUrl) {
      customProviders = [
        {
          id: 'custom-default',
          name: 'Custom / Local',
          baseUrl: legacyApiUrl,
          apiKey: legacyApiKey,
          models,
        },
      ];
    }

    return {
      apiKey: legacyApiKey,
      apiUrl: legacyApiUrl,
      models,
      defaultModel,
      provider: parsed.provider,
      customUrl: parsed.customUrl,
      contextLimit,
      useDocker: typeof parsed.useDocker === 'boolean' ? parsed.useDocker : false,
      mcpServers: mergedMcpServers,
      builtInProviders,
      customProviders,
    };
  } catch (error) {
    console.error('Failed to read config file:', error);
    return null;
  }
}

export function saveConfig(config: Partial<PhoenixConfig> & { model?: string }): PhoenixConfig {
  ensurePhoenixDir();
  const current = loadConfig() || {
    apiKey: '',
    apiUrl: DEFAULT_API_URL,
    models: [],
    defaultModel: DEFAULT_MODEL,
    contextLimit: DEFAULT_CONTEXT_LIMIT,
  };

  let models = current.models;
  if (Array.isArray(config.models)) {
    models = Array.from(
      new Set(
        config.models
          .map((m) => (typeof m === 'string' ? m.trim() : ''))
          .filter((m) => m.length > 0)
      )
    );
  } else if (typeof config.model === 'string' && config.model.trim().length > 0) {
    models = [config.model.trim()];
  }

  const contextLimit =
    typeof config.contextLimit === 'number' && config.contextLimit > 0
      ? config.contextLimit
      : current.contextLimit || DEFAULT_CONTEXT_LIMIT;

  const existingBuiltIn = current.builtInProviders || DEFAULT_BUILT_IN_PROVIDERS;
  let builtInProviders: BuiltInProviderConfig[] = existingBuiltIn;
  if (Array.isArray(config.builtInProviders)) {
    builtInProviders = DEFAULT_BUILT_IN_PROVIDERS.map((def) => {
      const prev = existingBuiltIn.find((b) => b.id === def.id);
      const incoming = config.builtInProviders!.find((b: any) => b?.id === def.id) as any;
      if (!incoming) {
        return prev || def;
      }
      const nextKey =
        incoming.clearKey === true
          ? ''
          : typeof incoming.apiKey === 'string' && incoming.apiKey.trim() !== ''
            ? incoming.apiKey.trim()
            : prev?.apiKey || '';
      const nextModels: string[] = Array.isArray(incoming.models)
        ? Array.from<string>(
            new Set<string>(
              incoming.models
                .map((m: any) => (typeof m === 'string' ? m.trim() : ''))
                .filter((m: string) => m.length > 0)
            )
          )
        : prev?.models || [];
      return {
        id: def.id,
        name: def.name,
        baseUrl: (incoming.baseUrl || prev?.baseUrl || def.baseUrl).trim(),
        apiKey: nextKey,
        models: nextModels,
      };
    });
  }

  const existingCustom = current.customProviders || [];
  let customProviders: CustomProviderConfig[] = existingCustom;
  if (Array.isArray(config.customProviders)) {
    customProviders = config.customProviders
      .filter((c: any) => c && typeof c.name === 'string' && c.name.trim() && typeof c.baseUrl === 'string' && c.baseUrl.trim())
      .map((c: any) => {
        const prev = existingCustom.find((e) => e.id === c.id);
        const nextKey =
          c.clearKey === true
            ? ''
            : typeof c.apiKey === 'string' && c.apiKey.trim() !== ''
              ? c.apiKey.trim()
              : prev?.apiKey || '';
        const nextModels: string[] = Array.isArray(c.models)
          ? Array.from<string>(
              new Set<string>(
                c.models
                  .map((m: any) => (typeof m === 'string' ? m.trim() : ''))
                  .filter((m: string) => m.length > 0)
              )
            )
          : prev?.models || [];
        return {
          id: String(c.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
          name: c.name.trim(),
          baseUrl: c.baseUrl.trim(),
          apiKey: nextKey,
          models: nextModels,
        };
      });
  }

  // Keep top-level models synced with all configured providers if models wasn't explicitly set
  const aggregatedProviderModels = Array.from(
    new Set([
      ...builtInProviders.filter((b) => Boolean(b.apiKey?.trim())).flatMap((b) => b.models || []),
      ...customProviders.flatMap((c) => c.models || []),
    ])
  );
  if (
    !Array.isArray(config.models) &&
    (Array.isArray(config.builtInProviders) || Array.isArray(config.customProviders))
  ) {
    models = aggregatedProviderModels;
  }

  const syncedDefaultModel =
    config.defaultModel?.trim() ||
    (models.includes(current.defaultModel || '') ? current.defaultModel : models[0]) ||
    '';

  const updated: PhoenixConfig = {
    apiKey:
      config.apiKey !== undefined && config.apiKey.trim() !== ''
        ? config.apiKey.trim()
        : current.apiKey,
    apiUrl: config.apiUrl?.trim() || current.apiUrl || DEFAULT_API_URL,
    models,
    defaultModel: syncedDefaultModel,
    provider: config.provider || current.provider,
    customUrl: config.customUrl !== undefined ? config.customUrl : current.customUrl,
    contextLimit,
    useDocker: typeof config.useDocker === 'boolean' ? config.useDocker : Boolean(current.useDocker),
    mcpServers: Array.isArray(config.mcpServers) ? config.mcpServers : current.mcpServers || [],
    builtInProviders,
    customProviders,
  };

  fs.writeFileSync(getConfigPath(), JSON.stringify(updated, null, 2), 'utf8');
  saveMcpConfigFile(updated.mcpServers || []);
  return updated;
}

export function upsertMcpServerConfig(server: McpServerConfig): PhoenixConfig {
  const current = loadConfig();
  const existing = Array.isArray(current?.mcpServers) ? [...current!.mcpServers] : loadMcpConfigFile();
  const idx = existing.findIndex(
    (s) => s.id === server.id || s.name.toLowerCase() === server.name.toLowerCase()
  );
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...server, enabled: true };
  } else {
    existing.push(server);
  }
  saveMcpConfigFile(existing);
  return saveConfig({ mcpServers: existing });
}

export function isConfigured(config: PhoenixConfig | null): boolean {
  if (!config) return false;
  if (typeof config.apiKey === 'string' && config.apiKey.trim().length > 0) return true;
  if (config.builtInProviders?.some((b) => typeof b.apiKey === 'string' && b.apiKey.trim().length > 0)) {
    return true;
  }
  if (config.customProviders?.some((c) => typeof c.baseUrl === 'string' && c.baseUrl.trim().length > 0)) {
    return true;
  }
  return false;
}

export function resolveProviderCredentials(
  config: PhoenixConfig | null,
  providerId?: string,
  model?: string
): {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  isBuiltIn: boolean;
} {
  const builtIn = config?.builtInProviders || DEFAULT_BUILT_IN_PROVIDERS;
  const custom = config?.customProviders || [];

  // 1. Search by explicit providerId: first in builtInProviders, then in customProviders
  if (providerId) {
    const foundBuiltIn = builtIn.find((b) => b.id === providerId);
    if (foundBuiltIn) {
      return {
        id: foundBuiltIn.id,
        name: foundBuiltIn.name,
        baseUrl: foundBuiltIn.baseUrl,
        apiKey: foundBuiltIn.apiKey || config?.apiKey || '',
        isBuiltIn: true,
      };
    }

    const foundCustom = custom.find((c) => c.id === providerId);
    if (foundCustom) {
      return {
        id: foundCustom.id,
        name: foundCustom.name,
        baseUrl: foundCustom.baseUrl,
        apiKey: foundCustom.apiKey || '',
        isBuiltIn: false,
      };
    }
  }

  // 2. Match by model ownership across active providers
  if (model) {
    const byModelBuiltIn = builtIn.find((b) => b.apiKey?.trim() && b.models?.includes(model));
    if (byModelBuiltIn) {
      return {
        id: byModelBuiltIn.id,
        name: byModelBuiltIn.name,
        baseUrl: byModelBuiltIn.baseUrl,
        apiKey: byModelBuiltIn.apiKey || '',
        isBuiltIn: true,
      };
    }
    const byModelCustom = custom.find((c) => c.models?.includes(model));
    if (byModelCustom) {
      return {
        id: byModelCustom.id,
        name: byModelCustom.name,
        baseUrl: byModelCustom.baseUrl,
        apiKey: byModelCustom.apiKey || '',
        isBuiltIn: false,
      };
    }
  }

  // 3. Fallback to first active built-in, first custom, or legacy fields
  const activeBuiltIn = builtIn.find((b) => Boolean(b.apiKey?.trim()));
  if (activeBuiltIn && !config?.apiKey) {
    return {
      id: activeBuiltIn.id,
      name: activeBuiltIn.name,
      baseUrl: activeBuiltIn.baseUrl,
      apiKey: activeBuiltIn.apiKey || '',
      isBuiltIn: true,
    };
  }

  if (custom.length > 0 && config?.provider === 'custom') {
    return {
      id: custom[0].id,
      name: custom[0].name,
      baseUrl: custom[0].baseUrl,
      apiKey: custom[0].apiKey || config?.apiKey || '',
      isBuiltIn: false,
    };
  }

  return {
    id: config?.provider || 'openai',
    name: config?.provider || 'OpenAI',
    baseUrl: config?.apiUrl || DEFAULT_API_URL,
    apiKey: config?.apiKey || '',
    isBuiltIn: config?.provider !== 'custom',
  };
}

export function sanitizeProvidersForClient(config: PhoenixConfig | null) {
  const builtIn = (config?.builtInProviders || DEFAULT_BUILT_IN_PROVIDERS).map((b) => ({
    id: b.id,
    name: b.name,
    baseUrl: b.baseUrl,
    hasKey: Boolean(b.apiKey && b.apiKey.trim().length > 0),
    models: Array.isArray(b.models) ? b.models : [],
  }));

  const custom = (config?.customProviders || []).map((c) => ({
    id: c.id,
    name: c.name,
    baseUrl: c.baseUrl,
    hasKey: Boolean(c.apiKey && c.apiKey.trim().length > 0),
    models: Array.isArray(c.models) ? c.models : [],
  }));

  return { builtInProviders: builtIn, customProviders: custom };
}
