import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Copy,
  Check,
  Flame,
  Loader2,
  RotateCcw,
  Cpu,
  FileText,
  Pencil,
  X,
} from 'lucide-react';
import { Message, ToolInvocation, TokenUsage, ChatAttachment } from '../types.js';
import { ReasoningBlock } from './ReasoningBlock.js';

interface ChatMessageProps {
  message:
    | Message
    | {
        id?: string;
        role: 'user' | 'assistant';
        content: string;
        attachments?: ChatAttachment[];
        model?: string | null;
        usage?: TokenUsage;
        created_at?: number;
        tool_invocations?: ToolInvocation[];
        has_undoable_changes?: boolean;
        changes_undone?: boolean;
      };
  isStreaming?: boolean;
  onUndo?: (messageId: string) => Promise<void>;
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
  disableEdit?: boolean;
  onSelectFile?: (filePath: string) => void;
  onOpenTerminal?: (toolCallId: string) => void;
}

/**
 * Extracts <think>...</think> reasoning blocks if present in model output
 */
function parseReasoningContent(raw: string): {
  reasoning: string | undefined;
  cleanContent: string;
} {
  if (!raw) return { reasoning: undefined, cleanContent: '' };

  const closedMatch = raw.match(/<think>([\s\S]*?)<\/think>/i);
  if (closedMatch) {
    const reasoning = closedMatch[1].trim();
    const cleanContent = raw.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    return { reasoning: reasoning || undefined, cleanContent };
  }

  const openIdx = raw.indexOf('<think>');
  if (openIdx !== -1) {
    const reasoning = raw.slice(openIdx + 7).trim();
    const cleanContent = raw.slice(0, openIdx).trim();
    return { reasoning: reasoning || '...', cleanContent };
  }

  return { reasoning: undefined, cleanContent: raw };
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isStreaming = false,
  onUndo,
  onEdit,
  disableEdit = false,
  onSelectFile,
  onOpenTerminal,
}) => {
  const isAssistant = message.role === 'assistant';
  const [copied, setCopied] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(message.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [isEditing, draftContent]);

  const startEditing = () => {
    setDraftContent(message.content);
    setIsEditing(true);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, 10);
  };

  const cancelEditing = () => {
    setDraftContent(message.content);
    setIsEditing(false);
  };

  const saveEditing = async () => {
    const trimmed = draftContent.trim();
    if (!trimmed || !onEdit || !('id' in message) || !message.id || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      setIsEditing(false);
      await onEdit(message.id, trimmed);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const { reasoning, cleanContent } = useMemo(
    () => parseReasoningContent(message.content),
    [message.content]
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanContent || message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUndoClick = async () => {
    if (!onUndo || !('id' in message) || !message.id || isUndoing) return;
    setIsUndoing(true);
    try {
      await onUndo(message.id);
    } finally {
      setIsUndoing(false);
    }
  };

  const toolInvocations = message.tool_invocations || [];
  const hasFileMutations =
    Boolean(message.has_undoable_changes) ||
    toolInvocations.some(
      (t) =>
        (t.toolName === 'write_file' || t.toolName === 'delete_file') &&
        t.state === 'completed'
    );

  const showUndoAction =
    !isStreaming && hasFileMutations && Boolean(onUndo) && 'id' in message && Boolean(message.id);

  // User Message: Clean dark glass bubble with multimodal attachments + inline editing
  if (!isAssistant) {
    const attachments = message.attachments || [];
    const canEdit = Boolean(onEdit && 'id' in message && message.id && !disableEdit && !isStreaming);

    return (
      <div className="group w-full py-2.5 px-4 md:px-6 animate-message-in">
        <div className="max-w-3xl mx-auto flex flex-col items-end">
          <div
            className={`transition-all duration-200 rounded-2xl rounded-br-sm bg-white/[0.09] backdrop-blur-xl border border-white/[0.1] text-zinc-100 px-4 py-3 shadow-lg shadow-black/30 text-sm leading-relaxed space-y-2.5 ${
              isEditing ? 'w-full sm:w-[75%]' : 'max-w-[85%] sm:max-w-[75%]'
            }`}
          >
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) =>
                  att.type === 'image' && att.dataUrl ? (
                    <div
                      key={att.id}
                      className="rounded-xl overflow-hidden border border-white/15 bg-black/40 shadow-md shadow-black/40 max-w-full"
                    >
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="max-h-60 max-w-full object-contain block"
                      />
                    </div>
                  ) : (
                    <div
                      key={att.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.07] border border-white/[0.12] backdrop-blur-xl shadow-sm max-w-full"
                    >
                      <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0">
                        <FileText className="w-3.5 h-3.5 text-orange-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-100 truncate max-w-[180px]">
                          {att.name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400">
                          {att.size < 1024
                            ? `${att.size} B`
                            : `${(att.size / 1024).toFixed(1)} KB`}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {isEditing ? (
              <div className="space-y-2.5">
                <textarea
                  ref={textareaRef}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEditing();
                    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      saveEditing();
                    }
                  }}
                  rows={1}
                  className="w-full resize-none overflow-hidden rounded-xl bg-black/35 border border-white/15 focus:border-orange-500/60 px-3 py-2 text-sm text-zinc-100 leading-relaxed focus:outline-none transition-all"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={isSavingEdit}
                    title="Отмена"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs text-zinc-300 spring-press cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Отмена</span>
                  </button>
                  <button
                    type="button"
                    onClick={saveEditing}
                    disabled={isSavingEdit || !draftContent.trim()}
                    title="Сохранить и переотправить"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-xs font-medium text-orange-200 spring-press cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Сохранить</span>
                  </button>
                </div>
              </div>
            ) : (
              message.content && (
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
              )
            )}
          </div>

          {canEdit && !isEditing && (
            <div className="mt-1 flex justify-end opacity-40 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={startEditing}
                title="Редактировать сообщение"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.07] transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant Message: Borderless layout on glass
  return (
    <div className="group w-full py-4 px-4 md:px-6 animate-message-in">
      <div className="max-w-3xl mx-auto flex gap-3.5 items-start">
        <div className="shrink-0 mt-0.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
            <Flame className="w-4 h-4 fill-current" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-zinc-200 tracking-tight">
              Phoenix
            </span>
          </div>

          <ReasoningBlock
            reasoningText={reasoning}
            toolInvocations={toolInvocations}
            isStreaming={isStreaming}
            onSelectFile={onSelectFile}
            onOpenTerminal={onOpenTerminal}
          />

          <div className="text-sm text-zinc-200 leading-relaxed break-words space-y-3 prose prose-invert max-w-none">
            {cleanContent && (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }: any) {
                    const isInline =
                      !className && typeof children === 'string' && !children.includes('\n');
                    if (isInline) {
                      return (
                        <code
                          className="bg-white/[0.08] text-orange-300 px-1.5 py-0.5 rounded-md text-xs font-mono border border-white/[0.08]"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <div className="relative my-3 rounded-xl overflow-hidden border border-white/[0.08] bg-black/50 backdrop-blur-xl">
                        <pre className="p-4 text-xs overflow-x-auto text-zinc-200 font-mono leading-relaxed">
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </pre>
                      </div>
                    );
                  },
                  p({ children }) {
                    return <p className="mb-2.5 last:mb-0 text-zinc-200">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="list-disc pl-5 my-2 space-y-1 text-zinc-300">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="list-decimal pl-5 my-2 space-y-1 text-zinc-300">{children}</ol>;
                  },
                  li({ children }) {
                    return <li className="text-zinc-300">{children}</li>;
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-l-2 border-orange-500/60 pl-3.5 my-2.5 text-zinc-400 italic">
                        {children}
                      </blockquote>
                    );
                  },
                }}
              >
                {cleanContent}
              </ReactMarkdown>
            )}

            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 rounded-sm bg-orange-500 animate-cursor align-middle" />
            )}
          </div>

          {/* Copy, Model Badge & Undo Footer */}
          {(!isStreaming || message.model || showUndoAction) && (
            <div className="mt-3 pt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {!isStreaming && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.07] opacity-50 group-hover:opacity-100 hover:opacity-100 transition-all cursor-pointer"
                    title="Скопировать ответ"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}

                {message.model && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] backdrop-blur-md border border-white/[0.08] text-[11px] font-mono text-zinc-400 shadow-sm">
                    <Cpu className="w-3 h-3 text-orange-400/85 shrink-0" />
                    <span className="truncate max-w-[260px] text-zinc-300">{message.model}</span>
                    {message.usage && message.usage.completionTokens > 0 && (
                      <span className="text-zinc-500 pl-1 border-l border-white/[0.08]">
                        {message.usage.completionTokens.toLocaleString('ru-RU')} ток.
                      </span>
                    )}
                  </div>
                )}
              </div>

              {showUndoAction && (
                <div>
                  {message.changes_undone ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 bg-white/[0.04] border border-white/[0.08] px-3 py-1 rounded-xl">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Изменения отменены (файлы восстановлены)</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleUndoClick}
                      disabled={isUndoing}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] px-3 py-1 rounded-xl spring-press cursor-pointer disabled:opacity-50"
                    >
                      {isUndoing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
                      )}
                      <span>Отменить изменения</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
