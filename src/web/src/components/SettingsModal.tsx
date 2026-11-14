import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  Flame,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Plus,
  Trash2,
  Server,
  Terminal,
  Download,
  Loader2,
  KeyRound,
  Pencil,
  RefreshCw,
  Layers,
  Search,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  AppConfig,
  BuiltInProviderId,
  BuiltInProviderItem,
  CustomProviderItem,
  McpServerConfig,
} from '../types.js';
import { updateConfig, installMcpFromUrl, fetchProviderModels } from '../api.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig | null;
  onConfigUpdated: (newConfig: AppConfig) => void;
}

const DEFAULT_BUILT_IN_LIST: BuiltInProviderItem[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', hasKey: false, models: [] },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', hasKey: false, models: [] },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    hasKey: false,
    models: [],
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onConfigUpdated,
}) => {
  const [contextLimit, setContextLimit] = useState<number>(128000);
  const [useDocker, setUseDocker] = useState<boolean>(false);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [activeTab, setActiveTab] = useState<'providers' | 'mcp'>('providers');

  // Multi-provider state
  const [builtInProviders, setBuiltInProviders] = useState<BuiltInProviderItem[]>(DEFAULT_BUILT_IN_LIST);
  const [builtInKeyInputs, setBuiltInKeyInputs] = useState<Record<string, string>>({});
  const [builtInClearKeys, setBuiltInClearKeys] = useState<Record<string, boolean>>({});
  const [builtInShowKey, setBuiltInShowKey] = useState<Record<string, boolean>>({});
  const [customProviders, setCustomProviders] = useState<CustomProviderItem[]>([]);
  const [fetchingProviderId, setFetchingProviderId] = useState<string | null>(null);
  const [providerFetchStatus, setProviderFetchStatus] = useState<Record<string, string>>({});

  // Per-provider model regulation state
  const [expandedModelsProviderId, setExpandedModelsProviderId] = useState<string | null>(null);
  const [availableModelsByProvider, setAvailableModelsByProvider] = useState<Record<string, string[]>>({});
  const [modelSearchByProvider, setModelSearchByProvider] = useState<Record<string, string>>({});
  const [manualModelByProvider, setManualModelByProvider] = useState<Record<string, string>>({});

  // Custom provider modal state
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customShowKey, setCustomShowKey] = useState(false);
  const [customModalError, setCustomModalError] = useState<string | null>(null);
  const [isSavingCustom, setIsSavingCustom] = useState(false);
  const [newMcpName, setNewMcpName] = useState<string>('');
  const [newMcpTransport, setNewMcpTransport] = useState<'http' | 'stdio'>('http');
  const [newMcpUrl, setNewMcpUrl] = useState<string>('');
  const [newMcpCommand, setNewMcpCommand] = useState<string>('');
  const [newMcpArgs, setNewMcpArgs] = useState<string>('');
  const [githubRepoUrl, setGithubRepoUrl] = useState<string>('');
  const [isInstallingMcp, setIsInstallingMcp] = useState<boolean>(false);
  const [pendingDeleteMcp, setPendingDeleteMcp] = useState<McpServerConfig | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  useEffect(() => {
    if (config && isOpen) {
      setContextLimit(config.contextLimit || 128000);
      setUseDocker(Boolean(config.useDocker));
      setMcpServers(Array.isArray(config.mcpServers) ? config.mcpServers : []);
      setActiveTab('providers');
      setBuiltInProviders(
        Array.isArray(config.builtInProviders) && config.builtInProviders.length > 0
          ? config.builtInProviders
          : DEFAULT_BUILT_IN_LIST
      );
      setBuiltInKeyInputs({});
      setBuiltInClearKeys({});
      setBuiltInShowKey({});
      setCustomProviders(Array.isArray(config.customProviders) ? config.customProviders : []);
      setProviderFetchStatus({});
      setExpandedModelsProviderId(null);
      setModelSearchByProvider({});
      setManualModelByProvider({});
      setIsCustomModalOpen(false);
    }
    setStatusMessage(null);
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleAddMcpServer = () => {
    const cleanName = newMcpName.trim();
    if (!cleanName) {
      setStatusMessage({ text: 'Укажите название MCP-сервера.', type: 'error' });
      return;
    }

    if (newMcpTransport === 'http') {
      const cleanUrl = newMcpUrl.trim();
      if (!cleanUrl) {
        setStatusMessage({ text: 'Укажите URL для HTTP/SSE MCP-сервера.', type: 'error' });
        return;
      }
      setMcpServers((prev) => [
        ...prev,
        {
          id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: cleanName,
          transport: 'http',
          url: cleanUrl,
          enabled: true,
        },
      ]);
      setNewMcpName('');
      setNewMcpUrl('');
      setStatusMessage(null);
    } else {
      const cleanCmd = newMcpCommand.trim();
      if (!cleanCmd) {
        setStatusMessage({ text: 'Укажите команду запуска для stdio MCP-сервера.', type: 'error' });
        return;
      }
      const parsedArgs = newMcpArgs
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      setMcpServers((prev) => [
        ...prev,
        {
          id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: cleanName,
          transport: 'stdio',
          command: cleanCmd,
          args: parsedArgs,
          enabled: true,
        },
      ]);
      setNewMcpName('');
      setNewMcpCommand('');
      setNewMcpArgs('');
      setStatusMessage(null);
    }
  };

  const handleToggleMcpServer = (id: string) => {
    setMcpServers((prev) =>
      prev.map((srv) => (srv.id === id ? { ...srv, enabled: !srv.enabled } : srv))
    );
  };

  const handleDeleteMcpServer = (srv: McpServerConfig) => {
    setPendingDeleteMcp(srv);
  };

  const confirmDeleteMcpServer = async () => {
    if (!pendingDeleteMcp) return;
    const targetId = pendingDeleteMcp.id;
    const targetName = pendingDeleteMcp.name;
    const updatedList = mcpServers.filter((srv) => srv.id !== targetId);
    setMcpServers(updatedList);
    setPendingDeleteMcp(null);

    try {
      const updatedConfig = await updateConfig({
        mcpServers: updatedList,
      });
      onConfigUpdated(updatedConfig);
      setStatusMessage({
        text: `MCP-сервер «${targetName}» удалён.`,
        type: 'success',
      });
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'Ошибка удаления MCP-сервера',
        type: 'error',
      });
    }
  };

  const handleInstallFromGitHub = async () => {
    const cleanUrl = githubRepoUrl.trim();
    if (!cleanUrl) {
      setStatusMessage({
        text: 'Укажите ссылку на GitHub репозиторий.',
        type: 'error',
      });
      return;
    }

    setIsInstallingMcp(true);
    setStatusMessage(null);
    try {
      const res = await installMcpFromUrl(cleanUrl);
      setMcpServers(res.mcpServers || []);
      if (config) {
        onConfigUpdated({
          ...config,
          mcpServers: res.mcpServers || [],
        });
      }
      setGithubRepoUrl('');
      setStatusMessage({
        text: `MCP-сервер «${res.server.name}» установлен (${res.command}) и сохранён в ~/.phoenix/mcp-config.json`,
        type: 'success',
      });
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'Ошибка установки MCP-сервера. Проверьте ссылку.',
        type: 'error',
      });
    } finally {
      setIsInstallingMcp(false);
    }
  };

  const buildBuiltInPayload = () =>
    builtInProviders.map((p) => ({
      id: p.id as BuiltInProviderId,
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: builtInKeyInputs[p.id]?.trim() || undefined,
      clearKey: builtInClearKeys[p.id] || undefined,
      models: p.models,
    }));

  const updateProviderModelsList = (
    providerId: string,
    updater: (prevModels: string[]) => string[]
  ) => {
    const isBuiltIn = ['openai', 'openrouter', 'gemini'].includes(providerId);
    if (isBuiltIn) {
      setBuiltInProviders((prev) =>
        prev.map((p) => (p.id === providerId ? { ...p, models: updater(p.models) } : p))
      );
    } else {
      setCustomProviders((prev) =>
        prev.map((p) => (p.id === providerId ? { ...p, models: updater(p.models) } : p))
      );
    }
  };

  const handleToggleModelForProvider = (providerId: string, modelName: string) => {
    updateProviderModelsList(providerId, (prev) =>
      prev.includes(modelName)
        ? prev.filter((m) => m !== modelName)
        : [...prev, modelName]
    );
  };

  const handleAddManualModelForProvider = (providerId: string) => {
    const raw = (manualModelByProvider[providerId] || '').trim();
    if (!raw) return;
    updateProviderModelsList(providerId, (prev) =>
      prev.includes(raw) ? prev : [...prev, raw]
    );
    setAvailableModelsByProvider((prev) => {
      const existing = prev[providerId] || [];
      return existing.includes(raw) ? prev : { ...prev, [providerId]: [raw, ...existing] };
    });
    setManualModelByProvider((prev) => ({ ...prev, [providerId]: '' }));
  };

  const handleToggleModelsPanel = (
    providerId: string,
    baseUrl: string,
    apiKeyInput?: string,
    shouldAutoFetch = true
  ) => {
    if (expandedModelsProviderId === providerId) {
      setExpandedModelsProviderId(null);
      return;
    }
    setExpandedModelsProviderId(providerId);
    if (
      shouldAutoFetch &&
      (!availableModelsByProvider[providerId] || availableModelsByProvider[providerId].length === 0)
    ) {
      handleFetchModelsForProvider(providerId, baseUrl, apiKeyInput, false);
    }
  };

  const handleFetchModelsForProvider = async (
    providerId: string,
    baseUrl: string,
    apiKeyInput?: string,
    autoSelectIfEmpty = true
  ) => {
    setFetchingProviderId(providerId);
    setProviderFetchStatus((prev) => ({ ...prev, [providerId]: '' }));
    try {
      const apiProviderType = providerId === 'gemini' ? 'gemini' : 'openai';
      const res = await fetchProviderModels({
        provider: apiProviderType,
        providerId,
        baseUrl,
        apiKey: apiKeyInput?.trim() || undefined,
      });
      if (!res.success || !Array.isArray(res.models) || res.models.length === 0) {
        setProviderFetchStatus((prev) => ({
          ...prev,
          [providerId]: res.error || 'Не удалось загрузить модели',
        }));
        return;
      }

      const loadedModels = res.models;
      setAvailableModelsByProvider((prev) => ({ ...prev, [providerId]: loadedModels }));

      const isBuiltIn = ['openai', 'openrouter', 'gemini'].includes(providerId);
      const currentSelected = isBuiltIn
        ? builtInProviders.find((p) => p.id === providerId)?.models || []
        : customProviders.find((p) => p.id === providerId)?.models || [];

      if (autoSelectIfEmpty && currentSelected.length === 0) {
        updateProviderModelsList(providerId, () => loadedModels);
      }

      setProviderFetchStatus((prev) => ({
        ...prev,
        [providerId]: `Доступно ${loadedModels.length} мод.`,
      }));
    } catch (err: any) {
      setProviderFetchStatus((prev) => ({
        ...prev,
        [providerId]: err?.message || 'Ошибка загрузки моделей',
      }));
    } finally {
      setFetchingProviderId(null);
    }
  };

  const openAddCustomModal = () => {
    setEditingCustomId(null);
    setCustomName('');
    setCustomBaseUrl('');
    setCustomApiKey('');
    setCustomShowKey(false);
    setCustomModalError(null);
    setIsCustomModalOpen(true);
  };

  const openEditCustomModal = (provider: CustomProviderItem) => {
    setEditingCustomId(provider.id);
    setCustomName(provider.name);
    setCustomBaseUrl(provider.baseUrl);
    setCustomApiKey('');
    setCustomShowKey(false);
    setCustomModalError(null);
    setIsCustomModalOpen(true);
  };

  const handleSaveCustomProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customName.trim();
    const cleanUrl = customBaseUrl.trim().replace(/\/+$/, '');
    const cleanKey = customApiKey.trim();

    if (!cleanName) {
      setCustomModalError('Укажите имя провайдера (например, "Мой VPS" или "Ollama").');
      return;
    }
    if (!cleanUrl) {
      setCustomModalError('Укажите Base URL провайдера.');
      return;
    }

    setIsSavingCustom(true);
    setCustomModalError(null);

    try {
      const targetId =
        editingCustomId || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const existing = customProviders.find((p) => p.id === editingCustomId);

      // Fetch models automatically only when creating a new custom provider
      let fetchedModels = existing?.models || [];
      if (!editingCustomId) {
        try {
          const res = await fetchProviderModels({
            provider: 'custom',
            baseUrl: cleanUrl,
            apiKey: cleanKey || undefined,
          });
          if (res.success && Array.isArray(res.models) && res.models.length > 0) {
            fetchedModels = res.models;
          }
        } catch {
          // Keep empty models if offline or endpoint doesn't expose /models
        }
      }

      const nextCustom: CustomProviderItem[] = editingCustomId
        ? customProviders.map((p) =>
            p.id === editingCustomId
              ? {
                  ...p,
                  name: cleanName,
                  baseUrl: cleanUrl,
                  hasKey: Boolean(cleanKey) || p.hasKey,
                  apiKey: cleanKey || undefined,
                  models: fetchedModels,
                }
              : p
          )
        : [
            ...customProviders,
            {
              id: targetId,
              name: cleanName,
              baseUrl: cleanUrl,
              hasKey: Boolean(cleanKey),
              apiKey: cleanKey || undefined,
              models: fetchedModels,
            },
          ];

      const updated = await updateConfig({
        customProviders: nextCustom.map((p) => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          apiKey: p.apiKey,
          models: p.models,
        })),
      });

      setCustomProviders(updated.customProviders || nextCustom);
      onConfigUpdated(updated);
      setIsCustomModalOpen(false);
      setStatusMessage({
        text: `Провайдер «${cleanName}» сохранён.`,
        type: 'success',
      });
    } catch (err: any) {
      setCustomModalError(err?.message || 'Не удалось сохранить провайдера');
    } finally {
      setIsSavingCustom(false);
    }
  };

  const handleDeleteCustomProvider = async (provider: CustomProviderItem) => {
    const nextCustom = customProviders.filter((p) => p.id !== provider.id);
    setCustomProviders(nextCustom);
    try {
      const updated = await updateConfig({
        customProviders: nextCustom.map((p) => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          models: p.models,
        })),
      });
      setCustomProviders(updated.customProviders || nextCustom);
      onConfigUpdated(updated);
      setStatusMessage({
        text: `Кастомный провайдер «${provider.name}» удалён.`,
        type: 'success',
      });
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'Ошибка удаления провайдера',
        type: 'error',
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const updated = await updateConfig({
        contextLimit: contextLimit > 0 ? contextLimit : 128000,
        useDocker,
        mcpServers,
        builtInProviders: buildBuiltInPayload(),
        customProviders: customProviders.map((p) => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          models: p.models,
        })),
      });
      onConfigUpdated(updated);
      setStatusMessage({ text: 'Настройки успешно обновлены!', type: 'success' });
      setBuiltInKeyInputs({});
      setBuiltInClearKeys({});
      setTimeout(() => {
        onClose();
      }, 650);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Ошибка сохранения настроек', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const renderProviderModelsEditor = (
    providerId: string,
    selectedModelsList: string[],
    baseUrl: string,
    apiKeyInput?: string
  ) => {
    const isFetching = fetchingProviderId === providerId;
    const available = availableModelsByProvider[providerId] || [];
    const searchQuery = (modelSearchByProvider[providerId] || '').trim().toLowerCase();
    const manualValue = manualModelByProvider[providerId] || '';

    const mergedPool = Array.from(new Set([...selectedModelsList, ...available])).sort((a, b) =>
      a.localeCompare(b)
    );
    const filteredPool = searchQuery
      ? mergedPool.filter((m) => m.toLowerCase().includes(searchQuery))
      : mergedPool;

    return (
      <div className="pt-3 mt-1 border-t border-white/[0.06] space-y-3 animate-message-in">
        {/* Selected active models chips */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-400">
              Активные модели ({selectedModelsList.length})
            </span>
            <div className="flex items-center gap-2">
              {available.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateProviderModelsList(providerId, () => available)}
                  className="text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  Выбрать все ({available.length})
                </button>
              )}
              {selectedModelsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateProviderModelsList(providerId, () => [])}
                  className="text-[11px] text-zinc-500 hover:text-red-400 cursor-pointer"
                >
                  Очистить
                </button>
              )}
            </div>
          </div>

          {selectedModelsList.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {selectedModelsList.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-[11px] font-mono text-orange-200"
                >
                  <span className="truncate max-w-[180px]">{m}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleModelForProvider(providerId, m)}
                    className="text-orange-300/70 hover:text-white cursor-pointer"
                    title="Удалить модель"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">
              Модели не выбраны — добавьте вручную или загрузите с сервера.
            </p>
          )}
        </div>

        {/* Add model manually */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={manualValue}
            onChange={(e) =>
              setManualModelByProvider((prev) => ({ ...prev, [providerId]: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddManualModelForProvider(providerId);
              }
            }}
            placeholder="Добавить модель вручную (напр. gpt-4o)"
            className="flex-1 px-3 py-1.5 rounded-xl bg-black/35 border border-white/[0.08] text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50"
          />
          <button
            type="button"
            onClick={() => handleAddManualModelForProvider(providerId)}
            disabled={!manualValue.trim()}
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs text-zinc-200 flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить</span>
          </button>
          <button
            type="button"
            onClick={() =>
              handleFetchModelsForProvider(providerId, baseUrl, apiKeyInput, false)
            }
            disabled={isFetching}
            title="Обновить список моделей с сервера"
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs text-zinc-200 flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Загрузить</span>
          </button>
        </div>

        {/* Search & check available models */}
        {mergedPool.length > 0 && (
          <div className="space-y-1.5">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={modelSearchByProvider[providerId] || ''}
                onChange={(e) =>
                  setModelSearchByProvider((prev) => ({
                    ...prev,
                    [providerId]: e.target.value,
                  }))
                }
                placeholder="Фильтр по списку моделей..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/25 border border-white/[0.07] text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-white/20"
              />
            </div>

            <div className="max-h-40 overflow-y-auto rounded-xl bg-black/25 border border-white/[0.06] p-1 space-y-0.5">
              {filteredPool.length === 0 ? (
                <div className="py-3 text-center text-[11px] text-zinc-500">
                  Ничего не найдено
                </div>
              ) : (
                filteredPool.map((modelName) => {
                  const checked = selectedModelsList.includes(modelName);
                  return (
                    <button
                      key={modelName}
                      type="button"
                      onClick={() => handleToggleModelForProvider(providerId, modelName)}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-mono flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        checked
                          ? 'bg-orange-500/15 text-orange-200'
                          : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'
                      }`}
                    >
                      <span className="truncate">{modelName}</span>
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          checked
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : 'border-white/20 bg-transparent'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-xl animate-message-in"
    >
      <div
        className="w-full max-w-2xl liquid-glass-dark rounded-3xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <Flame className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">
                Настройки LLM-провайдера
              </h2>
              <p className="text-xs text-zinc-400">Конфигурация в ~/.phoenix/config.json</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] spring-press cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 border-b border-white/[0.08] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('providers')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-t-xl border-b-2 transition-colors cursor-pointer ${
              activeTab === 'providers'
                ? 'border-orange-500 text-white bg-white/[0.04]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Провайдеры</span>
            {(builtInProviders.filter((p) => p.hasKey).length + customProviders.length) > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                {builtInProviders.filter((p) => p.hasKey).length + customProviders.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-t-xl border-b-2 transition-colors cursor-pointer ${
              activeTab === 'mcp'
                ? 'border-orange-500 text-white bg-white/[0.04]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>MCP Серверы</span>
            {mcpServers.filter((s) => s.enabled).length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-orange-500/20 text-orange-300 text-[10px]">
                {mcpServers.filter((s) => s.enabled).length}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleSave} className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1">
          {activeTab === 'providers' ? (
            <div className="space-y-6 animate-message-in">
              {/* Built-in Providers Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Встроенные
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Провайдеры становятся активны сразу после ввода API-ключа
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {builtInProviders.map((provider) => {
                    const typedKey = builtInKeyInputs[provider.id] || '';
                    const isCleared = Boolean(builtInClearKeys[provider.id]);
                    const isActive = Boolean(typedKey.trim()) || (provider.hasKey && !isCleared);
                    const isShowing = Boolean(builtInShowKey[provider.id]);
                    const isFetching = fetchingProviderId === provider.id;
                    const fetchInfo = providerFetchStatus[provider.id];
                    const isModelsOpen = expandedModelsProviderId === provider.id;

                    return (
                      <div
                        key={provider.id}
                        className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-sm font-semibold text-white">
                              {provider.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                isActive
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-zinc-800/80 text-zinc-400 border border-white/[0.06]'
                              }`}
                            >
                              {isActive ? 'Активен' : 'Неактивен'}
                            </span>
                            {provider.models.length > 0 && (
                              <span className="text-[11px] text-zinc-400">
                                {provider.models.length} мод.
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleModelsPanel(
                                  provider.id,
                                  provider.baseUrl,
                                  typedKey,
                                  isActive
                                )
                              }
                              title="Настроить список моделей этого провайдера"
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                                isModelsOpen
                                  ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                                  : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border-white/[0.08]'
                              }`}
                            >
                              <span>Модели ({provider.models.length})</span>
                              <ChevronDown
                                className={`w-3 h-3 transition-transform ${
                                  isModelsOpen ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        <div className="relative flex items-center">
                          <KeyRound className="w-3.5 h-3.5 text-zinc-500 absolute left-3 pointer-events-none" />
                          <input
                            type={isShowing ? 'text' : 'password'}
                            value={typedKey}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBuiltInKeyInputs((prev) => ({ ...prev, [provider.id]: val }));
                              if (val) {
                                setBuiltInClearKeys((prev) => ({
                                  ...prev,
                                  [provider.id]: false,
                                }));
                              }
                            }}
                            placeholder={
                              provider.hasKey && !isCleared
                                ? '•••••••••••••••••••• (ключ сохранён)'
                                : `Введите API-ключ для ${provider.name}`
                            }
                            className="w-full pl-9 pr-10 py-2 rounded-xl bg-black/30 border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setBuiltInShowKey((prev) => ({
                                ...prev,
                                [provider.id]: !isShowing,
                              }))
                            }
                            className="absolute right-2.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                            title={isShowing ? 'Скрыть' : 'Показать'}
                          >
                            {isShowing ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {fetchInfo && (
                          <p className="text-[11px] text-zinc-400">{fetchInfo}</p>
                        )}

                        {isModelsOpen &&
                          renderProviderModelsEditor(
                            provider.id,
                            provider.models,
                            provider.baseUrl,
                            typedKey
                          )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Providers Section */}
              <div className="space-y-3 pt-2 border-t border-white/[0.08]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Кастомные
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      OpenAI-совместимые эндпоинты: Ollama, vLLM, свой VPS и др.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={openAddCustomModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-300 text-xs font-medium spring-press cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить кастомного провайдера</span>
                  </button>
                </div>

                {customProviders.length === 0 ? (
                  <div className="p-5 rounded-2xl bg-white/[0.02] border border-dashed border-white/[0.08] text-center text-xs text-zinc-500">
                    Кастомные провайдеры ещё не добавлены.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {customProviders.map((provider) => {
                      const isFetching = fetchingProviderId === provider.id;
                      const fetchInfo = providerFetchStatus[provider.id];
                      const isModelsOpen = expandedModelsProviderId === provider.id;
                      return (
                        <div
                          key={provider.id}
                          className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white truncate">
                                  {provider.name}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/25">
                                  {provider.models.length} мод.
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                                {provider.baseUrl}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleModelsPanel(
                                    provider.id,
                                    provider.baseUrl,
                                    undefined,
                                    true
                                  )
                                }
                                title="Настроить список моделей"
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer ${
                                  isModelsOpen
                                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                                    : 'bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 border-white/[0.08]'
                                }`}
                              >
                                <span>Модели</span>
                                <ChevronDown
                                  className={`w-3 h-3 transition-transform ${
                                    isModelsOpen ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditCustomModal(provider)}
                                title="Редактировать"
                                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomProvider(provider)}
                                title="Удалить"
                                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {fetchInfo && (
                            <p className="text-[11px] text-zinc-400">{fetchInfo}</p>
                          )}
                          {isModelsOpen &&
                            renderProviderModelsEditor(
                              provider.id,
                              provider.models,
                              provider.baseUrl
                            )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Docker Sandbox Toggle */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">
                      Использовать Docker (Рекомендуется)
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        useDocker
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                      }`}
                    >
                      {useDocker ? 'Docker Sandbox' : 'Прямое выполнение'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Запускает команды терминала в изолированном эфемерном контейнере (node:20-alpine, лимит 512MB RAM).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setUseDocker((prev) => !prev)}
                  className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    useDocker ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      useDocker ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Context Window Limit */}
              <div className="space-y-2 pt-3 border-t border-white/[0.08]">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Лимит контекста (токенов)
                  </label>
                  <div className="flex items-center gap-1">
                    {[32000, 64000, 128000, 200000, 1000000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setContextLimit(preset)}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-mono transition-colors cursor-pointer ${
                          contextLimit === preset
                            ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                            : 'bg-white/[0.04] text-zinc-400 hover:text-zinc-200 border border-white/[0.07]'
                        }`}
                      >
                        {preset >= 1000000 ? `${preset / 1000000}M` : `${preset / 1000}k`}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  min={1024}
                  step={1000}
                  value={contextLimit}
                  onChange={(e) => setContextLimit(Number(e.target.value) || 128000)}
                  className="w-full h-10 bg-black/35 border border-white/10 focus:border-orange-500/70 focus:ring-2 focus:ring-orange-500/20 rounded-xl px-4 text-xs sm:text-sm text-zinc-100 focus:outline-none font-mono spring-transition"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-300 leading-relaxed">
                Подключайте внешние инструменты по протоколу <span className="text-orange-300 font-medium">MCP (Model Context Protocol)</span> через ссылку на GitHub, URL или локальную команду.
                Встроенный бесплатный веб-поиск (<span className="font-mono text-zinc-200">Parallel Search MCP</span> для всех моделей и <span className="font-mono text-zinc-200">Google Search Grounding</span> для Gemini) уже активен автоматически.
              </div>

              {/* Quick GitHub Repository Installer */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.1] space-y-2.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Ссылка на GitHub репозиторий
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={githubRepoUrl}
                    onChange={(e) => setGithubRepoUrl(e.target.value)}
                    placeholder="https://github.com/modelcontextprotocol/servers"
                    className="flex-1 h-10 bg-black/45 border border-white/10 focus:border-orange-500/70 rounded-xl px-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    disabled={isInstallingMcp}
                    onClick={handleInstallFromGitHub}
                    className="inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-xl text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md shadow-orange-950/40 spring-press disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {isInstallingMcp ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>{isInstallingMcp ? 'Установка...' : 'Установить'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Парсер автоматически прочитает README репозитория, извлечёт команду запуска (npx, uvx, python, docker) и сохранит конфиг в ~/.phoenix/mcp-config.json.
                </p>
              </div>

              {/* Configured servers list */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Подключённые серверы ({mcpServers.length})
                </div>
                {mcpServers.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-xs text-zinc-500">
                    Пользовательские MCP-серверы пока не добавлены.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mcpServers.map((srv) => (
                      <div
                        key={srv.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/35 border border-white/10"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-100 truncate">
                              {srv.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-white/[0.07] text-[10px] font-mono uppercase text-zinc-300">
                              {srv.transport}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                            {srv.transport === 'http'
                              ? srv.url
                              : `${srv.command || ''} ${(srv.args || []).join(' ')}`.trim()}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleMcpServer(srv.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                              srv.enabled
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-white/[0.05] text-zinc-400 border border-white/10'
                            }`}
                          >
                            {srv.enabled ? 'Вкл' : 'Выкл'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMcpServer(srv)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Удалить сервер"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add new MCP server */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Добавить MCP-сервер
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newMcpName}
                    onChange={(e) => setNewMcpName(e.target.value)}
                    placeholder="Название (например, github)"
                    className="h-10 bg-black/40 border border-white/10 focus:border-orange-500/70 rounded-xl px-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                  />

                  <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setNewMcpTransport('http')}
                      className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        newMcpTransport === 'http'
                          ? 'bg-orange-500/20 text-orange-300'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>URL (HTTP/SSE)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMcpTransport('stdio')}
                      className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        newMcpTransport === 'stdio'
                          ? 'bg-orange-500/20 text-orange-300'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Команда (stdio)</span>
                    </button>
                  </div>
                </div>

                {newMcpTransport === 'http' ? (
                  <input
                    type="text"
                    value={newMcpUrl}
                    onChange={(e) => setNewMcpUrl(e.target.value)}
                    placeholder="https://example.com/mcp"
                    className="w-full h-10 bg-black/40 border border-white/10 focus:border-orange-500/70 rounded-xl px-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none font-mono"
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      value={newMcpCommand}
                      onChange={(e) => setNewMcpCommand(e.target.value)}
                      placeholder="Команда (npx, node, python)"
                      className="h-10 bg-black/40 border border-white/10 focus:border-orange-500/70 rounded-xl px-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none font-mono"
                    />
                    <input
                      type="text"
                      value={newMcpArgs}
                      onChange={(e) => setNewMcpArgs(e.target.value)}
                      placeholder="Аргументы (через пробел)"
                      className="sm:col-span-2 h-10 bg-black/40 border border-white/10 focus:border-orange-500/70 rounded-xl px-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none font-mono"
                    />
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddMcpServer}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить сервер</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/30 text-red-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-between border-t border-white/[0.08]">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>~/.phoenix/config.json</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] spring-press cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-950/50 spring-press disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Сохранение...' : 'Сохранить'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Add / Edit Custom Provider Modal */}
      {isCustomModalOpen && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsCustomModalOpen(false);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-message-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md liquid-glass-dark rounded-3xl p-6 border border-white/[0.1] shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {editingCustomId ? 'Редактировать провайдера' : 'Добавить кастомного провайдера'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Имя провайдера <span className="text-orange-400">*</span>
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Например: Мой VPS или Ollama"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/35 border border-white/[0.1] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Base URL <span className="text-orange-400">*</span>
                </label>
                <input
                  type="text"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/35 border border-white/[0.1] text-sm font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">API Key</label>
                <div className="relative flex items-center">
                  <input
                    type={customShowKey ? 'text' : 'password'}
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder={
                      editingCustomId ? 'Оставьте пустым, чтобы не менять' : 'sk-... (опционально для локальных)'
                    }
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-black/35 border border-white/[0.1] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomShowKey((prev) => !prev)}
                    className="absolute right-3 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    {customShowKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {customModalError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {customModalError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSavingCustom}
                onClick={handleSaveCustomProvider}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-950/50 cursor-pointer disabled:opacity-50"
              >
                {isSavingCustom && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{editingCustomId ? 'Сохранить' : 'Добавить'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete MCP Server Confirmation Modal */}
      {pendingDeleteMcp && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setPendingDeleteMcp(null);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-message-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl liquid-glass-dark border border-white/15 p-6 shadow-2xl shadow-black/85 space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white">
                  Удалить MCP-сервер?
                </h3>
                <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                  Вы уверены, что хотите удалить MCP-сервер{' '}
                  <span className="font-semibold text-white break-words">
                    «{pendingDeleteMcp.name}»
                  </span>
                  ?
                </p>
                <p className="text-xs text-red-300/90 mt-2 leading-relaxed">
                  Это действие нельзя будет отменить.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteMcp(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 spring-press cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmDeleteMcpServer}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/50 spring-press cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
