import React, { useState } from 'react';
import {
  Flame,
  Lock,
  Globe,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { AppConfig, ProviderId } from '../types.js';
import { getProviderById } from '../constants/providers.js';
import { ProviderSelect } from './ProviderSelect.js';
import { ModelCombobox } from './ModelCombobox.js';
import { useModelFetcher } from '../hooks/useModelFetcher.js';
import { updateConfig } from '../api.js';

interface SetupScreenProps {
  initialConfig: AppConfig | null;
  onConfigured: (config: AppConfig) => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ initialConfig, onConfigured }) => {
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>(
    initialConfig?.provider || 'openai'
  );

  const currentProvider = getProviderById(selectedProviderId);

  const [apiUrl, setApiUrl] = useState<string>(
    initialConfig?.apiUrl || currentProvider.defaultUrl
  );
  const [apiKey, setApiKey] = useState<string>('');
  const [selectedModels, setSelectedModels] = useState<string[]>(
    initialConfig?.models || []
  );
  const [pendingManualModel, setPendingManualModel] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const {
    models,
    isLoadingModels,
    modelsError,
    refetchModels,
    canRefresh,
  } = useModelFetcher({
    provider: selectedProviderId,
    baseUrl: apiUrl,
    apiKey,
  });

  const handleSelectProvider = (id: ProviderId) => {
    setSelectedProviderId(id);
    const provider = getProviderById(id);
    setApiUrl(provider.defaultUrl);
    setSelectedModels([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() && selectedProviderId !== 'custom') {
      setError('Пожалуйста, введите API-ключ для авторизации в выбранном провайдере.');
      return;
    }

    const finalModels = [...selectedModels];
    if (pendingManualModel.trim() && !finalModels.includes(pendingManualModel.trim())) {
      finalModels.push(pendingManualModel.trim());
    }

    if (finalModels.length === 0) {
      setError('Пожалуйста, выберите или добавьте хотя бы одну модель.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const resolvedUrl = apiUrl.trim() || currentProvider.defaultUrl;
      const trimmedKey = apiKey.trim();
      const isBuiltIn =
        selectedProviderId === 'openai' ||
        selectedProviderId === 'openrouter' ||
        selectedProviderId === 'gemini';

      const updated = await updateConfig({
        provider: selectedProviderId,
        apiUrl: resolvedUrl,
        customUrl: selectedProviderId === 'custom' ? resolvedUrl : undefined,
        apiKey: trimmedKey,
        models: finalModels,
        defaultModel: finalModels[0],
        ...(isBuiltIn
          ? {
              builtInProviders: [
                {
                  id: selectedProviderId as 'openai' | 'openrouter' | 'gemini',
                  name: currentProvider.name,
                  baseUrl: resolvedUrl,
                  apiKey: trimmedKey,
                  models: finalModels,
                },
              ],
            }
          : {
              customProviders: [
                ...(initialConfig?.customProviders || []),
                {
                  id: selectedProviderId === 'anthropic' ? 'anthropic' : `custom-${Date.now()}`,
                  name: currentProvider.name,
                  baseUrl: resolvedUrl,
                  apiKey: trimmedKey,
                  models: finalModels,
                },
              ],
            }),
      });
      onConfigured(updated);
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить настройки');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-screen apple-mesh-bg text-zinc-100 flex items-center justify-center p-4 sm:p-6 md:p-10 overflow-x-hidden">
      <div className="relative w-full max-w-2xl liquid-glass-dark rounded-3xl p-8 sm:p-10 md:p-12 animate-message-in">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white shadow-xl shadow-orange-500/25 mb-5">
            <Flame className="w-8 h-8 fill-current" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
            Подключение к Phoenix
          </h1>
          <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
            Автономный local-first AI агент. Введите ключ — список моделей подгрузится автоматически.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <ProviderSelect
            selectedId={selectedProviderId}
            onSelect={handleSelectProvider}
          />

          {selectedProviderId === 'custom' ? (
            <div className="space-y-2 animate-message-in">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                <Globe className="w-3.5 h-3.5 text-orange-400" />
                Custom Base URL (OpenAI-совместимый)
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://localhost:11434/v1 или https://your-proxy.com/v1"
                required
                className="w-full h-12 bg-black/40 border border-white/10 focus:border-orange-500/70 focus:ring-2 focus:ring-orange-500/20 rounded-xl px-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none font-mono spring-transition"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-xs text-zinc-400 font-mono">
              <span className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-zinc-500" />
                Endpoint:
              </span>
              <span className="text-zinc-300 truncate max-w-xs">{currentProvider.defaultUrl}</span>
            </div>
          )}

          {/* API Key Field */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
              <Lock className="w-3.5 h-3.5 text-orange-400" />
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={currentProvider.keyPlaceholder}
                required={selectedProviderId !== 'custom'}
                className="w-full h-12 bg-black/40 border border-white/10 focus:border-orange-500/70 focus:ring-2 focus:ring-orange-500/20 rounded-xl pl-4 pr-11 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none font-mono spring-transition"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1 cursor-pointer"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {currentProvider.hint && (
              <p className="text-[11px] text-zinc-500 pl-1">{currentProvider.hint}</p>
            )}
          </div>

          {/* Dynamic Multi-Select Model Combobox */}
          <ModelCombobox
            selectedModels={selectedModels}
            onChange={setSelectedModels}
            models={models}
            isLoading={isLoadingModels}
            error={modelsError}
            onRefresh={refetchModels}
            canRefresh={canRefresh}
            onPendingInputChange={setPendingManualModel}
          />

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 h-12 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-semibold text-sm shadow-lg shadow-orange-950/50 spring-press disabled:opacity-50 cursor-pointer"
          >
            <span>{isSubmitting ? 'Сохранение...' : 'Начать работу с Phoenix'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-7 pt-5 border-t border-white/[0.07] flex items-center justify-center gap-2 text-xs text-zinc-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>
            Конфигурация хранится строго локально на вашем компьютере:{' '}
            <code className="text-zinc-300 font-mono">~/.phoenix/config.json</code>
          </span>
        </div>
      </div>
    </div>
  );
};
