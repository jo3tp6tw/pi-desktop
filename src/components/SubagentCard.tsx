import React, { useState } from 'react';
import { 
  Bot, 
  ChevronDown, 
  ChevronRight, 
  Loader2, 
  Terminal, 
  FileCode2, 
  Eye, 
  Sparkles,
  Search,
  ShieldAlert
} from 'lucide-react';
import type { SubagentTask } from '../types';

interface SubagentCardProps {
  task: SubagentTask;
  onInspect?: (task: SubagentTask) => void;
}

export const SubagentCard: React.FC<SubagentCardProps> = ({ task, onInspect }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // 根據角色給予專屬的配色與圖示
  const getAgentInfo = (agent: string) => {
    switch (agent.toLowerCase()) {
      case 'scout':
        return {
          icon: <Search size={13} className="text-fg-muted shrink-0" />,
          color: 'text-zinc-200',
          label: 'scout',
        };
      case 'planner':
        return {
          icon: <Sparkles size={13} className="text-fg-muted shrink-0" />,
          color: 'text-zinc-200',
          label: 'planner',
        };
      case 'reviewer':
        return {
          icon: <ShieldAlert size={13} className="text-fg-muted shrink-0" />,
          color: 'text-zinc-200',
          label: 'reviewer',
        };
      default:
        return {
          icon: <Bot size={13} className="text-fg-muted shrink-0" />,
          color: 'text-zinc-200',
          label: agent || 'subagent',
        };
    }
  };

  const info = getAgentInfo(task.agent);
  const running = task.status === 'running';
  const failed = task.status === 'failed';
  const completed = task.status === 'completed';

  return (
    <div className="w-full max-w-full min-w-0 overflow-hidden">
      {/* 標題列：鋪滿整列的透明按鈕負責展開；「Logs」是疊在上面的另一個按鈕，避免按鈕包按鈕 */}
      <div className="relative w-full py-1 flex items-center gap-2 text-zinc-300 text-sm hover:text-zinc-100 transition-colors">
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
          aria-label={`${info.label} ${task.status}${task.task ? `: ${task.task}` : ''}`}
          title={isExpanded ? 'Collapse' : 'Expand'}
          className="focus-ring-inset absolute inset-0 rounded"
        />
        {info.icon}
        <span className={`shrink-0 ${info.color} font-semibold capitalize`}>
          {info.label}
        </span>
        {task.task ? (
          <span className="flex-1 min-w-0 truncate text-fg-subtle text-left" title={task.task}>
            {task.task}
          </span>
        ) : (
          <span className="flex-1 min-w-0" />
        )}

        {running && (
          <span className="flex items-center space-x-1 text-xs text-warning shrink-0">
            <Loader2 size={11} className="animate-spin" />
            <span>Running</span>
          </span>
        )}
        {completed && (
          <span className="text-xs text-success shrink-0">Done</span>
        )}
        {failed && (
          <span className="text-xs text-danger shrink-0">Failed</span>
        )}

        {onInspect && (
          <button
            type="button"
            onClick={() => onInspect(task)}
            title="Open logs in side panel"
            className="relative z-10 text-xs text-zinc-400 hover:text-zinc-200 px-1 py-0.5 rounded hover:bg-zinc-800 shrink-0 transition flex items-center space-x-0.5"
          >
            <Eye size={11} />
            <span>Logs</span>
          </button>
        )}

        <span className="ml-auto shrink-0 text-fg-subtle pl-1">
          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </div>

      {/* 展開後的詳細內容（思考過程、內部工具調用、產出） */}
      {isExpanded && (
        <div className="ml-5 mr-1.5 mb-1 border-l border-line pl-3 py-1 space-y-2 text-xs">
          {/* 思考過程 */}
          {task.thinking && (
            <div>
              <div className="text-fg-subtle select-none mb-0.5">Thinking</div>
              <div className="text-zinc-400 leading-relaxed whitespace-pre-wrap">
                {task.thinking}
              </div>
            </div>
          )}

          {/* 工具調用時間軸 */}
          {task.tools && task.tools.length > 0 && (
            <div>
              <div className="text-fg-subtle select-none mb-1 flex items-center space-x-1">
                <Terminal size={11} />
                <span>Tool calls ({task.tools.length})</span>
              </div>
              <div className="space-y-1 pl-1">
                {task.tools.map((tool, idx) => {
                  const argsStr = tool.args ? (typeof tool.args === 'string' ? tool.args : JSON.stringify(tool.args)) : '';
                  return (
                    <div key={idx} className="flex items-center space-x-1.5 text-zinc-300 min-w-0">
                      <span className="text-fg-subtle shrink-0">•</span>
                      <span className="font-mono text-zinc-300 font-semibold shrink-0">{tool.name}</span>
                      <span className="font-mono text-fg-subtle truncate flex-1 min-w-0" title={argsStr}>
                        {argsStr}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 產出結論 */}
          {task.output && (
            <div>
              <div className="text-fg-subtle select-none mb-0.5 flex items-center space-x-1">
                <FileCode2 size={11} />
                <span>Result</span>
              </div>
              <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {task.output}
              </div>
            </div>
          )}

          {/* 資源消耗統計 */}
          {task.tokensUsed && (
            <div className="pt-1 text-fg-subtle tabular-nums flex justify-between">
              <span>{task.tokensUsed} tokens</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
