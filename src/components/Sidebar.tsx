import React, { useState, useMemo, useEffect } from 'react';
import { 
  Folder, 
  FolderPlus, 
  Plus, 
  ChevronDown, 
  ChevronRight, 
  Settings, 
  Terminal,
  FolderOpen,
  Cpu,
  Server
} from 'lucide-react';
import type { Project, Session, CoreInfo } from '../types';
import { contextMenuPoint, isContextMenuKey } from '../lib/a11y';

interface SidebarProps {
  projects: Project[];
  activeSessionId: string;
  onSelectSession: (session: Session, project?: Project) => void;
  onNewSession: (projectId?: string) => void;
  onOpenFolder: () => void;
  onOpenSshModal?: () => void;
  coreInfo?: CoreInfo | null;
  onOpenCoreManager?: () => void;
  onOpenModelSettings?: () => void;
  /** 對「對話」按右鍵 */
  onSessionContextMenu?: (session: Session, project: Project, x: number, y: number) => void;
  /** 對「專案」按右鍵 */
  onProjectContextMenu?: (project: Project, x: number, y: number) => void;
  /** 對「空白處」按右鍵 */
  onBlankContextMenu?: (x: number, y: number) => void;
  /** 外部觸發「全部展開 / 全部收合」 */
  expandAllCommand?: { action: 'expand' | 'collapse'; nonce: number } | null;
  /** 側欄寬度 (px)，由 App 控制以支援拖曳調整 */
  width?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  projects,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onOpenFolder,
  onOpenSshModal,
  coreInfo,
  onOpenCoreManager,
  onOpenModelSettings,
  onSessionContextMenu,
  onProjectContextMenu,
  onBlankContextMenu,
  expandAllCommand,
  width = 256,
}) => {
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  // 回應外部「全部展開 / 全部收合」指令
  useEffect(() => {
    if (!expandAllCommand) return;
    const all: Record<string, boolean> = {};
    projects.forEach((p) => { all[p.id] = expandAllCommand.action === 'expand'; });
    setExpandedProjects(all);
    // 僅依 nonce 觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandAllCommand?.nonce]);

  // 找出「最新對話」所在的專案，預設只展開它
  const mostRecentProjectId = useMemo(() => {
    let bestId: string | null = null;
    let bestTime = -1;
    projects.forEach((p) => {
      const t = p.sessions[0]?.updatedAt || 0;
      if (t > bestTime) {
        bestTime = t;
        bestId = p.id;
      }
    });
    return bestId;
  }, [projects]);

  // 右鍵或 Shift+F10 / 選單鍵開啟選單
  type MenuEvent = React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>;
  const openProjectMenu = (e: MenuEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = contextMenuPoint(e);
    onProjectContextMenu?.(project, x, y);
  };
  const openSessionMenu = (e: MenuEvent, session: Session, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = contextMenuPoint(e);
    onSessionContextMenu?.(session, project, x, y);
  };

  // 依畫面上目前的狀態切換（預設展開的專案還沒有記錄，不能用 !prev[id]）
  const toggleProject = (projectId: string, isExpanded: boolean) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !isExpanded,
    }));
  };

  return (
    <aside
      style={{ width }}
      className="h-full shrink-0 bg-surface border-r border-line flex flex-col justify-between select-none text-zinc-300 overflow-hidden"
      onContextMenu={(e) => {
        // 只有點在真正的空白處（非對話/專案列）才觸發
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onBlankContextMenu?.(e.clientX, e.clientY);
        }
      }}
    >
      {/* 頂部標題列：與中欄、右欄的第一列同高 */}
      <div className="panel-header justify-between pl-3 pr-1.5 text-xs text-zinc-400">
        <span className="font-semibold text-zinc-300">Projects</span>
        <div className="flex items-center gap-0.5">
          <button
            title="Add SSH project"
            onClick={onOpenSshModal}
            className="icon-btn text-cyan-400 hover:text-cyan-300"
          >
            <Server size={15} />
          </button>
          <button
            title="Add local folder"
            onClick={onOpenFolder}
            className="icon-btn"
          >
            <FolderPlus size={16} />
          </button>
        </div>
      </div>

      {/* 專案列表 */}
      <div
        className="flex-1 overflow-y-auto px-1.5 py-1.5"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            onBlankContextMenu?.(e.clientX, e.clientY);
          }
        }}
      >
        {/* Projects 區塊 */}
        <div className="mb-4">
          {/* 專案列表 */}
          <div className="space-y-1">
            {projects.map((project) => {
              // 預設只展開最新對話所在的專案，其餘收合
              const isExpanded = expandedProjects[project.id] ?? (project.id === mostRecentProjectId && !!project.sessions.length);
              return (
                <div key={project.id} className="text-sm">
                  {/* 專案資料夾名稱：展開/收合按鈕，「New chat」與它並列（不能包在按鈕裡） */}
                  <div className="group flex items-center rounded-md transition-colors hover:bg-raised/50">
                    <button
                      onClick={() => toggleProject(project.id, isExpanded)}
                      onContextMenu={(e) => openProjectMenu(e, project)}
                      onKeyDown={(e) => {
                        if (isContextMenuKey(e)) openProjectMenu(e, project);
                      }}
                      aria-expanded={isExpanded}
                      title={project.ssh ? `[SSH] ${project.ssh.host}:${project.path}` : project.path}
                      className="list-row focus-ring-inset min-w-0 flex-1 gap-2.5 text-zinc-300 hover:bg-transparent"
                    >
                      {project.ssh ? (
                        <Server size={16} className="text-cyan-400 group-hover:text-cyan-300 shrink-0" />
                      ) : (
                        <Folder size={16} className="text-zinc-400 group-hover:text-zinc-200 shrink-0" />
                      )}
                      <span className="font-medium flex-1 truncate text-left">{project.name}</span>
                      {project.ssh && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0">
                          SSH
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => onNewSession(project.id)}
                      title="New chat"
                      aria-label={`New chat in ${project.name}`}
                      className="icon-btn mr-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* 專案底下的 Sessions 列表 */}
                  {isExpanded && (
                    <div className="mt-0.5 space-y-1">
                      {project.sessions.map((session) => {
                        const isActive = session.id === activeSessionId;
                        return (
                          <button
                            key={session.id}
                            onClick={() => onSelectSession(session, project)}
                            onContextMenu={(e) => openSessionMenu(e, session, project)}
                            onKeyDown={(e) => {
                              if (isContextMenuKey(e)) openSessionMenu(e, session, project);
                            }}
                            title={session.filePath || session.title}
                            aria-current={isActive ? 'page' : undefined}
                            className="list-row focus-ring-inset group w-full justify-between text-left"
                          >
                            <span className="truncate pr-2">{session.title}</span>
                            <span className="text-2xs tabular-nums text-fg-subtle whitespace-nowrap group-hover:text-zinc-400">
                              {session.timeAgo}
                            </span>
                          </button>
                        );
                      })}
                      {project.sessions.length === 0 && (
                        <button
                          onClick={() => onNewSession(project.id)}
                          className="list-row w-full gap-2 pl-8 text-fg-subtle"
                        >
                          <Plus size={13} /> New chat
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {projects.length === 0 && (
              <button onClick={onOpenFolder} className="list-row w-full gap-2 text-fg-subtle">
                <FolderPlus size={14} /> Add folder
              </button>
            )}
          </div>
        </div>

      </div>

      {/* 底部工作區狀態 & 核心管理 */}
      <div className="p-3 border-t border-line bg-zinc-900/60 text-xs flex items-center justify-between text-zinc-400">
        <button
          onClick={onOpenCoreManager}
          title={coreInfo?.description || 'Pi core'}
          className="flex items-center space-x-2 truncate hover:text-zinc-200 transition text-left"
        >
          <div className={`w-2 h-2 rounded-full shrink-0 ${coreInfo ? 'bg-success' : 'bg-fg-disabled'}`} />
          <div className="truncate flex flex-col">
            <span className="truncate text-xs tabular-nums font-medium text-zinc-200">
              Pi Core{coreInfo?.version ? ` v${coreInfo.version}` : ''}
            </span>
            <span className="text-xs text-fg-subtle">
              {!coreInfo ? 'Not loaded' : coreInfo.type === 'user' ? 'User install' : coreInfo.type === 'bundled' ? 'Bundled' : 'System PATH'}
            </span>
          </div>
        </button>

        <div className="flex items-center space-x-1">
          <button
            title="Model settings"
            onClick={onOpenModelSettings}
            className="icon-btn p-1.5"
          >
            <Cpu size={14} />
          </button>
          <button
            title="Pi core settings"
            onClick={onOpenCoreManager}
            className="icon-btn p-1.5"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};
