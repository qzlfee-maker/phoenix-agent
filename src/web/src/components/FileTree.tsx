import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  File as FileIcon,
  Image as ImageIcon,
  ChevronRight,
  ChevronDown,
  Upload,
  FilePlus,
  RefreshCw,
  Check,
  X,
  Trash2,
  Eye,
} from 'lucide-react';
import { FileTreeNode } from '../types.js';

interface FileTreeProps {
  files: FileTreeNode[];
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string) => Promise<void>;
  onDeleteFile?: (path: string) => void;
  onUploadFiles: (files: FileList | File[]) => Promise<void>;
  onRefresh: () => void;
  isLoading?: boolean;
}

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'go':
    case 'rs':
    case 'html':
    case 'css':
      return <FileCode className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return <FileJson className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    case 'md':
    case 'txt':
      return <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    default:
      return <FileIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
  }
};

interface TreeNodeItemProps {
  node: FileTreeNode;
  depth: number;
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onContextMenuFile: (e: React.MouseEvent, path: string) => void;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  node,
  depth,
  activeFilePath,
  onSelectFile,
  onDeleteFile,
  onContextMenuFile,
}) => {
  const [expanded, setExpanded] = useState(true);
  const isDirectory = node.type === 'directory';
  const isActive = !isDirectory && activeFilePath === node.path;

  return (
    <div>
      <div
        onClick={() => {
          if (isDirectory) {
            setExpanded(!expanded);
          } else {
            onSelectFile(node.path);
          }
        }}
        onContextMenu={(e) => {
          if (!isDirectory) {
            onContextMenuFile(e, node.path);
          }
        }}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
        className={`group w-full flex items-center justify-between gap-1.5 pr-2 py-1.5 rounded-xl text-xs font-mono spring-press cursor-pointer text-left ${
          isActive
            ? 'bg-white/[0.1] text-white border border-white/[0.08] font-medium'
            : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 border border-transparent'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">
          {isDirectory ? (
            <>
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              )}
              {expanded ? (
                <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
              )}
            </>
          ) : (
            <>
              <span className="w-3.5 shrink-0" />
              {getFileIcon(node.name)}
            </>
          )}
          <span className="truncate">{node.name}</span>
        </div>

        {!isDirectory && onDeleteFile && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFile(node.path);
            }}
            title="Удалить файл"
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer shrink-0"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {isDirectory && expanded && node.children && node.children.length > 0 && (
        <div className="space-y-0.5 mt-0.5">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onSelectFile={onSelectFile}
              onDeleteFile={onDeleteFile}
              onContextMenuFile={onContextMenuFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  activeFilePath,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onUploadFiles,
  onRefresh,
  isLoading = false,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const handleContextMenuFile = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 190),
      y: Math.min(e.clientY, window.innerHeight - 110),
      path: filePath,
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    await onCreateFile(trimmed);
    setNewFileName('');
    setIsCreating(false);
  };

  const handleUploadList = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    try {
      await onUploadFiles(files);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      await handleUploadList(droppedFiles);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-64 bg-zinc-950/50 backdrop-blur-2xl border-r border-white/[0.08] flex flex-col h-full select-none shrink-0 transition-colors ${
        isDragging ? 'bg-orange-500/10 border-orange-500/50' : ''
      }`}
    >
      {/* Explorer Header */}
      <div className="px-3.5 py-3 border-b border-white/[0.08] flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Файлы проекта
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            title="Создать файл"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] spring-press cursor-pointer"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Загрузить файлы"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] spring-press cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onRefresh}
            title="Обновить дерево"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] spring-press cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-orange-400' : ''}`} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                const pickedFiles = Array.from(e.target.files);
                e.target.value = '';
                void handleUploadList(pickedFiles);
              }
            }}
          />
        </div>
      </div>

      {/* Inline New File Creator */}
      {isCreating && (
        <form
          onSubmit={handleCreateSubmit}
          className="p-2 border-b border-white/[0.08] bg-black/30 flex items-center gap-1.5"
        >
          <input
            type="text"
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="src/index.ts"
            className="flex-1 bg-black/40 border border-white/15 focus:border-orange-500 rounded-lg px-2.5 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <button
            type="submit"
            className="p-1 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setNewFileName('');
            }}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {files.length === 0 ? (
          <div className="py-10 px-4 text-center text-xs text-zinc-500 space-y-2">
            <Folder className="w-7 h-7 mx-auto opacity-30 text-zinc-400" />
            <div>Папка проекта пуста</div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl liquid-glass-pill hover:bg-white/10 text-zinc-200 text-xs spring-press cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-orange-400" />
              <span>Загрузить файлы</span>
            </button>
          </div>
        ) : (
          files.map((node) => (
            <TreeNodeItem
              key={node.path}
              node={node}
              depth={0}
              activeFilePath={activeFilePath}
              onSelectFile={onSelectFile}
              onDeleteFile={onDeleteFile}
              onContextMenuFile={handleContextMenuFile}
            />
          ))
        )}
      </div>

      {/* Drag & Drop Footer Hint */}
      <button
        type="button"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
        className="m-2 p-2.5 rounded-xl border border-dashed border-white/[0.1] hover:border-orange-500/40 bg-white/[0.02] hover:bg-white/[0.04] text-center cursor-pointer spring-press disabled:opacity-50"
      >
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
          <Upload className={`w-3.5 h-3.5 text-orange-400 ${isUploading ? 'animate-pulse' : ''}`} />
          <span>{isUploading ? 'Загрузка файлов...' : 'Перетащите файлы или нажмите'}</span>
        </div>
      </button>

      {/* Apple Liquid Glass Context Menu */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-44 rounded-2xl liquid-glass-dark p-1.5 shadow-2xl shadow-black/80 animate-message-in"
        >
          <button
            type="button"
            onClick={() => {
              onSelectFile(contextMenu.path);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/10 spring-press cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-zinc-400" />
            <span>Открыть</span>
          </button>
          {onDeleteFile && (
            <button
              type="button"
              onClick={() => {
                onDeleteFile(contextMenu.path);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/15 spring-press cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить файл</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
