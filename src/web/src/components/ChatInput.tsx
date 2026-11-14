import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square, Cpu, Paperclip, X, FileText, AlertTriangle } from 'lucide-react';
import { Message, TokenUsage, ChatAttachment } from '../types.js';
import { ToggleSwitch } from './ToggleSwitch.js';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'css', 'scss', 'less', 'html', 'htm', 'xml', 'yaml', 'yml', 'toml',
  'ini', 'env', 'sh', 'bash', 'zsh', 'sql', 'csv', 'log', 'rs', 'go',
  'java', 'c', 'cpp', 'h', 'hpp', 'php', 'rb', 'swift', 'kt', 'vue', 'svelte',
]);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export async function readFilesAsAttachments(
  fileList: FileList | File[]
): Promise<ChatAttachment[]> {
  const files = Array.from(fileList);
  const results: ChatAttachment[] = [];

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = file.type.startsWith('image/') || IMAGE_EXTS.has(ext);

    if (isImage) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        results.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          type: 'image',
          mimeType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext || 'png'}`,
          size: file.size,
          dataUrl,
        });
      } catch (err) {
        console.error('Failed to read image attachment:', file.name, err);
      }
      continue;
    }

    const isText =
      file.type.startsWith('text/') ||
      file.type === 'application/json' ||
      file.type === 'application/javascript' ||
      file.type === 'application/xml' ||
      TEXT_EXTS.has(ext) ||
      !file.type;

    if (isText) {
      try {
        const content = await readFileAsText(file);
        results.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          type: 'text',
          mimeType: file.type || 'text/plain',
          size: file.size,
          content,
        });
      } catch (err) {
        console.error('Failed to read text attachment:', file.name, err);
      }
    }
  }

  return results;
}

export function calculateContextTokens(
  messages: Message[],
  streamingText = '',
  inputDraft = ''
): { usedTokens: number; lastUsage?: TokenUsage } {
  let baseTokens = 0;
  let lastUsageIndex = -1;
  let lastUsage: TokenUsage | undefined;

  for (let i = messages.length - 1; i >= 0; i--) {
    const u = messages[i].usage;
    if (u && typeof u.totalTokens === 'number' && u.totalTokens > 0) {
      baseTokens = u.totalTokens;
      lastUsageIndex = i;
      lastUsage = u;
      break;
    }
  }

  let extraChars = 0;
  for (let i = lastUsageIndex + 1; i < messages.length; i++) {
    extraChars += messages[i].content?.length || 0;
  }
  if (streamingText) {
    extraChars += streamingText.length;
  }
  if (inputDraft) {
    extraChars += inputDraft.length;
  }

  const extraTokens = extraChars > 0 ? Math.max(1, Math.ceil(extraChars / 3.8)) : 0;
  return {
    usedTokens: baseTokens + extraTokens,
    lastUsage,
  };
}

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  messages?: Message[];
  streamingText?: string;
  contextLimit?: number;
  attachments?: ChatAttachment[];
  onAddAttachments?: (items: ChatAttachment[]) => void;
  onRemoveAttachment?: (id: string) => void;
  showFullAccessToggle?: boolean;
  fullAccess?: boolean;
  onToggleFullAccess?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  messages = [],
  streamingText = '',
  contextLimit = 128000,
  attachments = [],
  onAddAttachments,
  onRemoveAttachment,
  showFullAccessToggle = false,
  fullAccess = false,
  onToggleFullAccess,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && (input.trim() || attachments.length > 0) && !disabled) {
        onSend();
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      e.target.value = '';
      const parsed = await readFilesAsAttachments(files);
      if (parsed.length > 0 && onAddAttachments) {
        onAddAttachments(parsed);
      }
    }
  };

  const canSend = Boolean((input.trim() || attachments.length > 0) && !disabled);
  const MAX_BASE64_BYTES = 5 * 1024 * 1024;
  const oversizedImages = attachments.filter(
    (att) =>
      att.type === 'image' &&
      ((att.dataUrl ? att.dataUrl.length : 0) > MAX_BASE64_BYTES || att.size > MAX_BASE64_BYTES)
  );

  const safeLimit = contextLimit > 0 ? contextLimit : 128000;
  const { usedTokens, lastUsage } = calculateContextTokens(messages, streamingText, input);
  const ratio = Math.min(1, usedTokens / safeLimit);
  const percent = ratio * 100;

  const isCritical = ratio >= 0.92;
  const isWarning = ratio >= 0.8 && !isCritical;

  const barColorClass = isCritical
    ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
    : isWarning
      ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
      : 'bg-emerald-400/80';

  const textColorClass = isCritical
    ? 'text-red-400 font-medium'
    : isWarning
      ? 'text-amber-300 font-medium'
      : 'text-zinc-400';

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4 pt-1.5">
      {/* Context Token Usage Indicator */}
      <div className="mb-2 px-3 py-1.5 rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <div className={`flex items-center gap-1.5 ${textColorClass}`}>
            <Cpu className="w-3 h-3 shrink-0 opacity-75" />
            <span>
              Контекст: {usedTokens.toLocaleString('ru-RU')} / {safeLimit.toLocaleString('ru-RU')} токенов
            </span>
          </div>

          <div className="flex items-center gap-2 text-zinc-500">
            {lastUsage && (
              <span className="hidden sm:inline text-[10px] text-zinc-500">
                in: {lastUsage.promptTokens.toLocaleString('ru-RU')} · out:{' '}
                {lastUsage.completionTokens.toLocaleString('ru-RU')}
              </span>
            )}
            <span className={textColorClass}>{percent.toFixed(1)}%</span>
          </div>
        </div>

        <div className="w-full h-1 rounded-full bg-white/[0.07] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
            style={{ width: `${Math.max(usedTokens > 0 ? 1.5 : 0, percent)}%` }}
          />
        </div>
      </div>

      {/* Input Capsule */}
      <div className="relative rounded-2xl liquid-glass focus-within:border-white/20 spring-transition">
        {/* Oversized Base64 Image Warning (> 5 MB) */}
        {oversizedImages.length > 0 && (
          <div className="px-3.5 py-2 border-b border-amber-500/25 bg-amber-500/10 rounded-t-2xl flex items-center gap-2 text-[11px] text-amber-200 animate-message-in">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              Изображение{' '}
              <span className="font-mono font-medium text-amber-100">
                {oversizedImages.map((i) => i.name).join(', ')}
              </span>{' '}
              превышает 5 МБ (base64) — это может превысить лимиты контекста модели.
            </span>
          </div>
        )}

        {/* Attachment Preview Strip (Horizontal scroll on mobile / multiple files) */}
        {attachments.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto px-3 pt-3 pb-1.5 border-b border-white/[0.06]">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group shrink-0 animate-message-in"
              >
                {att.type === 'image' && att.dataUrl ? (
                  <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/15 bg-black/40 shadow-md shadow-black/40">
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-14 px-3 rounded-xl border border-white/15 bg-white/[0.06] backdrop-blur-xl shadow-md shadow-black/30 flex items-center gap-2 max-w-[180px]">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-200 truncate">
                        {att.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        {att.size < 1024
                          ? `${att.size} B`
                          : `${(att.size / 1024).toFixed(1)} KB`}
                      </div>
                    </div>
                  </div>
                )}

                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(att.id)}
                    title="Удалить файл"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-900/95 border border-white/20 text-zinc-300 hover:text-white hover:bg-red-500/90 flex items-center justify-center shadow-md cursor-pointer transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.markdown,.json,.js,.jsx,.ts,.tsx,.py,.css,.scss,.html,.htm,.xml,.yaml,.yml,.sql,.csv,.log,.sh,.rs,.go,.java,.c,.cpp,.h,.env"
            className="sr-only"
            onChange={handleFileChange}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение для Phoenix..."
            rows={1}
            disabled={disabled}
            className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none max-h-44 overflow-y-auto leading-relaxed"
          />

          <div className="px-2.5 pb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={disabled || isStreaming}
                onClick={() => fileInputRef.current?.click()}
                title="Прикрепить файл или изображение"
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] spring-press cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {showFullAccessToggle && onToggleFullAccess && (
                <ToggleSwitch
                  checked={fullAccess}
                  onChange={onToggleFullAccess}
                  label="Full Access"
                  disabled={isStreaming}
                  title={
                    fullAccess
                      ? 'Full Access включён: агент выполняет любые действия без подтверждения'
                      : 'Безопасный режим: агент запрашивает разрешение на запись, удаление и опасные команды'
                  }
                />
              )}
            </div>

            <div>
              {isStreaming ? (
                <button
                  onClick={onStop}
                  type="button"
                  title="Остановить генерацию"
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center spring-press cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={!canSend}
                  type="button"
                  title="Отправить сообщение"
                  className={`w-8 h-8 rounded-full flex items-center justify-center spring-press ${
                    canSend
                      ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-950/40 cursor-pointer'
                      : 'bg-white/[0.06] text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end mt-1.5 px-2 text-[11px] text-zinc-500">
        <span>Phoenix Local Agent</span>
      </div>
    </div>
  );
};
