import React from 'react';
import { Check, Sparkles, Cpu, Server, Zap, Compass } from 'lucide-react';
import { ProviderId } from '../types.js';
import { PROVIDERS } from '../constants/providers.js';

interface ProviderSelectProps {
  selectedId: ProviderId;
  onSelect: (id: ProviderId) => void;
}

export const ProviderSelect: React.FC<ProviderSelectProps> = ({ selectedId, onSelect }) => {
  const getProviderIcon = (id: ProviderId) => {
    switch (id) {
      case 'openai':
        return <Zap className="w-4 h-4 text-emerald-400" />;
      case 'anthropic':
        return <Sparkles className="w-4 h-4 text-amber-400" />;
      case 'openrouter':
        return <Compass className="w-4 h-4 text-purple-400" />;
      case 'gemini':
        return <Cpu className="w-4 h-4 text-sky-400" />;
      case 'custom':
        return <Server className="w-4 h-4 text-orange-400" />;
      default:
        return <Zap className="w-4 h-4 text-orange-400" />;
    }
  };

  return (
    <div className="space-y-2.5">
      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Выберите LLM-провайдера
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {PROVIDERS.map((provider) => {
          const isSelected = selectedId === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => onSelect(provider.id)}
              className={`relative flex flex-col text-left p-3.5 rounded-2xl border spring-press cursor-pointer ${
                isSelected
                  ? 'bg-orange-500/10 border-orange-500/60 shadow-lg shadow-orange-950/20'
                  : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] hover:border-white/[0.15]'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors ${
                    isSelected
                      ? 'bg-orange-500/20 border-orange-500/40'
                      : 'bg-white/[0.04] border-white/[0.08]'
                  }`}
                >
                  {getProviderIcon(provider.id)}
                </div>

                {isSelected && (
                  <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-sm">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                )}
              </div>

              <div className="font-semibold text-xs text-zinc-100">
                {provider.name}
              </div>
              <div className="text-[11px] text-zinc-400 truncate mt-0.5 font-normal">
                {provider.tagline}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
