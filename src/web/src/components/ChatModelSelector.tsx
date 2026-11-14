import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Sparkles } from 'lucide-react';
import { AppConfig } from '../types.js';

export interface ModelProviderGroup {
  providerId: string;
  providerName: string;
  isCustom: boolean;
  models: string[];
}

interface ChatModelSelectorProps {
  config: AppConfig | null;
  activeModel: string;
  activeProviderId?: string;
  onSelectModel: (model: string, providerId?: string) => void;
  compact?: boolean;
}

const LEGACY_PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic',
  custom: 'Custom',
};

export function ChatModelSelector({
  config,
  activeModel,
  activeProviderId,
  onSelectModel,
  compact = false,
}: ChatModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      const timer = setTimeout(() => searchInputRef.current?.focus(), 20);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const groups = useMemo<ModelProviderGroup[]>(() => {
    if (!config) return [];
    const result: ModelProviderGroup[] = [];

    if (Array.isArray(config.builtInProviders)) {
      for (const provider of config.builtInProviders) {
        if ((provider.hasKey || provider.models.length > 0) && provider.models.length > 0) {
          result.push({
            providerId: provider.id,
            providerName: provider.name,
            isCustom: false,
            models: provider.models,
          });
        }
      }
    }

    if (Array.isArray(config.customProviders)) {
      for (const provider of config.customProviders) {
        if (provider.models.length > 0) {
          result.push({
            providerId: provider.id,
            providerName: provider.name,
            isCustom: true,
            models: provider.models,
          });
        }
      }
    }

    const hasMultiProviderData =
      Array.isArray(config.builtInProviders) || Array.isArray(config.customProviders);

    if (
      !hasMultiProviderData &&
      result.length === 0 &&
      Array.isArray(config.models) &&
      config.models.length > 0
    ) {
      const legacyId = config.provider || 'openai';
      result.push({
        providerId: legacyId,
        providerName: LEGACY_PROVIDER_NAMES[legacyId] || legacyId,
        isCustom: legacyId === 'custom',
        models: config.models,
      });
    }

    return result;
  }, [config]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;

    return groups
      .map((group) => {
        const providerMatches = group.providerName.toLowerCase().includes(q);
        const matchedModels = providerMatches
          ? group.models
          : group.models.filter((m) => m.toLowerCase().includes(q));
        return {
          ...group,
          models: matchedModels,
        };
      })
      .filter((group) => group.models.length > 0);
  }, [groups, searchQuery]);

  const activeProviderLabel = useMemo(() => {
    if (activeProviderId) {
      const found = groups.find((g) => g.providerId === activeProviderId);
      if (found) return found.providerName;
    }
    const byModel = groups.find((g) => g.models.includes(activeModel));
    return byModel?.providerName || '';
  }, [groups, activeModel, activeProviderId]);

  const totalModels = useMemo(
    () => groups.reduce((acc, g) => acc + g.models.length, 0),
    [groups]
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-[#E4E4E7] transition-all cursor-pointer ${
          compact ? 'px-2.5 py-1' : 'px-3 py-1.5'
        }`}
        title={
          activeProviderLabel
            ? `${activeModel} (${activeProviderLabel})`
            : activeModel || 'Выбрать модель'
        }
      >
        <Sparkles className="w-3 h-3 text-[#60A5FA] shrink-0" />
        <span className="max-w-[140px] sm:max-w-[190px] truncate">
          {activeModel || 'Выбрать модель'}
        </span>
        {activeProviderLabel && !compact && (
          <span className="hidden md:inline text-[10px] text-[#71717A] truncate max-w-[90px]">
            ({activeProviderLabel})
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#71717A] transition-transform duration-150 shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-2 w-80 sm:w-96 rounded-2xl bg-[#18181B]/95 backdrop-blur-2xl border border-white/[0.1] shadow-[0_20px_50px_rgba(0,0,0,0.65)] z-50 overflow-hidden ${
            compact ? 'left-0' : 'right-0'
          }`}
        >
          {/* Search Input */}
          <div className="p-2.5 border-b border-white/[0.07]">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск модели или провайдера..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs text-[#F4F4F5] placeholder-[#71717A] focus:outline-none focus:border-[#3B82F6]/60 focus:bg-white/[0.07] transition-colors"
              />
            </div>
          </div>

          {/* Grouped Models List */}
          <div className="max-h-72 overflow-y-auto py-1.5 custom-scrollbar">
            {totalModels === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#71717A]">
                Нет загруженных моделей. Добавьте ключ провайдера и загрузите модели в Настройках.
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#71717A]">
                По запросу «{searchQuery}» ничего не найдено
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.providerId} className="mb-1.5 last:mb-0">
                  <div className="px-3.5 py-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#71717A]">
                    <span className="truncate">{group.providerName}</span>
                    <span className="text-[9px] font-normal normal-case px-1.5 py-0.5 rounded bg-white/[0.04] text-[#A1A1AA]">
                      {group.isCustom ? 'Кастомный' : 'Встроенный'}
                    </span>
                  </div>
                  <div className="px-1.5 space-y-0.5">
                    {group.models.map((model) => {
                      const isSelected =
                        model === activeModel &&
                        (!activeProviderId || activeProviderId === group.providerId);
                      return (
                        <button
                          key={`${group.providerId}:${model}`}
                          type="button"
                          onClick={() => {
                            onSelectModel(model, group.providerId);
                            setIsOpen(false);
                          }}
                          className={`w-full px-2.5 py-2 text-left text-xs flex items-center justify-between gap-2 rounded-xl transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#3B82F6]/15 text-[#60A5FA] font-medium'
                              : 'text-[#E4E4E7] hover:bg-white/[0.06]'
                          }`}
                        >
                          <div className="min-w-0 flex items-baseline gap-1.5 truncate">
                            <span className="truncate">{model}</span>
                            <span className="text-[11px] text-[#71717A] shrink-0">
                              ({group.providerName})
                            </span>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
