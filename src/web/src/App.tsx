import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, AlertTriangle, Check, X, Trash2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar.js';
import { ChatArea } from './components/ChatArea.js';
import { WorkspaceView } from './components/WorkspaceView.js';
import { SetupScreen } from './components/SetupScreen.js';
import { SettingsModal } from './components/SettingsModal.js';
import {
  Chat,
  Message,
  AppConfig,
  Project,
  ToolInvocation,
  ProjectFileEvent,
  TerminalEvent,
  ChatAttachment,
  ApprovalRequest,
} from './types.js';
import {
  fetchConfig,
  fetchChats,
  createChat,
  renameChat,
  deleteChat,
  fetchMessages,
  editChatMessage,
  streamChat,
  approveToolExecution,
  fetchProjects,
  createProject,
  deleteProject,
  undoProjectChanges,
} from './api.js';

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeModel, setActiveModel] = useState<string>('');
  const [activeProviderId, setActiveProviderId] = useState<string | undefined>(undefined);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [fullAccess, setFullAccess] = useState(false);
  const [showFullAccessWarning, setShowFullAccessWarning] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [isResolvingApproval, setIsResolvingApproval] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingToolInvocations, setStreamingToolInvocations] = useState<ToolInvocation[]>([]);
  const [lastFileEvent, setLastFileEvent] = useState<ProjectFileEvent | null>(null);
  const [lastTerminalEvent, setLastTerminalEvent] = useState<TerminalEvent | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Initial Load: Check if configured
  useEffect(() => {
    async function init() {
      try {
        const cfg = await fetchConfig();
        setConfig(cfg);
        const initialModel = cfg.defaultModel || cfg.models?.[0] || '';
        setActiveModel(initialModel);
        setActiveProviderId(resolveProviderIdForModel(cfg, initialModel));

        if (cfg.isConfigured) {
          const [chatList, projectList] = await Promise.all([
            fetchChats(),
            fetchProjects(),
          ]);
          setChats(chatList);
          setProjects(projectList);

          const savedChatId = localStorage.getItem('phoenix_active_chat_id');
          const savedProjectId = localStorage.getItem('phoenix_active_project_id');

          const matchedChat = savedChatId
            ? chatList.find((c) => c.id === savedChatId)
            : undefined;
          const matchedProject = savedProjectId
            ? projectList.find((p) => p.id === savedProjectId)
            : undefined;

          if (matchedChat) {
            setActiveChatId(matchedChat.id);
            setActiveProjectId(matchedChat.project_id || matchedProject?.id || null);
          } else if (matchedProject) {
            setActiveProjectId(matchedProject.id);
            const projChat = chatList.find((c) => c.project_id === matchedProject.id);
            setActiveChatId(projChat ? projChat.id : null);
          } else if (chatList.length > 0) {
            const firstChat = chatList[0];
            setActiveChatId(firstChat.id);
            setActiveProjectId(firstChat.project_id || null);
          } else {
            setActiveProjectId(null);
          }
        }
      } catch (err) {
        console.error('Failed to load initial configuration:', err);
      } finally {
        setIsLoadingConfig(false);
      }
    }
    init();
  }, []);

  // Persist active chat & project across page refreshes
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('phoenix_active_chat_id', activeChatId);
    } else {
      localStorage.removeItem('phoenix_active_chat_id');
    }
  }, [activeChatId]);

  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem('phoenix_active_project_id', activeProjectId);
    } else {
      localStorage.removeItem('phoenix_active_project_id');
    }
  }, [activeProjectId]);

  // Fetch messages whenever activeChatId changes
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    async function loadChatMessages() {
      try {
        const msgs = await fetchMessages(activeChatId!);
        setMessages(msgs);
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    }

    loadChatMessages();
  }, [activeChatId]);

  // Select any chat (global or project-bound) -> auto-switch WorkspaceView if bound to a project
  const handleSelectChat = (chatId: string) => {
    const targetChat = chats.find((c) => c.id === chatId);
    setActiveChatId(chatId);
    if (targetChat?.project_id) {
      setActiveProjectId(targetChat.project_id);
    } else {
      setActiveProjectId(null);
    }
  };

  // Create New Global Chat
  const handleNewGlobalChat = async () => {
    try {
      const newChat = await createChat('Новый чат');
      setChats((prev) => [newChat, ...prev]);
      setActiveProjectId(null);
      setActiveChatId(newChat.id);
      setMessages([]);
      setInput('');
    } catch (err) {
      console.error('Failed to create new global chat:', err);
    }
  };

  // Create New Chat Inside a Project
  const handleNewProjectChat = async (projectId: string) => {
    try {
      const newChat = await createChat('Новый чат', projectId);
      setChats((prev) => [newChat, ...prev]);
      setActiveProjectId(projectId);
      setActiveChatId(newChat.id);
      setMessages([]);
      setInput('');
    } catch (err) {
      console.error('Failed to create new project chat:', err);
    }
  };

  // Rename Chat
  const handleRenameChat = async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const prevChats = chats;
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
    );
    try {
      const updated = await renameChat(id, trimmed);
      setChats((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
    } catch (err) {
      console.error('Failed to rename chat:', err);
      setChats(prevChats);
    }
  };

  // Request Chat Deletion Confirmation
  const handleDeleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetChat = chats.find((c) => c.id === id);
    setPendingDeleteChat({
      id,
      title: targetChat?.title || 'Без названия',
    });
  };

  // Confirmed Chat Deletion
  const confirmDeleteChat = async () => {
    if (!pendingDeleteChat || isDeletingChat) return;
    const { id } = pendingDeleteChat;
    setIsDeletingChat(true);
    try {
      const deletedChat = chats.find((c) => c.id === id);
      await deleteChat(id);
      setChats((prev) => {
        const filtered = prev.filter((c) => c.id !== id);
        if (activeChatId === id) {
          if (deletedChat?.project_id) {
            const nextProjChat = filtered.find((c) => c.project_id === deletedChat.project_id);
            setActiveChatId(nextProjChat ? nextProjChat.id : null);
          } else {
            const nextGlobalChat = filtered.find((c) => !c.project_id);
            setActiveChatId(nextGlobalChat ? nextGlobalChat.id : null);
          }
        }
        return filtered;
      });
      setPendingDeleteChat(null);
    } catch (err) {
      console.error('Failed to delete chat:', err);
    } finally {
      setIsDeletingChat(false);
    }
  };

  // Select Project in Tree
  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    const currentChat = chats.find((c) => c.id === activeChatId);
    if (currentChat && currentChat.project_id === projectId) {
      return;
    }
    const projChat = chats.find((c) => c.project_id === projectId);
    if (projChat) {
      setActiveChatId(projChat.id);
    } else {
      setActiveChatId(null);
      setMessages([]);
    }
  };

  // Create Project (and initial chat inside it)
  const handleCreateProject = async (name: string, description: string) => {
    try {
      const newProj = await createProject({ name, description });
      setProjects((prev) => [newProj, ...prev]);
      setActiveProjectId(newProj.id);

      const projChat = await createChat('Новый чат', newProj.id);
      setChats((prev) => [projChat, ...prev]);
      setActiveChatId(projChat.id);
      setMessages([]);
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  // Delete Project
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setChats((prev) => {
        const remainingChats = prev.filter((c) => c.project_id !== id);
        if (activeProjectId === id) {
          setActiveProjectId(null);
          const nextGlobal = remainingChats.find((c) => !c.project_id);
          setActiveChatId(nextGlobal ? nextGlobal.id : null);
        }
        return remainingChats;
      });
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  // Undo File Changes for a Message
  const handleUndoMessage = async (messageId: string) => {
    const targetMsg = messages.find((m) => m.id === messageId);
    const currentChat = chats.find((c) => c.id === activeChatId);
    const projectIdToUndo =
      targetMsg?.project_id || activeProjectId || currentChat?.project_id;

    if (!projectIdToUndo) return;

    try {
      const res = await undoProjectChanges(projectIdToUndo, messageId);
      if (res.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, changes_undone: true } : m
          )
        );
        if (res.restoredFiles.length > 0) {
          const first = res.restoredFiles[0];
          setLastFileEvent({
            type: first.action === 'deleted' ? 'file_deleted' : 'file_updated',
            projectId: projectIdToUndo,
            path: first.path,
            timestamp: Date.now(),
          });
        }
      }
    } catch (err) {
      console.error('Failed to undo changes:', err);
    }
  };

  const handleAddAttachments = (items: ChatAttachment[]) => {
    setPendingAttachments((prev) => [...prev, ...items]);
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleToggleFullAccess = () => {
    if (fullAccess) {
      setFullAccess(false);
    } else {
      setShowFullAccessWarning(true);
    }
  };

  const handleResolveApproval = async (approved: boolean) => {
    if (!pendingApproval || isResolvingApproval) return;
    setIsResolvingApproval(true);
    try {
      await approveToolExecution(pendingApproval.approvalId, approved);
      setPendingApproval(null);
    } catch (err) {
      console.error('Failed to resolve approval:', err);
      setPendingApproval(null);
    } finally {
      setIsResolvingApproval(false);
    }
  };

  // Send Message
  const handleSend = async (customContent?: string) => {
    const textToSend = (customContent || input).trim();
    const attachmentsToSend = customContent ? [] : pendingAttachments;
    if ((!textToSend && attachmentsToSend.length === 0) || isStreaming) return;

    if (!config?.isConfigured) {
      setIsSettingsOpen(true);
      return;
    }

    const activeProj = activeProjectId
      ? projects.find((p) => p.id === activeProjectId) || null
      : null;

    let targetChatId = activeChatId;
    const currentChat = chats.find((c) => c.id === targetChatId);

    // If we are in a project workspace and have no active chat for this project, create a new chat bound to this project
    if (activeProj && (!currentChat || currentChat.project_id !== activeProj.id)) {
      try {
        const newProjChat = await createChat('Новый чат', activeProj.id);
        targetChatId = newProjChat.id;
        setChats((prev) => [newProjChat, ...prev]);
        setActiveChatId(newProjChat.id);
      } catch (err) {
        console.error('Failed to auto-create project chat:', err);
        return;
      }
    } else if (!targetChatId) {
      try {
        const newChat = await createChat('Новый чат');
        targetChatId = newChat.id;
        setChats((prev) => [newChat, ...prev]);
        setActiveChatId(newChat.id);
      } catch (err) {
        console.error('Failed to auto-create chat:', err);
        return;
      }
    }

    const contextProjectId =
      activeProj?.id || currentChat?.project_id || undefined;

    const userMessageId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    const tempUserMessage: Message = {
      id: userMessageId,
      chat_id: targetChatId,
      role: 'user',
      content: textToSend,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      project_id: contextProjectId,
      created_at: Date.now(),
    };

    setMessages((prev) => [...prev, tempUserMessage]);
    if (!customContent) {
      setInput('');
      setPendingAttachments([]);
    }
    setIsStreaming(true);
    setStreamingText('');
    setStreamingToolInvocations([]);

    await runChatStream({
      chatId: targetChatId,
      content: textToSend,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      projectId: contextProjectId,
      userMessageId,
    });
  };

  const runChatStream = async ({
    chatId,
    content,
    attachments,
    projectId,
    skipUserSave = false,
    userMessageId,
  }: {
    chatId: string;
    content: string;
    attachments?: ChatAttachment[];
    projectId?: string;
    skipUserSave?: boolean;
    userMessageId?: string;
  }) => {
    if (!config) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulatedText = '';
    const modelToUse = activeModel || config.defaultModel || config.models?.[0];

    await streamChat({
      chatId,
      content,
      attachments,
      model: modelToUse,
      providerId: activeProviderId,
      projectId,
      fullAccess,
      skipUserSave,
      userMessageId,
      signal: controller.signal,
      onChunk: (chunk) => {
        accumulatedText += chunk;
        setStreamingText(accumulatedText);
      },
      onToolInvocation: (inv) => {
        setStreamingToolInvocations((prev) => {
          const idx = prev.findIndex((item) => item.toolCallId === inv.toolCallId);
          if (idx === -1) {
            return [...prev, inv];
          }
          const copy = [...prev];
          copy[idx] = inv;
          return copy;
        });
      },
      onFileEvent: (fe) => {
        setLastFileEvent(fe);
      },
      onTerminalEvent: (te) => {
        setLastTerminalEvent(te);
      },
      onRequireApproval: (req) => {
        setPendingApproval(req);
      },
      onDone: (assistantMsg) => {
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingText('');
        setStreamingToolInvocations([]);
        setPendingApproval(null);
        setIsStreaming(false);
        abortControllerRef.current = null;
        fetchChats().then(setChats).catch(console.error);
        if (
          assistantMsg.tool_invocations?.some((t) => t.toolName === 'install_mcp_server')
        ) {
          fetchConfig().then(setConfig).catch(console.error);
        }
      },
      onError: (errMsg) => {
        console.error('Streaming error:', errMsg);
        setPendingApproval(null);
        setMessages((prev) => [
          ...prev,
          {
            id: 'err-' + Date.now(),
            chat_id: chatId,
            role: 'assistant',
            model: modelToUse,
            content: `**Ошибка:** ${errMsg}`,
            created_at: Date.now(),
          },
        ]);
        setStreamingText('');
        setStreamingToolInvocations([]);
        setIsStreaming(false);
        abortControllerRef.current = null;
      },
    });
  };

  // Edit user message, truncate subsequent messages in DB + UI, and re-run LLM response
  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (isStreaming || !activeChatId || !config?.isConfigured) return;

    const currentChat = chats.find((c) => c.id === activeChatId);
    const contextProjectId = activeProject?.id || currentChat?.project_id || undefined;

    try {
      const res = await editChatMessage(activeChatId, messageId, newContent);
      setMessages(res.messages);
      setIsStreaming(true);
      setStreamingText('');
      setStreamingToolInvocations([]);

      await runChatStream({
        chatId: activeChatId,
        content: newContent,
        projectId: contextProjectId,
        skipUserSave: true,
      });
    } catch (err: any) {
      console.error('Failed to edit message:', err);
      setIsStreaming(false);
    }
  };

  // Stop Streaming
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (streamingText) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'aborted-' + Date.now(),
          chat_id: activeChatId || '',
          role: 'assistant',
          model: activeModel || config?.defaultModel,
          content: streamingText + '\n\n*(генерация прервана пользователем)*',
          created_at: Date.now(),
        },
      ]);
    }
    setStreamingText('');
    setIsStreaming(false);
  };

  const resolveProviderIdForModel = (cfg: AppConfig, modelName: string, preferredProviderId?: string): string | undefined => {
    const allProviders = [
      ...(cfg.builtInProviders || []),
      ...(cfg.customProviders || []),
    ];
    if (preferredProviderId) {
      const preferred = allProviders.find((p) => p.id === preferredProviderId);
      if (preferred && preferred.models.includes(modelName)) {
        return preferred.id;
      }
    }
    const matching = allProviders.find((p) => p.models.includes(modelName));
    return matching?.id || cfg.provider;
  };

  const syncActiveModel = (newConfig: AppConfig) => {
    const modelsList = newConfig.models || [];
    let nextModel = activeModel;
    if (modelsList.length > 0 && !modelsList.includes(activeModel)) {
      nextModel = newConfig.defaultModel || modelsList[0];
      setActiveModel(nextModel);
    } else if (!activeModel && modelsList.length > 0) {
      nextModel = modelsList[0];
      setActiveModel(nextModel);
    }
    if (nextModel) {
      setActiveProviderId((prev) => resolveProviderIdForModel(newConfig, nextModel, prev));
    }
  };

  const handleSelectModel = (model: string, providerId?: string) => {
    setActiveModel(model);
    if (providerId) {
      setActiveProviderId(providerId);
    } else if (config) {
      setActiveProviderId(resolveProviderIdForModel(config, model));
    }
  };

  // Handle setup completion from SetupScreen
  const handleConfigured = async (newConfig: AppConfig) => {
    setConfig(newConfig);
    syncActiveModel(newConfig);
    try {
      const [freshConfig, chatList, projectList] = await Promise.all([
        fetchConfig(),
        fetchChats(),
        fetchProjects(),
      ]);
      setConfig(freshConfig);
      syncActiveModel(freshConfig);
      setChats(chatList);
      setProjects(projectList);
      if (chatList.length > 0) {
        const firstChat = chatList[0];
        setActiveChatId(firstChat.id);
        setActiveProjectId(firstChat.project_id || null);
      } else {
        setActiveProjectId(null);
      }
    } catch (err) {
      console.error('Failed to load data after setup:', err);
    }
  };

  if (isLoadingConfig) {
    return (
      <div className="h-screen w-screen apple-mesh-bg flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!config?.isConfigured) {
    return <SetupScreen initialConfig={config} onConfigured={handleConfigured} />;
  }

  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId) || null
    : null;

  return (
    <div className="relative flex h-screen w-screen overflow-hidden apple-mesh-bg text-zinc-100 font-sans">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewGlobalChat={handleNewGlobalChat}
        onNewProjectChat={handleNewProjectChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onOpenSettings={() => setIsSettingsOpen(true)}
        config={config}
        activeModel={activeModel}
      />

      {activeProject ? (
        <WorkspaceView
          project={activeProject}
          activeChat={activeChat}
          messages={messages}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          streamingText={streamingText}
          streamingToolInvocations={streamingToolInvocations}
          lastFileEvent={lastFileEvent}
          lastTerminalEvent={lastTerminalEvent}
          onUndoMessage={handleUndoMessage}
          onEditMessage={handleEditMessage}
          config={config}
          activeModel={activeModel}
          activeProviderId={activeProviderId}
          onSelectModel={handleSelectModel}
          onOpenSettings={() => setIsSettingsOpen(true)}
          attachments={pendingAttachments}
          onAddAttachments={handleAddAttachments}
          onRemoveAttachment={handleRemoveAttachment}
        />
      ) : (
        <ChatArea
          chat={activeChat}
          messages={messages}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          streamingText={streamingText}
          streamingToolInvocations={streamingToolInvocations}
          onUndoMessage={handleUndoMessage}
          onEditMessage={handleEditMessage}
          config={config}
          activeModel={activeModel}
          activeProviderId={activeProviderId}
          onSelectModel={handleSelectModel}
          onOpenSettings={() => setIsSettingsOpen(true)}
          attachments={pendingAttachments}
          onAddAttachments={handleAddAttachments}
          onRemoveAttachment={handleRemoveAttachment}
          fullAccess={fullAccess}
          onToggleFullAccess={handleToggleFullAccess}
        />
      )}

      {/* YOLO Mode Risk Warning Modal */}
      {showFullAccessWarning && (
        <div
          onClick={() => setShowFullAccessWarning(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-2xl animate-message-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl liquid-glass-dark border border-orange-500/30 p-6 shadow-2xl shadow-black/80 space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500/25 to-red-500/25 border border-orange-500/40 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-orange-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-white">
                  Включить режим Full Access (YOLO)?
                </h3>
                <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                  В этом режиме агент сможет создавать, перезаписывать и удалять любые файлы на вашем
                  компьютере по абсолютным путям, а также выполнять любые терминальные команды{' '}
                  <span className="text-orange-300 font-medium">без запроса подтверждения</span>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowFullAccessWarning(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 spring-press cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setFullAccess(true);
                  setShowFullAccessWarning(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 shadow-lg shadow-orange-950/50 spring-press cursor-pointer"
              >
                Включить Full Access
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Approval Banner in Chat (e.g., MCP installation when Full Access is ON) */}
      {pendingApproval && pendingApproval.inline && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl animate-message-in">
          <div className="rounded-2xl liquid-glass-dark border border-orange-500/35 px-4 py-3.5 shadow-2xl shadow-black/75 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-xs text-zinc-200 leading-relaxed">
              <span>Найдена команда: </span>
              <code className="px-1.5 py-0.5 rounded bg-black/50 border border-white/10 font-mono text-orange-300 break-all">
                {pendingApproval.path}
              </code>
              <span>. Установить?</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isResolvingApproval}
                onClick={() => handleResolveApproval(false)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-300 bg-white/[0.06] hover:bg-red-500/20 hover:text-red-200 border border-white/10 spring-press cursor-pointer disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                <span>Отмена</span>
              </button>
              <button
                type="button"
                disabled={isResolvingApproval}
                onClick={() => handleResolveApproval(true)}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-950/40 spring-press cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Установить</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Human-in-the-Loop Tool Approval Modal */}
      {pendingApproval && !pendingApproval.inline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-2xl animate-message-in">
          <div className="w-full max-w-md rounded-3xl liquid-glass-dark border border-white/15 p-6 shadow-2xl shadow-black/85 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white">
                  Требуется разрешение
                </h3>
                {pendingApproval.action === 'Запуск MCP-сервера' ||
                pendingApproval.action === 'Установка MCP-сервера' ? (
                  <>
                    <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                      Найдена команда для установки MCP-сервера:
                    </p>
                    <div className="mt-2 px-3 py-2 rounded-xl bg-black/45 border border-white/10 font-mono text-xs text-orange-300 break-all">
                      {pendingApproval.path}
                    </div>
                    <p className="text-xs text-zinc-400 mt-2">Установить?</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                      Агент хочет выполнить{' '}
                      <span className="font-semibold text-white">{pendingApproval.action}</span> по пути:
                    </p>
                    <div className="mt-2 px-3 py-2 rounded-xl bg-black/45 border border-white/10 font-mono text-xs text-orange-300 break-all">
                      {pendingApproval.path}
                    </div>
                    <p className="text-xs text-zinc-400 mt-2">Разрешить это действие?</p>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isResolvingApproval}
                onClick={() => handleResolveApproval(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-zinc-200 bg-white/[0.07] hover:bg-red-500/20 hover:text-red-200 border border-white/10 hover:border-red-500/35 spring-press cursor-pointer disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                <span>Нет, запретить</span>
              </button>
              <button
                type="button"
                disabled={isResolvingApproval}
                onClick={() => handleResolveApproval(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-950/50 spring-press cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Да, разрешить</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Chat Confirmation Modal */}
      {pendingDeleteChat && (
        <div
          onClick={() => !isDeletingChat && setPendingDeleteChat(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-2xl animate-message-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl liquid-glass-dark border border-white/15 p-6 shadow-2xl shadow-black/85 space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white">
                  Удалить чат?
                </h3>
                <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                  Вы уверены, что хотите удалить чат{' '}
                  <span className="font-semibold text-white break-words">
                    «{pendingDeleteChat.title}»
                  </span>
                  ?
                </p>
                <p className="text-xs text-red-300/90 mt-2 leading-relaxed">
                  Это действие нельзя будет отменить — вся история сообщений будет удалена безвозвратно.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingChat}
                onClick={() => setPendingDeleteChat(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 spring-press cursor-pointer disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isDeletingChat}
                onClick={confirmDeleteChat}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/50 spring-press cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingChat ? 'Удаление...' : 'Удалить чат'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onConfigUpdated={(newConfig) => {
          setConfig(newConfig);
          syncActiveModel(newConfig);
        }}
      />
    </div>
  );
};
export default App;
