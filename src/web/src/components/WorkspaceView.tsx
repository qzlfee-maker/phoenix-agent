import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderKanban,
  FolderOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  ChevronDown,
  ChevronUp,
  Terminal,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Square,
} from 'lucide-react';
import { ChatModelSelector } from './ChatModelSelector.js';
import { stopTerminalProcess } from '../api.js';
import {
  Project,
  Chat,
  FileTreeNode,
  Message,
  AppConfig,
  ToolInvocation,
  ProjectFileEvent,
  TerminalEvent,
  TerminalLogItem,
} from '../types.js';
import {
  fetchProjectFiles,
  readProjectFile,
  saveProjectFile,
  deleteProjectFile,
  uploadProjectFiles,
  openProjectFolder,
} from '../api.js';
import { FileTree } from './FileTree.js';
import { CodeEditor, isImageFile } from './CodeEditor.js';
import { ChatMessage } from './ChatMessage.js';
import { ChatInput, readFilesAsAttachments } from './ChatInput.js';
import { ChatAttachment } from '../types.js';

interface WorkspaceViewProps {
  project: Project;
  activeChat?: Chat | null;
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  onSend: (customContent?: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  streamingText: string;
  streamingToolInvocations: ToolInvocation[];
  lastFileEvent: ProjectFileEvent | null;
  lastTerminalEvent?: TerminalEvent | null;
  onUndoMessage: (messageId: string) => Promise<void>;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  config: AppConfig | null;
  activeModel: string;
  activeProviderId?: string;
  onSelectModel: (model: string, providerId?: string) => void;
  onOpenSettings: () => void;
  attachments?: ChatAttachment[];
  onAddAttachments?: (items: ChatAttachment[]) => void;
  onRemoveAttachment?: (id: string) => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  project,
  activeChat,
  messages,
  input,
  setInput,
  onSend,
  onStop,
  isStreaming,
  streamingText,
  streamingToolInvocations,
  lastFileEvent,
  lastTerminalEvent,
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
}) => {
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(true);
  const [showTerminalPanel, setShowTerminalPanel] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<TerminalLogItem[]>([]);
  const [highlightedCmdId, setHighlightedCmdId] = useState<string | null>(null);
  const [isChatDraggingFile, setIsChatDraggingFile] = useState(false);
  const chatDragDepthRef = useRef(0);

  // Real-time sync, media & delete states
  const [agentUpdatedNotice, setAgentUpdatedNotice] = useState(false);
  const [pendingExternalContent, setPendingExternalContent] = useState<string | null>(null);
  const [rawVersion, setRawVersion] = useState(0);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  }, []);

  const activeFilePathRef = useRef<string | null>(null);
  const isDirtyRef = useRef<boolean>(false);
  const chatScrollEndRef = useRef<HTMLDivElement>(null);
  const terminalScrollEndRef = useRef<HTMLDivElement>(null);

  const isDirty = activeFilePath !== null && fileContent !== originalContent;

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    try {
      const tree = await fetchProjectFiles(project.id);
      setFiles(tree);
      return tree;
    } catch (err) {
      console.error('Failed to load project files:', err);
      return [];
    } finally {
      setIsLoadingFiles(false);
    }
  }, [project.id]);

  const handleOpenFile = useCallback(
    async (filePath: string) => {
      if (isImageFile(filePath)) {
        setActiveFilePath(filePath);
        setFileContent('');
        setOriginalContent('');
        setPendingExternalContent(null);
        setRawVersion((v) => v + 1);
        return;
      }

      try {
        const data = await readProjectFile(project.id, filePath);
        setActiveFilePath(filePath);
        setFileContent(data.content);
        setOriginalContent(data.content);
        setPendingExternalContent(null);
      } catch (err) {
        console.error('Failed to read file:', err);
      }
    },
    [project.id]
  );

  // Handle incoming real-time file events (from SSE stream or chat stream)
  const handleIncomingFileEvent = useCallback(
    async (event: ProjectFileEvent) => {
      if (event.projectId !== project.id) return;

      await loadFiles();

      const currentOpenPath = activeFilePathRef.current;
      const cleanEventPath = event.path.replace(/\\/g, '/').replace(/^\/+/, '');
      const cleanOpenPath = currentOpenPath
        ? currentOpenPath.replace(/\\/g, '/').replace(/^\/+/, '')
        : null;

      if (event.type === 'file_created' || event.type === 'file_updated') {
        if (cleanOpenPath === cleanEventPath) {
          if (isImageFile(cleanEventPath)) {
            setRawVersion((v) => v + 1);
            setAgentUpdatedNotice(true);
            setTimeout(() => setAgentUpdatedNotice(false), 3000);
            return;
          }

          try {
            const diskData = await readProjectFile(project.id, cleanEventPath);
            if (!isDirtyRef.current) {
              // Editor is clean: smoothly update content in real time
              setFileContent(diskData.content);
              setOriginalContent(diskData.content);
              setPendingExternalContent(null);
              setAgentUpdatedNotice(true);
              setTimeout(() => setAgentUpdatedNotice(false), 3000);
            } else {
              // User has unsaved edits: protect dirty state and show conflict banner
              if (diskData.content !== fileContent) {
                setPendingExternalContent(diskData.content);
              }
            }
          } catch (err) {
            console.error('Failed to reload updated file:', err);
          }
        } else if (!cleanOpenPath && event.type === 'file_created') {
          // If no file is currently open, auto-open newly created file
          handleOpenFile(cleanEventPath);
        }
      } else if (event.type === 'file_deleted') {
        if (cleanOpenPath === cleanEventPath) {
          setActiveFilePath(null);
          setFileContent('');
          setOriginalContent('');
          setPendingExternalContent(null);
        }
      }
    },
    [project.id, loadFiles, handleOpenFile, fileContent]
  );

  // Handle incoming real-time terminal events
  const handleIncomingTerminalEvent = useCallback(
    (event: TerminalEvent) => {
      if (event.projectId !== project.id) return;

      if (event.type === 'terminal_start') {
        setShowTerminalPanel(true);
        setTerminalLogs((prev) => {
          if (prev.some((item) => item.id === event.id)) return prev;
          return [
            ...prev,
            {
              id: event.id,
              projectId: event.projectId,
              command: event.command || '',
              stdout: '',
              stderr: '',
              exitCode: null,
              status: 'running',
              timestamp: event.timestamp,
            },
          ];
        });
      } else if (event.type === 'terminal_output') {
        setTerminalLogs((prev) =>
          prev.map((item) => {
            if (item.id !== event.id) return item;
            if (event.stream === 'stderr') {
              return { ...item, stderr: item.stderr + (event.chunk || '') };
            }
            return { ...item, stdout: item.stdout + (event.chunk || '') };
          })
        );
      } else if (event.type === 'terminal_exit') {
        setTerminalLogs((prev) =>
          prev.map((item) => {
            if (item.id !== event.id) return item;
            return {
              ...item,
              exitCode: typeof event.exitCode === 'number' ? event.exitCode : 1,
              status: event.status || (event.exitCode === 0 ? 'completed' : 'error'),
            };
          })
        );
      }
    },
    [project.id]
  );

  // Subscribe to project SSE endpoint GET /api/projects/:id/events
  useEffect(() => {
    const es = new EventSource(`/api/projects/${project.id}/events`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (
          data.type === 'file_created' ||
          data.type === 'file_updated' ||
          data.type === 'file_deleted'
        ) {
          handleIncomingFileEvent(data as ProjectFileEvent);
        } else if (
          data.type === 'terminal_start' ||
          data.type === 'terminal_output' ||
          data.type === 'terminal_exit'
        ) {
          handleIncomingTerminalEvent(data as TerminalEvent);
        }
      } catch {
        // Ignore non-JSON or ping frames
      }
    };

    return () => {
      es.close();
    };
  }, [project.id, handleIncomingFileEvent, handleIncomingTerminalEvent]);

  // Also react immediately to fileEvent passed from streamChat
  useEffect(() => {
    if (lastFileEvent && lastFileEvent.projectId === project.id) {
      handleIncomingFileEvent(lastFileEvent);
    }
  }, [lastFileEvent, project.id, handleIncomingFileEvent]);

  // React to terminalEvent passed from streamChat
  useEffect(() => {
    if (lastTerminalEvent && lastTerminalEvent.projectId === project.id) {
      handleIncomingTerminalEvent(lastTerminalEvent);
    }
  }, [lastTerminalEvent, project.id, handleIncomingTerminalEvent]);

  // Hydrate terminal logs from saved chat messages for this project
  useEffect(() => {
    const historical: TerminalLogItem[] = [];
    for (const msg of messages) {
      if (!msg.tool_invocations) continue;
      for (const inv of msg.tool_invocations) {
        if (inv.toolName === 'execute_command') {
          historical.push({
            id: inv.toolCallId,
            projectId: project.id,
            command: String(inv.args?.command || ''),
            stdout: inv.stdout || '',
            stderr: inv.stderr || '',
            exitCode: typeof inv.exitCode === 'number' ? inv.exitCode : inv.state === 'completed' ? 0 : 1,
            status: inv.state,
            timestamp: msg.created_at,
          });
        }
      }
    }
    if (historical.length > 0) {
      setTerminalLogs((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const merged = [...prev];
        for (const item of historical) {
          if (!existingIds.has(item.id)) {
            merged.push(item);
          }
        }
        return merged;
      });
    }
  }, [messages, project.id]);

  // Auto-scroll terminal when output arrives
  useEffect(() => {
    if (showTerminalPanel) {
      terminalScrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs, showTerminalPanel]);

  const handleFocusTerminalEntry = (toolCallId: string) => {
    setShowTerminalPanel(true);
    setHighlightedCmdId(toolCallId);
    setTimeout(() => {
      const el = document.getElementById(`term-cmd-${toolCallId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => setHighlightedCmdId(null), 2000);
    }, 100);
  };

  // Auto-scroll chat panel when messages or tool invocations update
  useEffect(() => {
    chatScrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, streamingToolInvocations]);

  // Load file tree when project changes and auto-open README.md if available
  useEffect(() => {
    setActiveFilePath(null);
    setFileContent('');
    setOriginalContent('');
    setPendingExternalContent(null);
    setTerminalLogs([]);

    loadFiles().then((tree) => {
      const readme = tree.find(
        (n) => n.type === 'file' && n.name.toLowerCase() === 'readme.md'
      );
      if (readme) {
        handleOpenFile(readme.path);
      } else {
        const firstFile = tree.find((n) => n.type === 'file');
        if (firstFile) {
          handleOpenFile(firstFile.path);
        }
      }
    });
  }, [project.id, loadFiles, handleOpenFile]);

  const handleSaveFile = async () => {
    if (!activeFilePath) return;
    setIsSaving(true);
    try {
      await saveProjectFile(project.id, activeFilePath, fileContent);
      setOriginalContent(fileContent);
      setPendingExternalContent(null);
    } catch (err) {
      console.error('Failed to save file:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAcceptExternalUpdate = () => {
    if (pendingExternalContent !== null) {
      setFileContent(pendingExternalContent);
      setOriginalContent(pendingExternalContent);
      setPendingExternalContent(null);
      setAgentUpdatedNotice(true);
      setTimeout(() => setAgentUpdatedNotice(false), 3000);
    }
  };

  const handleDismissExternalUpdate = () => {
    setPendingExternalContent(null);
  };

  const handleCreateFile = async (newPath: string) => {
    try {
      await saveProjectFile(project.id, newPath, '');
      await loadFiles();
      await handleOpenFile(newPath);
    } catch (err) {
      console.error('Failed to create file:', err);
    }
  };

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    try {
      const res = await uploadProjectFiles(project.id, fileList);
      await loadFiles();
      if (res.uploaded && res.uploaded.length > 0) {
        await handleOpenFile(res.uploaded[0]);
      }
    } catch (err) {
      console.error('Failed to upload files:', err);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await openProjectFolder(project.id);
    } catch (err) {
      console.error('Failed to open project folder:', err);
    }
  };

  const handleConfirmDeleteFile = async () => {
    if (!fileToDelete || isDeletingFile) return;
    setIsDeletingFile(true);
    const targetPath = fileToDelete;
    try {
      await deleteProjectFile(project.id, targetPath);
      await loadFiles();

      const cleanOpen = activeFilePath?.replace(/\\/g, '/').replace(/^\/+/, '');
      const cleanTarget = targetPath.replace(/\\/g, '/').replace(/^\/+/, '');
      if (cleanOpen === cleanTarget) {
        setActiveFilePath(null);
        setFileContent('');
        setOriginalContent('');
        setPendingExternalContent(null);
      }

      setFileToDelete(null);
      showToast('Файл удалён');
    } catch (err) {
      console.error('Failed to delete file:', err);
      showToast('Не удалось удалить файл');
    } finally {
      setIsDeletingFile(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full bg-transparent overflow-hidden z-10">
      {/* Workspace Header */}
      <header className="h-15 border-b border-white/[0.08] px-5 flex items-center justify-between shrink-0 bg-zinc-950/60 backdrop-blur-2xl z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold tracking-tight text-sm sm:text-base text-zinc-100 truncate">
                {project.name}
              </h2>
              <button
                type="button"
                onClick={handleOpenFolder}
                title="Открыть папку проекта в проводнике"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-orange-300 hover:bg-white/[0.06] spring-press cursor-pointer shrink-0"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono truncate">
              {project.directory_path}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ChatModelSelector
            config={config}
            activeModel={activeModel}
            activeProviderId={activeProviderId}
            onSelectModel={onSelectModel}
            compact
          />

          <button
            type="button"
            onClick={() => setShowTerminalPanel(!showTerminalPanel)}
            title={showTerminalPanel ? 'Скрыть терминал' : 'Показать терминал'}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 spring-press cursor-pointer ${
              showTerminalPanel
                ? 'bg-white/[0.1] border-white/20 text-white'
                : 'liquid-glass-pill text-zinc-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Терминал</span>
            {terminalLogs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[10px] font-mono text-zinc-300">
                {terminalLogs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowChatPanel(!showChatPanel)}
            title={showChatPanel ? 'Скрыть панель чата' : 'Показать панель чата'}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 spring-press cursor-pointer ${
              showChatPanel
                ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                : 'liquid-glass-pill text-zinc-400 hover:text-white'
            }`}
          >
            {showChatPanel ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            <span className="hidden md:inline">Чат</span>
          </button>

          <button
            onClick={onOpenSettings}
            title="Настройки"
            className="h-9 w-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white liquid-glass-pill hover:bg-white/[0.08] spring-press cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 3-Zone Workspace Body */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <FileTree
          files={files}
          activeFilePath={activeFilePath}
          onSelectFile={handleOpenFile}
          onCreateFile={handleCreateFile}
          onDeleteFile={(path) => setFileToDelete(path)}
          onUploadFiles={handleUploadFiles}
          onRefresh={loadFiles}
          isLoading={isLoadingFiles}
        />

        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <CodeEditor
            projectId={project.id}
            filePath={activeFilePath}
            content={fileContent}
            rawVersion={rawVersion}
            isDirty={isDirty}
            isSaving={isSaving}
            onChange={setFileContent}
            onSave={handleSaveFile}
            agentUpdatedNotice={agentUpdatedNotice}
            hasExternalUpdate={pendingExternalContent !== null}
            onAcceptExternalUpdate={handleAcceptExternalUpdate}
            onDismissExternalUpdate={handleDismissExternalUpdate}
          />

          {/* Slide-out Bottom Terminal Panel */}
          {showTerminalPanel && (
            <div className="h-64 border-t border-white/[0.08] bg-zinc-950/90 backdrop-blur-2xl flex flex-col shrink-0 animate-message-in">
              <div className="h-9 px-4 border-b border-white/[0.07] bg-white/[0.02] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                    Терминал проекта
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      config?.useDocker
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                    }`}
                  >
                    {config?.useDocker ? 'Docker Sandbox' : 'Прямое выполнение'}
                  </span>
                  {terminalLogs.some((l) => l.status === 'running') && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-[10px] text-orange-300">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      <span>Выполнение...</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {terminalLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTerminalLogs([])}
                      title="Очистить лог терминала"
                      className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTerminalPanel(false)}
                    title="Свернуть терминал"
                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-2.5">
                {terminalLogs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                    Команды агента в терминале будут отображаться здесь в реальном времени.
                  </div>
                ) : (
                  terminalLogs.map((item) => (
                    <div
                      key={item.id}
                      id={`term-cmd-${item.id}`}
                      className={`rounded-xl border p-2.5 transition-all ${
                        highlightedCmdId === item.id
                          ? 'border-orange-500/50 bg-orange-500/10'
                          : 'border-white/[0.08] bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-white/[0.07]">
                        <div className="flex items-center gap-2 min-w-0 truncate">
                          <span className="text-orange-400 font-bold select-none">$</span>
                          <span className="text-zinc-100 font-semibold truncate" title={item.command}>
                            {item.command}
                          </span>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5 text-[11px]">
                          {item.status === 'running' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => stopTerminalProcess(item.id)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-[10px] font-medium text-red-300 border border-red-500/30 cursor-pointer"
                              >
                                <Square className="w-2.5 h-2.5 fill-current" />
                                <span>Остановить процесс</span>
                              </button>
                              <span className="inline-flex items-center gap-1 text-orange-400">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>running</span>
                              </span>
                            </>
                          ) : item.exitCode === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>exit 0</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-400">
                              <AlertTriangle className="w-3 h-3" />
                              <span>exit {item.exitCode ?? 1}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {item.stdout && (
                        <pre className="text-zinc-200 whitespace-pre-wrap break-words leading-relaxed overflow-x-auto">
                          {item.stdout}
                        </pre>
                      )}

                      {item.stderr && (
                        <pre className="mt-1.5 text-red-300 bg-red-500/10 border-l-2 border-red-500/70 pl-2.5 py-1.5 rounded-r-lg whitespace-pre-wrap break-words leading-relaxed overflow-x-auto">
                          {item.stderr}
                        </pre>
                      )}

                      {!item.stdout && !item.stderr && item.status !== 'running' && (
                        <div className="text-zinc-500 italic text-[11px]">(пустой вывод)</div>
                      )}
                    </div>
                  ))
                )}
                <div ref={terminalScrollEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Contextual Chat Panel */}
        {showChatPanel && (
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              chatDragDepthRef.current += 1;
              setIsChatDraggingFile(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
              if (!isChatDraggingFile) setIsChatDraggingFile(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              chatDragDepthRef.current = Math.max(0, chatDragDepthRef.current - 1);
              if (chatDragDepthRef.current === 0) setIsChatDraggingFile(false);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              chatDragDepthRef.current = 0;
              setIsChatDraggingFile(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onAddAttachments) {
                const parsed = await readFilesAsAttachments(e.dataTransfer.files);
                if (parsed.length > 0) onAddAttachments(parsed);
              }
            }}
            className="w-80 lg:w-96 border-l border-white/[0.08] bg-zinc-950/60 backdrop-blur-2xl flex flex-col h-full shrink-0 relative"
          >
            {isChatDraggingFile && (
              <div className="absolute inset-2 z-40 rounded-2xl border-2 border-dashed border-orange-400/60 bg-zinc-950/85 backdrop-blur-2xl flex items-center justify-center p-4 text-center pointer-events-none animate-message-in">
                <div className="px-4 py-2.5 rounded-xl liquid-glass text-xs font-medium text-zinc-100 shadow-xl">
                  Перетащите файлы, чтобы прикрепить к сообщению
                </div>
              </div>
            )}
            <div className="h-11 px-4 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between gap-2 shrink-0">
              <span className="text-xs font-semibold text-zinc-200 truncate">
                {activeChat ? activeChat.title : 'Ассистент проекта'}
              </span>
              {activeFilePath && (
                <span className="text-[11px] font-mono text-orange-400 truncate max-w-[140px] shrink-0">
                  {activeFilePath}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {messages.length === 0 && !isStreaming ? (
                <div className="p-6 text-center text-xs text-zinc-500 space-y-2">
                  <p>
                    Агент подключён к файловой системе и терминалу проекта{' '}
                    <span className="text-zinc-200 font-semibold">{project.name}</span>.
                  </p>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Попросите написать код и проверить его работу — агент сам запустит команды и
                    исправит ошибки.
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      message={msg}
                      onUndo={onUndoMessage}
                      onEdit={onEditMessage}
                      disableEdit={isStreaming}
                      onSelectFile={handleOpenFile}
                      onOpenTerminal={handleFocusTerminalEntry}
                    />
                  ))}
                  {isStreaming && (
                    <ChatMessage
                      message={{
                        role: 'assistant',
                        content: streamingText,
                        model: activeModel,
                        tool_invocations: streamingToolInvocations,
                      }}
                      isStreaming={true}
                      onSelectFile={handleOpenFile}
                      onOpenTerminal={handleFocusTerminalEntry}
                    />
                  )}
                  <div ref={chatScrollEndRef} className="h-2" />
                </>
              )}
            </div>

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
            />
          </div>
        )}
      </div>

      {/* Apple Liquid Glass Delete Confirmation Modal */}
      {fileToDelete && (
        <div
          onClick={() => !isDeletingFile && setFileToDelete(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-message-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl liquid-glass-dark p-6 shadow-2xl shadow-black/80 text-center space-y-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-white tracking-tight">
                Удалить файл?
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Файл{' '}
                <code className="px-1.5 py-0.5 rounded bg-white/[0.07] border border-white/10 font-mono text-zinc-200 break-all">
                  {fileToDelete}
                </code>{' '}
                будет удалён с диска без возможности восстановления.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingFile}
                onClick={() => setFileToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-zinc-200 spring-press cursor-pointer disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isDeletingFile}
                onClick={handleConfirmDeleteFile}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-xs font-semibold text-white shadow-lg shadow-red-950/50 spring-press cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isDeletingFile ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Удалить</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apple Liquid Glass Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl liquid-glass-dark border border-white/15 text-xs font-medium text-white shadow-2xl shadow-black/70 animate-message-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </main>
  );
};
