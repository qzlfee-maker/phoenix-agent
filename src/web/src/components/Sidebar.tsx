import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Plus,
  Trash2,
  Pencil,
  X,
  Settings as SettingsIcon,
  MessageSquare,
  FolderKanban,
  FolderOpen,
  Cpu,
  Check,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Chat, Project, AppConfig } from '../types.js';
import { openProjectFolder } from '../api.js';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewGlobalChat: () => void;
  onNewProjectChat: (projectId: string) => void;
  onRenameChat: (id: string, title: string) => Promise<void>;
  onDeleteChat: (id: string, e: React.MouseEvent) => void;
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, description: string) => Promise<void>;
  onDeleteProject: (id: string, e: React.MouseEvent) => void;
  onOpenSettings: () => void;
  config: AppConfig | null;
  activeModel: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  chats,
  activeChatId,
  onSelectChat,
  onNewGlobalChat,
  onNewProjectChat,
  onRenameChat,
  onDeleteChat,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onOpenSettings,
  config,
  activeModel,
}) => {
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const skipBlurRef = useRef(false);

  const startRenameChat = (chat: Chat, e?: React.MouseEvent) => {
    e?.stopPropagation();
    skipBlurRef.current = false;
    setEditingChatId(chat.id);
    setEditingTitle(chat.title || 'Новый чат');
  };

  const cancelRenameChat = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    skipBlurRef.current = true;
    setEditingChatId(null);
    setEditingTitle('');
  };

  const submitRenameChat = async (chatId: string, e?: React.FormEvent | React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    skipBlurRef.current = true;
    const trimmed = editingTitle.trim();
    setEditingChatId(null);
    setEditingTitle('');
    if (!trimmed) return;
    await onRenameChat(chatId, trimmed);
  };

  const handleRenameBlur = async (chatId: string) => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    const trimmed = editingTitle.trim();
    setEditingChatId(null);
    setEditingTitle('');
    if (!trimmed) return;
    await onRenameChat(chatId, trimmed);
  };

  // Auto-expand active project in the tree
  useEffect(() => {
    if (activeProjectId) {
      setExpandedProjects((prev) => ({ ...prev, [activeProjectId]: true }));
    }
  }, [activeProjectId]);

  const globalChats = chats.filter((c) => !c.project_id);

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    await onCreateProject(projectName.trim(), projectDesc.trim());
    setProjectName('');
    setProjectDesc('');
    setIsCreatingProject(false);
  };

  const handleProjectClick = (projectId: string) => {
    const isCurrentlyActive = activeProjectId === projectId;
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: isCurrentlyActive ? !prev[projectId] : true,
    }));
    onSelectProject(projectId);
  };

  const toggleProjectExpand = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  return (
    <aside className="w-68 md:w-74 bg-zinc-950/75 backdrop-blur-2xl border-r border-white/[0.08] flex flex-col h-full select-none shrink-0 z-20">
      {/* Brand Header */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white">
            <Flame className="w-5 h-5 fill-current" />
          </div>
          <h1 className="font-semibold text-base tracking-tight text-white">
            Phoenix
          </h1>
        </div>
      </div>

      {/* Tree Navigation Area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {/* SECTION 1: Global Chats */}
        <div className="space-y-1">
          <div className="px-2.5 py-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Глобальные чаты
            </span>
            <button
              type="button"
              onClick={onNewGlobalChat}
              title="Новый глобальный чат"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.07] text-[11px] font-medium text-zinc-300 hover:text-white spring-press cursor-pointer"
            >
              <Plus className="w-3 h-3 text-orange-400" />
              <span>Новый чат</span>
            </button>
          </div>

          {globalChats.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-zinc-500">
              Нет глобальных чатов
            </div>
          ) : (
            <div className="space-y-0.5">
              {globalChats.map((chat) => {
                const isActive = chat.id === activeChatId && !activeProjectId;
                const isEditing = editingChatId === chat.id;
                return (
                  <div
                    key={chat.id}
                    onClick={() => !isEditing && onSelectChat(chat.id)}
                    onDoubleClick={(e) => startRenameChat(chat, e)}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs spring-press ${
                      isActive
                        ? 'bg-white/[0.1] text-white font-medium border border-white/[0.08] shadow-sm'
                        : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    {isEditing ? (
                      <form
                        onSubmit={(e) => submitRenameChat(chat.id, e)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 w-full"
                      >
                        <input
                          type="text"
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              cancelRenameChat();
                            }
                          }}
                          onBlur={() => handleRenameBlur(chat.id)}
                          className="flex-1 min-w-0 bg-black/50 border border-orange-500/60 rounded-lg px-2 py-0.5 text-xs text-white focus:outline-none"
                        />
                        <button
                          type="submit"
                          onMouseDown={(e) => e.preventDefault()}
                          title="Сохранить"
                          className="p-0.5 text-emerald-400 hover:text-emerald-300 cursor-pointer shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => cancelRenameChat(e)}
                          title="Отмена"
                          className="p-0.5 text-zinc-400 hover:text-zinc-200 cursor-pointer shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-center gap-2.5 truncate mr-1.5">
                          <MessageSquare
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-orange-400' : 'text-zinc-500 group-hover:text-zinc-400'
                            }`}
                          />
                          <span className="truncate">{chat.title || 'Новый чат'}</span>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => startRenameChat(chat, e)}
                            title="Переименовать чат"
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-orange-400 text-zinc-500 rounded-md transition-opacity cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => onDeleteChat(chat.id, e)}
                            title="Удалить чат"
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-zinc-500 rounded-md transition-opacity cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 2: Projects Tree with Nested Chats */}
        <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
          <div className="px-2.5 py-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Проекты
            </span>
            <button
              type="button"
              onClick={() => setIsCreatingProject(true)}
              title="Создать новый проект"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.07] text-[11px] font-medium text-zinc-300 hover:text-white spring-press cursor-pointer"
            >
              <Plus className="w-3 h-3 text-orange-400" />
              <span>Проект</span>
            </button>
          </div>

          {/* Inline New Project Form */}
          {isCreatingProject && (
            <form
              onSubmit={handleProjectSubmit}
              className="mx-1 mb-2 p-3 rounded-2xl liquid-glass space-y-2 animate-message-in"
            >
              <input
                type="text"
                autoFocus
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Название проекта..."
                required
                className="w-full bg-black/40 border border-white/10 focus:border-orange-500/60 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <input
                type="text"
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                placeholder="Описание (необязательно)"
                className="w-full bg-black/40 border border-white/10 focus:border-orange-500/60 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingProject(false)}
                  className="px-2.5 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-medium spring-press cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  <span>Создать</span>
                </button>
              </div>
            </form>
          )}

          {projects.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-zinc-500">
              <FolderKanban className="w-5 h-5 mx-auto mb-1.5 opacity-30" />
              Нет созданных проектов
            </div>
          ) : (
            <div className="space-y-1">
              {projects.map((project) => {
                const isProjectActive = project.id === activeProjectId;
                const isExpanded = Boolean(expandedProjects[project.id]);
                const projectChats = chats.filter((c) => c.project_id === project.id);

                return (
                  <div key={project.id} className="space-y-0.5">
                    {/* Project Node Row */}
                    <div
                      onClick={() => handleProjectClick(project.id)}
                      className={`group flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer text-xs spring-press ${
                        isProjectActive
                          ? 'bg-white/[0.09] text-white font-medium border border-white/[0.08]'
                          : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate mr-2 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => toggleProjectExpand(project.id, e)}
                          className="p-0.5 text-zinc-500 hover:text-zinc-300 rounded cursor-pointer shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <FolderKanban
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isProjectActive
                              ? 'text-orange-400'
                              : 'text-zinc-500 group-hover:text-zinc-400'
                          }`}
                        />

                        <div className="truncate">
                          <div className="truncate">{project.name}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <span className="text-[10px] font-mono text-zinc-500 px-1.5 group-hover:hidden">
                          {projectChats.length}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openProjectFolder(project.id).catch(console.error);
                          }}
                          title="Открыть папку проекта в проводнике"
                          className="hidden group-hover:inline-flex p-1 hover:text-orange-400 text-zinc-500 rounded-md transition-colors cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => onDeleteProject(project.id, e)}
                          title="Удалить проект"
                          className="hidden group-hover:inline-flex p-1 hover:text-red-400 text-zinc-500 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Project Chats Subtree */}
                    {isExpanded && (
                      <div className="ml-4 pl-2.5 border-l border-white/[0.08] space-y-0.5 py-1 animate-message-in">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNewProjectChat(project.id);
                          }}
                          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-orange-400/90 hover:text-orange-300 hover:bg-orange-500/10 spring-press cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Новый чат</span>
                        </button>

                        {projectChats.length === 0 ? (
                          <div className="px-2.5 py-1.5 text-[11px] text-zinc-500 italic">
                            Нет чатов в проекте
                          </div>
                        ) : (
                          projectChats.map((chat) => {
                            const isChatActive = chat.id === activeChatId;
                            const isEditing = editingChatId === chat.id;
                            return (
                              <div
                                key={chat.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isEditing) onSelectChat(chat.id);
                                }}
                                onDoubleClick={(e) => startRenameChat(chat, e)}
                                className={`group/chat flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs spring-press ${
                                  isChatActive
                                    ? 'bg-orange-500/15 text-orange-200 font-medium border border-orange-500/30'
                                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 border border-transparent'
                                }`}
                              >
                                {isEditing ? (
                                  <form
                                    onSubmit={(e) => submitRenameChat(chat.id, e)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 w-full"
                                  >
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                          cancelRenameChat();
                                        }
                                      }}
                                      onBlur={() => handleRenameBlur(chat.id)}
                                      className="flex-1 min-w-0 bg-black/50 border border-orange-500/60 rounded-md px-1.5 py-0.5 text-xs text-white focus:outline-none"
                                    />
                                    <button
                                      type="submit"
                                      onMouseDown={(e) => e.preventDefault()}
                                      title="Сохранить"
                                      className="p-0.5 text-emerald-400 hover:text-emerald-300 cursor-pointer shrink-0"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={(e) => cancelRenameChat(e)}
                                      title="Отмена"
                                      className="p-0.5 text-zinc-400 hover:text-zinc-200 cursor-pointer shrink-0"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </form>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2 truncate mr-1">
                                      <MessageSquare
                                        className={`w-3 h-3 shrink-0 ${
                                          isChatActive
                                            ? 'text-orange-400'
                                            : 'text-zinc-500 group-hover/chat:text-zinc-400'
                                        }`}
                                      />
                                      <span className="truncate">{chat.title || 'Новый чат'}</span>
                                    </div>

                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={(e) => startRenameChat(chat, e)}
                                        title="Переименовать чат"
                                        className="opacity-0 group-hover/chat:opacity-100 p-0.5 hover:text-orange-400 text-zinc-500 rounded transition-opacity cursor-pointer"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(e) => onDeleteChat(chat.id, e)}
                                        title="Удалить чат"
                                        className="opacity-0 group-hover/chat:opacity-100 p-0.5 hover:text-red-400 text-zinc-500 rounded transition-opacity cursor-pointer"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/[0.07] space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400 px-2">
          <div className="flex items-center gap-2 truncate">
            <Cpu className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span
              className="truncate font-mono text-[11px] text-zinc-300"
              title={activeModel || 'Не выбрана'}
            >
              {activeModel || 'Модель не выбрана'}
            </span>
          </div>

          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              config?.isConfigured ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
            }`}
            title={config?.isConfigured ? 'API ключ настроен' : 'Требуется API ключ'}
          />
        </div>

        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-xs font-medium text-zinc-300 hover:text-white spring-press cursor-pointer"
        >
          <SettingsIcon className="w-3.5 h-3.5 text-zinc-400" />
          <span>Настройки</span>
        </button>
      </div>
    </aside>
  );
};
