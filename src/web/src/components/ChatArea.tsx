import React, { useEffect, useRef, useState } from 'react';
import {
  Flame,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { Chat, Message, AppConfig, ToolInvocation, ChatAttachment } from '../types.js';
import { ChatMessage } from './ChatMessage.js';
import { ChatInput, readFilesAsAttachments } from './ChatInput.js';
import { ChatModelSelector } from './ChatModelSelector.js';

interface ChatAreaProps {
  chat: Chat | null;
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  onSend: (customContent?: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  streamingText: string;
  streamingToolInvocations?: ToolInvocation[];
  onUndoMessage?: (messageId: string) => Promise<void>;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  config: AppConfig | null;
  activeModel: string;
  activeProviderId?: string;
  onSelectModel: (model: string, providerId?: string) => void;
  onOpenSettings: () => void;
  attachments?: ChatAttachment[];
  onAddAttachments?: (items: ChatAttachment[]) => void;
  onRemoveAttachment?: (id: string) => void;
  fullAccess?: boolean;
  onToggleFullAccess?: () => void;
}

const STARTER_PROMPTS = [
  {
    title: 'Архитектура агента',
    desc: 'Как Phoenix работает локально и хранит данные в SQLite?',
  },
  {
    title: 'Написание кода',
    desc: 'Напиши Fastify плагин для аутентификации пользователей.',
  },
  {
    title: 'Оптимизация',
    desc: 'Как оптимизировать SQL запросы в high-load Node.js сервисе?',
  },
  {
    title: 'Проектирование',
    desc: 'Помоги спроектировать событийно-ориентированную систему.',
  },
];

export const ChatArea: React.FC<ChatAreaProps> = ({
  chat,
  messages,
  input,
  setInput,
  onSend,
  onStop,
  isStreaming,
  streamingText,
  streamingToolInvocations = [],
  onUndoMessage,
  onEditMessage,
  config,
  activeModel,
  activeProviderId,
  onSelectModel,
  onOpenSettings,
  attachments = [],
  onAddAttachments,
  onRemoveAttachment,
  fullAccess = false,
  onToggleFullAccess,
}) => {
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    if (!isDraggingFile) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFile(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onAddAttachments) {
      const parsed = await readFilesAsAttachments(e.dataTransfer.files);
      if (parsed.length > 0) {
        onAddAttachments(parsed);
      }
    }
  };

  return (
    <main
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative"
    >
      {isDraggingFile && (
        <div className="absolute inset-3 z-40 rounded-3xl border-2 border-dashed border-orange-400/60 bg-zinc-950/80 backdrop-blur-2xl flex flex-col items-center justify-center pointer-events-none animate-message-in">
          <div className="px-5 py-3 rounded-2xl liquid-glass text-sm font-medium text-zinc-100 shadow-2xl">
            Перетащите изображения или файлы, чтобы прикрепить к сообщению
          </div>
        </div>
      )}
      {/* Top Navbar */}
      <header className="h-15 border-b border-white/[0.08] px-6 flex items-center justify-between shrink-0 bg-zinc-950/60 backdrop-blur-2xl z-20">
        <div className="flex items-center gap-3 truncate">
          <h2 className="font-semibold text-sm sm:text-base text-zinc-100 tracking-tight truncate">
            {chat ? chat.title : 'Новый чат'}
          </h2>
          {chat && (
            <span className="text-xs text-zinc-500 font-mono hidden md:inline-block">
              {new Date(chat.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <ChatModelSelector
            config={config}
            activeModel={activeModel}
            activeProviderId={activeProviderId}
            onSelectModel={onSelectModel}
          />

          <button
            onClick={onOpenSettings}
            title="Настройки"
            className="h-9 w-9 flex items-center justify-center rounded-xl liquid-glass-pill text-zinc-400 hover:text-white hover:bg-white/[0.08] spring-press cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Warning banner if API key is not configured */}
      {!config?.isConfigured && (
        <div className="bg-amber-500/10 backdrop-blur-xl border-b border-amber-500/20 px-5 py-2.5 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>API-ключ не настроен. Добавьте его, чтобы агент мог отвечать.</span>
          </div>
          <button
            onClick={onOpenSettings}
            className="underline hover:text-white font-medium ml-2 cursor-pointer"
          >
            Настроить
          </button>
        </div>
      )}

      {/* Message List or Welcome State */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !isStreaming ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto animate-message-in">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white shadow-xl shadow-orange-500/20 mb-5">
              <Flame className="w-7 h-7 fill-current" />
            </div>

            <h3 className="text-xl font-semibold tracking-tight text-white mb-2">
              Чем могу помочь?
            </h3>
            <p className="text-sm text-zinc-400 max-w-md mb-8 leading-relaxed">
              Автономный local-first AI агент. Все диалоги и файлы проектов хранятся локально на вашем компьютере.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {STARTER_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSend(prompt.desc)}
                  className="text-left p-4 rounded-2xl liquid-glass hover:bg-white/[0.06] hover:border-white/15 text-xs group spring-press cursor-pointer"
                >
                  <div className="font-semibold text-zinc-200 group-hover:text-orange-400 transition-colors mb-1 tracking-tight">
                    {prompt.title}
                  </div>
                  <div className="text-zinc-400 text-xs leading-relaxed line-clamp-2">
                    {prompt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onUndo={onUndoMessage}
                onEdit={onEditMessage}
                disableEdit={isStreaming}
              />
            ))}

            {isStreaming && (
              <ChatMessage
                message={{
                  role: 'assistant',
                  content: streamingText || (streamingToolInvocations.length > 0 ? '' : '...'),
                  model: activeModel,
                  tool_invocations: streamingToolInvocations,
                }}
                isStreaming={true}
              />
            )}
            <div ref={scrollEndRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Input Capsule */}
      <ChatInput
        input={input}
        setInput={setInput}
        onSend={() => onSend()}
        onStop={onStop}
        isStreaming={isStreaming}
        disabled={!config?.isConfigured}
        messages={messages}
        streamingText={streamingText}
        contextLimit={config?.contextLimit}
        attachments={attachments}
        onAddAttachments={onAddAttachments}
        onRemoveAttachment={onRemoveAttachment}
        showFullAccessToggle={true}
        fullAccess={fullAccess}
        onToggleFullAccess={onToggleFullAccess}
      />
    </main>
  );
};
