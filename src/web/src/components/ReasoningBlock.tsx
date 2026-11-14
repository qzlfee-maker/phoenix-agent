import React, { useState } from 'react';
import {
  Brain,
  ChevronDown,
  Folder,
  FileText,
  Search,
  ImagePlus,
  Trash2,
  Terminal,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Globe,
  Square,
} from 'lucide-react';
import { ToolInvocation } from '../types.js';
import { stopTerminalProcess } from '../api.js';

interface ReasoningBlockProps {
  reasoningText?: string;
  toolInvocations?: ToolInvocation[];
  isStreaming?: boolean;
  onSelectFile?: (filePath: string) => void;
  onOpenTerminal?: (toolCallId: string) => void;
}

function getToolLabel(inv: ToolInvocation): {
  title: string;
  filePath?: string;
  command?: string;
  icon: React.ReactNode;
} {
  const filePath = typeof inv.args?.path === 'string' ? inv.args.path : undefined;
  const command = typeof inv.args?.command === 'string' ? inv.args.command : undefined;

  switch (inv.toolName) {
    case 'list_files':
      return {
        title:
          inv.state === 'running'
            ? 'Чтение структуры проекта...'
            : inv.state === 'error'
              ? 'Ошибка чтения структуры проекта'
              : 'Прочитана структура проекта',
        icon: <Folder size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
      };
    case 'search_codebase': {
      const query = typeof inv.args?.query === 'string' ? inv.args.query : '';
      return {
        title:
          inv.state === 'running'
            ? `Поиск по коду${query ? `: ${query}` : '...'}`
            : inv.state === 'error'
              ? 'Ошибка поиска по коду'
              : `Поиск по коду${query ? `: ${query}` : ''}`,
        icon: <Search size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
      };
    }
    case 'read_file':
      return {
        title:
          inv.state === 'running'
            ? 'Чтение файла'
            : inv.state === 'error'
              ? 'Не удалось прочитать файл'
              : 'Прочитан файл',
        filePath,
        icon: <FileText size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
      };
    case 'write_file':
      return {
        title:
          inv.state === 'running'
            ? 'Запись файла'
            : inv.state === 'error'
              ? 'Ошибка записи файла'
              : inv.fileAction === 'created'
                ? 'Создан файл'
                : 'Обновлён файл',
        filePath,
        icon: <FileText size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
      };
    case 'save_image_to_project':
      return {
        title:
          inv.state === 'running'
            ? 'Сохранение картинки в'
            : inv.state === 'error'
              ? 'Ошибка сохранения картинки'
              : 'Картинка сохранена в',
        filePath,
        icon: <ImagePlus size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
      };
    case 'delete_file':
      return {
        title:
          inv.state === 'running'
            ? 'Удаление файла'
            : inv.state === 'error'
              ? 'Ошибка удаления файла'
              : 'Удалён файл',
        filePath,
        icon: <Trash2 size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
      };
    case 'execute_command':
      return {
        title:
          inv.state === 'running'
            ? 'Выполняется команда:'
            : inv.state === 'error'
              ? 'Ошибка команды:'
              : 'Выполнена команда:',
        command,
        icon: <Terminal size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
      };
    case 'add_memory': {
      const fact = typeof inv.args?.fact === 'string' ? inv.args.fact : '';
      return {
        title:
          inv.state === 'error'
            ? `Ошибка сохранения в память${fact ? `: ${fact}` : ''}`
            : `Сохранил в память${fact ? `: ${fact}` : ''}`,
        icon: <Brain size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
      };
    }
    case 'install_mcp_server': {
      const source = typeof inv.args?.source === 'string' ? inv.args.source : '';
      return {
        title:
          inv.state === 'running'
            ? `Установка MCP-сервера${source ? `: ${source}` : '...'}`
            : inv.state === 'error'
              ? `Ошибка установки MCP-сервера${source ? `: ${source}` : ''}`
              : `Установлен MCP-сервер${source ? `: ${source}` : ''}`,
        icon: <Terminal size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
      };
    }
    default: {
      const lowerName = inv.toolName.toLowerCase();
      if (lowerName === 'web_search' || lowerName.endsWith('_web_search')) {
        const query =
          (typeof inv.args?.query === 'string' && inv.args.query) ||
          (typeof inv.args?.objective === 'string' && inv.args.objective) ||
          (Array.isArray(inv.args?.search_queries) && inv.args.search_queries[0]) ||
          '';
        return {
          title:
            inv.state === 'error'
              ? `Ошибка поиска в интернете${query ? `: ${query}` : ''}`
              : `Ищу в интернете${query ? `: ${query}` : ''}`,
          icon: <Search size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
        };
      }
      if (lowerName === 'web_fetch' || lowerName.endsWith('_web_fetch')) {
        const url =
          (typeof inv.args?.url === 'string' && inv.args.url) ||
          (Array.isArray(inv.args?.urls) && inv.args.urls[0]) ||
          '';
        return {
          title:
            inv.state === 'error'
              ? `Ошибка загрузки страницы${url ? `: ${url}` : ''}`
              : `Читаю страницу${url ? `: ${url}` : ''}`,
          icon: <Globe size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
        };
      }
      return {
        title:
          inv.state === 'running'
            ? `Выполняется ${inv.toolName}...`
            : `Выполнено: ${inv.toolName}`,
        filePath,
        icon: <Wrench size={16} className="w-4 h-4 text-zinc-400 shrink-0" />,
      };
    }
  }
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({
  reasoningText,
  toolInvocations = [],
  isStreaming = false,
  onSelectFile,
  onOpenTerminal,
}) => {
  const hasRunningTools = toolInvocations.some((t) => t.state === 'running');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  if (!reasoningText && toolInvocations.length === 0) {
    return null;
  }

  const headerLabel = hasRunningTools
    ? 'Выполнение действий...'
    : isStreaming && reasoningText
      ? 'Размышления...'
      : reasoningText && toolInvocations.length > 0
        ? `Размышления и действия (${toolInvocations.length})`
        : reasoningText
          ? 'Размышления'
          : `Действия агента (${toolInvocations.length})`;

  return (
    <div className="mb-3 rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] overflow-hidden spring-transition">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full px-3.5 py-2 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasRunningTools || (isStreaming && reasoningText) ? (
            <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin shrink-0" />
          ) : (
            <Brain className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
          <span className="text-xs font-medium text-zinc-300 truncate">
            {headerLabel}
          </span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 shrink-0 spring-transition ${
            isExpanded ? 'rotate-180 text-zinc-300' : ''
          }`}
        />
      </button>

      <div
        className={`grid spring-transition ${
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3 pt-1.5 space-y-2 border-t border-white/[0.06]">
            {reasoningText && (
              <div className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap pl-2.5 border-l-2 border-white/15">
                {reasoningText}
              </div>
            )}

            {toolInvocations.length > 0 && (
              <div className="space-y-1.5">
                {toolInvocations.map((inv) => {
                  const { title, filePath, command, icon } = getToolLabel(inv);
                  return (
                    <div
                      key={inv.toolCallId}
                      className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                        inv.state === 'running'
                          ? 'bg-orange-500/10 border-orange-500/30 text-orange-200'
                          : inv.state === 'error'
                            ? 'bg-red-500/10 border-red-500/30 text-red-200'
                            : 'bg-black/30 border-white/[0.07] text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 truncate">
                        {icon}
                        <span className="shrink-0">{title}</span>
                        {filePath && (
                          <button
                            type="button"
                            onClick={() => onSelectFile && onSelectFile(filePath)}
                            className={`font-mono px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-zinc-200 truncate max-w-[200px] ${
                              onSelectFile
                                ? 'hover:border-orange-500/50 hover:text-orange-300 cursor-pointer'
                                : ''
                            }`}
                            title={filePath}
                          >
                            {filePath}
                          </button>
                        )}
                        {command && (
                          <code
                            className="font-mono px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-zinc-200 truncate max-w-[220px]"
                            title={command}
                          >
                            {command}
                          </code>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {inv.toolName === 'execute_command' && inv.state === 'running' && (
                          <button
                            type="button"
                            onClick={() => stopTerminalProcess(inv.toolCallId)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-[11px] font-medium text-red-300 border border-red-500/30 cursor-pointer"
                            title="Остановить выполняемый процесс"
                          >
                            <Square className="w-2.5 h-2.5 fill-current" />
                            <span>Остановить процесс</span>
                          </button>
                        )}
                        {inv.toolName === 'execute_command' && onOpenTerminal && (
                          <button
                            type="button"
                            onClick={() => onOpenTerminal(inv.toolCallId)}
                            className="px-2 py-0.5 rounded bg-white/[0.07] hover:bg-white/[0.12] text-[11px] text-zinc-200 border border-white/10 cursor-pointer"
                          >
                            Терминал
                          </button>
                        )}
                        {inv.state === 'running' && (
                          <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />
                        )}
                        {inv.state === 'completed' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        {inv.state === 'error' && (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
