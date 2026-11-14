import React, { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Save,
  Check,
  FileCode,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  X,
} from 'lucide-react';
import { ImageViewer } from './ImageViewer.js';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);

export function isImageFile(filePath: string | null): boolean {
  if (!filePath) return false;
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.has(ext);
}

interface CodeEditorProps {
  projectId: string;
  filePath: string | null;
  content: string;
  rawVersion?: number;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => Promise<void>;
  agentUpdatedNotice?: boolean;
  hasExternalUpdate?: boolean;
  onAcceptExternalUpdate?: () => void;
  onDismissExternalUpdate?: () => void;
}

function detectLanguage(filePath: string | null): string {
  if (!filePath) return 'plaintext';
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'json':
      return 'json';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'py':
      return 'python';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    case 'sql':
      return 'sql';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    default:
      return 'plaintext';
  }
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  projectId,
  filePath,
  content,
  rawVersion = 0,
  isDirty,
  isSaving,
  onChange,
  onSave,
  agentUpdatedNotice = false,
  hasExternalUpdate = false,
  onAcceptExternalUpdate,
  onDismissExternalUpdate,
}) => {
  const [savedNotice, setSavedNotice] = useState(false);
  const isImage = isImageFile(filePath);

  // Support Ctrl+S / Cmd+S to save text files
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (filePath && !isImage) {
          e.preventDefault();
          await onSave();
          setSavedNotice(true);
          setTimeout(() => setSavedNotice(false), 1800);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filePath, isImage, onSave]);

  const handleSaveClick = async () => {
    await onSave();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1800);
  };

  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950/60 backdrop-blur-xl text-zinc-500 p-6 select-none animate-message-in">
        <FileCode className="w-12 h-12 mb-3 opacity-20 text-zinc-400" />
        <p className="text-sm font-medium text-zinc-400">Файл не выбран</p>
        <p className="text-xs text-zinc-500 mt-1">
          Выберите файл в дереве слева или создайте новый
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950/60 overflow-hidden min-w-0 animate-message-in">
      {/* Editor Toolbar */}
      <div className="h-11 px-4 border-b border-white/[0.08] bg-white/[0.02] backdrop-blur-xl flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 truncate">
          {isImage ? (
            <ImageIcon className="w-4 h-4 text-orange-400 shrink-0" />
          ) : (
            <FileCode className="w-4 h-4 text-orange-400 shrink-0" />
          )}
          <span className="text-xs font-mono text-zinc-200 truncate">{filePath}</span>
          {!isImage && isDirty && (
            <span
              className="w-2 h-2 rounded-full bg-orange-500 shrink-0"
              title="Несохранённые изменения"
            />
          )}
          {agentUpdatedNotice && (!isDirty || isImage) && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-medium text-emerald-300 animate-message-in">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Обновлено агентом</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isImage ? (
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] font-mono text-zinc-400">
              Предпросмотр изображения
            </span>
          ) : (
            <>
              {savedNotice && (
                <span className="flex items-center gap-1 text-xs text-emerald-400 animate-message-in">
                  <Check className="w-3.5 h-3.5" />
                  <span>Сохранено</span>
                </span>
              )}

              <button
                type="button"
                onClick={handleSaveClick}
                disabled={isSaving || !isDirty}
                title="Сохранить (Ctrl+S)"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium spring-press cursor-pointer ${
                  isDirty
                    ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-950/40'
                    : 'bg-white/[0.05] text-zinc-500 border border-white/[0.07] cursor-not-allowed'
                }`}
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Сохранить</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dirty State Conflict Protection Banner */}
      {!isImage && hasExternalUpdate && (
        <div className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/30 backdrop-blur-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200 animate-message-in">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Агент изменил файл <code className="font-mono text-amber-100">{filePath}</code> на
              диске, но у вас есть несохранённые изменения.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onAcceptExternalUpdate}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold spring-press cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Загрузить версию агента</span>
            </button>
            <button
              type="button"
              onClick={onDismissExternalUpdate}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 spring-press cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Оставить мои правки</span>
            </button>
          </div>
        </div>
      )}

      {/* Image Viewer or Monaco Editor */}
      {isImage ? (
        <ImageViewer
          src={`/api/projects/${projectId}/raw?path=${encodeURIComponent(filePath)}&v=${rawVersion}`}
          filePath={filePath}
        />
      ) : (
        <div className="flex-1 relative">
          <Editor
            height="100%"
            language={detectLanguage(filePath)}
            theme="vs-dark"
            value={content}
            onChange={(val) => onChange(val ?? '')}
            options={{
              fontSize: 13,
              fontFamily: "'IBM Plex Mono', monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              largeFileOptimizations: true,
              wordWrap: 'on',
              padding: { top: 14, bottom: 14 },
              renderLineHighlight: 'all',
              smoothScrolling: true,
            }}
          />
        </div>
      )}
    </div>
  );
};
