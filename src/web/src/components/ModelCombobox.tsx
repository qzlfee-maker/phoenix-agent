import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bot,
  Check,
  ChevronsUpDown,
  Loader2,
  PenLine,
  RefreshCw,
  Search,
  Info,
  ListFilter,
  X,
  Plus,
} from 'lucide-react';

interface ModelComboboxProps {
  selectedModels: string[];
  onChange: (models: string[]) => void;
  models: string[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  canRefresh: boolean;
  onPendingInputChange?: (val: string) => void;
}

export const ModelCombobox: React.FC<ModelComboboxProps> = ({
  selectedModels,
  onChange,
  models,
  isLoading,
  error,
  onRefresh,
  canRefresh,
  onPendingInputChange,
}) => {
  const [open, setOpen] = useState(false);
  const [isManual, setIsManual] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualInput, setManualInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) {
      setIsManual(true);
      setOpen(false);
    } else if (models.length > 0 && !error) {
      setIsManual(false);
    }
  }, [error, models.length]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 10);
    } else {
      setSearchQuery('');
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.toLowerCase().includes(q));
  }, [models, searchQuery]);

  const toggleModel = (modelId: string) => {
    const current = Array.isArray(selectedModels) ? selectedModels : [];
    if (current.includes(modelId)) {
      onChange(current.filter((m) => m !== modelId));
    } else {
      onChange([...current, modelId]);
    }
  };

  const removeModel = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = Array.isArray(selectedModels) ? selectedModels : [];
    onChange(current.filter((m) => m !== modelId));
  };

  const handleAddManualModel = () => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    const current = Array.isArray(selectedModels) ? selectedModels : [];
    if (!current.includes(trimmed)) {
      onChange([...current, trimmed]);
    }
    setManualInput('');
    onPendingInputChange?.('');
  };

  const handleManualKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddManualModel();
    }
  };

  const safeSelected = Array.isArray(selectedModels) ? selectedModels : [];

  return (
    <div className="space-y-2.5" ref={containerRef}>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          <Bot className="w-3.5 h-3.5 text-orange-400" />
          Модели ({safeSelected.length})
          {isLoading && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-normal normal-case text-orange-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Загрузка списка...
            </span>
          )}
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || !canRefresh}
            title="Обновить список моделей"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-orange-400' : ''}`} />
            <span>Обновить</span>
          </button>

          {isManual && models.length > 0 && (
            <button
              type="button"
              onClick={() => setIsManual(false)}
              className="flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
            >
              <ListFilter className="w-3 h-3" />
              <span>К списку ({models.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Selected Models Chips */}
      {safeSelected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-black/30 border border-white/[0.08]">
          {safeSelected.map((modelId) => (
            <span
              key={modelId}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/40 text-orange-200 text-xs font-mono"
            >
              <span className="truncate max-w-[220px]">{modelId}</span>
              <button
                type="button"
                onClick={(e) => removeModel(modelId, e)}
                title="Удалить модель"
                className="text-orange-300/70 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200/90">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div>
              Не удалось получить список автоматически. Пожалуйста, введите название модели вручную ниже.
            </div>
            <div className="text-[11px] text-amber-300/70 font-mono break-all">
              Причина: {error}
            </div>
          </div>
        </div>
      )}

      {isManual ? (
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => {
                setManualInput(e.target.value);
                onPendingInputChange?.(e.target.value);
              }}
              onKeyDown={handleManualKeyDown}
              placeholder="Введите ID модели и нажмите Enter..."
              className="w-full h-12 bg-black/40 border border-white/10 focus:border-orange-500/70 focus:ring-2 focus:ring-orange-500/20 rounded-xl px-4 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none font-mono spring-transition"
            />
            <PenLine className="w-4 h-4 text-zinc-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={handleAddManualModel}
            disabled={!manualInput.trim()}
            className="h-12 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-40 text-zinc-100 text-xs font-medium flex items-center gap-1.5 border border-white/10 spring-press cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            <Plus className="w-4 h-4 text-orange-400" />
            <span>Добавить</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className={`w-full h-12 flex items-center justify-between bg-black/40 border rounded-xl px-4 text-sm font-mono spring-press cursor-pointer ${
                open
                  ? 'border-orange-500/70 ring-2 ring-orange-500/20 text-zinc-100'
                  : 'border-white/10 hover:border-white/20 text-zinc-100'
              }`}
            >
              <span className="truncate text-zinc-400">
                {isLoading
                  ? 'Загрузка моделей...'
                  : safeSelected.length > 0
                    ? `Выбрано моделей: ${safeSelected.length} (нажмите, чтобы изменить)`
                    : 'Выберите одну или несколько моделей...'}
              </span>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                ) : (
                  <ChevronsUpDown className="w-4 h-4 text-zinc-500" />
                )}
              </div>
            </button>

            {open && (
              <div className="absolute z-50 left-0 right-0 mt-2 rounded-2xl liquid-glass-dark overflow-hidden animate-message-in">
                {/* Search Input */}
                <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.08]">
                  <Search className="w-4 h-4 text-zinc-500 shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setOpen(false);
                      } else if (e.key === 'Enter' && searchQuery.trim()) {
                        e.preventDefault();
                        if (filteredModels.length > 0) {
                          toggleModel(filteredModels[0]);
                        }
                      }
                    }}
                    placeholder="Поиск модели..."
                    className="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-mono"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Models List */}
                <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
                  {filteredModels.length === 0 ? (
                    <div className="py-4 text-center text-xs text-zinc-500">
                      {isLoading ? 'Загрузка моделей...' : 'Модели не найдены'}
                    </div>
                  ) : (
                    filteredModels.map((modelId) => {
                      const isSelected = safeSelected.includes(modelId);
                      return (
                        <button
                          key={modelId}
                          type="button"
                          onClick={() => toggleModel(modelId)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono cursor-pointer transition-colors text-left ${
                            isSelected
                              ? 'bg-orange-500/15 text-orange-300 font-medium'
                              : 'text-zinc-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <span className="truncate">{modelId}</span>
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ml-2 transition-colors ${
                              isSelected
                                ? 'bg-orange-500 border-orange-500 text-white'
                                : 'border-zinc-700 bg-zinc-900'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Manual Fallback Footer */}
                <div className="p-1.5 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsManual(true);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-orange-400 hover:bg-white/[0.06] cursor-pointer transition-colors"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    <span>Ввести вручную...</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {models.length === 0 && !isLoading && (
            <button
              type="button"
              onClick={() => setIsManual(true)}
              className="inline-flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 pl-1 transition-colors cursor-pointer"
            >
              <PenLine className="w-3.5 h-3.5" />
              <span>Ввести вручную</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
