import React, { useEffect, useId, useState, lazy, Suspense } from 'react';
import { 
  FolderTree, 
  Terminal, 
  Bot, 
} from 'lucide-react';
import { FileTree } from './FileTree';
import { SubagentInspector } from './SubagentInspector';
import type { FileItem, SubagentTask, SshConfig } from '../types';
import { handleTabListKeyDown } from '../lib/a11y';

// 動態延遲載入終端機：App 啟動時完全不載入 xterm，秒開首頁，點進 Terminal 分頁才隨需抓取
const ShellTerminal = lazy(() =>
  import('./ShellTerminal').then((m) => ({ default: m.ShellTerminal }))
);

export type RightPanelTab = 'files' | 'terminal' | 'subagents';

const TABS: { id: RightPanelTab; label: string; Icon: typeof FolderTree }[] = [
  { id: 'files', label: 'Files', Icon: FolderTree },
  { id: 'terminal', label: 'Terminal', Icon: Terminal },
  { id: 'subagents', label: 'Subagents', Icon: Bot },
];

interface RightPanelProps {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  files: FileItem[];
  currentWorkspace: string;
  ssh?: SshConfig;
  subagents: SubagentTask[];
  selectedSubagentId?: string;
  onSelectSubagent: (id: string) => void;
  refreshTrigger?: number;
  onRefreshFiles?: () => void;
  revealRequest?: { path: string; nonce: number } | null;
  /** 面板寬度 (px)，由 App 控制以支援拖曳調整 */
  width?: number;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  activeTab,
  onTabChange,
  files,
  currentWorkspace,
  ssh,
  subagents,
  selectedSubagentId,
  onSelectSubagent,
  refreshTrigger = 0,
  onRefreshFiles,
  revealRequest,
  width = 384,
}) => {
  // 終端機第一次打開後就保持掛載，切換分頁時 shell 不會被關掉
  const [terminalMounted, setTerminalMounted] = useState(activeTab === 'terminal');
  useEffect(() => {
    if (activeTab === 'terminal') setTerminalMounted(true);
  }, [activeTab]);

  const idPrefix = useId();
  const subagentRunning = subagents.some((s) => s.status === 'running');
  const panelProps = (id: RightPanelTab) => ({
    role: 'tabpanel',
    id: `${idPrefix}-panel-${id}`,
    'aria-labelledby': `${idPrefix}-tab-${id}`,
    style: { display: activeTab === id ? 'block' : 'none' },
  });

  return (
    <aside
      style={{ width }}
      className="h-full shrink-0 bg-surface border-l border-line flex flex-col overflow-hidden select-none"
    >
      {/* 頂部 Tab 切換列 */}
      <div className="panel-header justify-between px-1.5 text-xs text-zinc-400">
        <div
          role="tablist"
          aria-label="Side panel"
          onKeyDown={(e) => handleTabListKeyDown(e, false)}
          className="flex items-center space-x-1"
        >
          {TABS.map(({ id, label, Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                id={`${idPrefix}-tab-${id}`}
                aria-selected={selected}
                aria-controls={`${idPrefix}-panel-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onTabChange(id)}
                className={`flex items-center space-x-1.5 px-2 py-1 rounded transition ${
                  selected ? 'bg-zinc-800 text-zinc-100 font-medium' : 'hover:bg-zinc-800/40 hover:text-zinc-300'
                }`}
              >
                <Icon size={14} />
                <span>{label}</span>
                {id === 'subagents' && subagentRunning && (
                  <span title="Running" className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse motion-reduce:animate-none">
                    <span className="sr-only"> (running)</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 內容區塊：未選中的分頁以 display:none 隱藏，保留狀態 */}
      <div className="flex-1 overflow-hidden">
        <div {...panelProps('files')} className="h-full">
          <FileTree
            files={files}
            currentWorkspace={currentWorkspace}
            ssh={ssh}
            refreshTrigger={refreshTrigger}
            onRefresh={onRefreshFiles}
            revealRequest={revealRequest}
          />
        </div>

        {/* 使用者終端機：動態延遲載入，保持掛載，僅以 CSS 隱藏 */}
        <div {...panelProps('terminal')} className="h-full select-text">
          {terminalMounted && (
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-xs text-fg-subtle">
                  Loading terminal…
                </div>
              }
            >
              <ShellTerminal cwd={currentWorkspace} ssh={ssh} />
            </Suspense>
          )}
        </div>

        <div {...panelProps('subagents')} className="h-full">
          {activeTab === 'subagents' && (
            <SubagentInspector
              subagents={subagents}
              selectedSubagentId={selectedSubagentId}
              onSelectSubagent={onSelectSubagent}
            />
          )}
        </div>
      </div>
    </aside>
  );
};
