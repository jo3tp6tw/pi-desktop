import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Terminal,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Bot,
  User,
  Square,
  ArrowDown,
  Cpu,
  Brain,
  Sliders,
  Copy,
  Check,
  Pencil,
  RotateCcw,
  GitBranch,
  Bookmark,
  EyeOff,
  Eye,
  X,
  Trash2,
  Monitor,
  Server,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { ConnectionState, Message, SubagentTask, ThinkingLevel, ToolCall } from '../types';
import { ModelPicker } from './ModelPicker';
import { SubagentCard } from './SubagentCard';
import { Markdown } from './Markdown';
import { DiffToolCard, isFileEditTool } from './DiffToolCard';
import { getMessageParts } from '../lib/messageParts';

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onStop: () => void;
  onInspectSubagent?: (task: SubagentTask) => void;
  projectName?: string;
  projectPath?: string;
  conversationId?: string;
  modelInfo?: string;
  thinkingLevel?: string;
  /** 目前對話所在的 SSH 主機名稱；未提供表示在本機執行 */
  envLabel?: string;
  /** 此環境已啟用的模型設定檔（可在對話中切換） */
  profiles?: { id: string; name: string; subtitle: string; isDefault: boolean }[];
  activeProfileId?: string;
  onSelectProfile?: (profileId: string) => void;
  onOpenModelSettings?: () => void;
  /** 目前模型支援的思考等級 */
  thinkingLevels?: ThinkingLevel[];
  onSelectThinking?: (level: ThinkingLevel) => void;
  /** 單一使用者訊息粒度操作回呼 */
  onCopyMessage?: (text: string) => void;
  onSwitchBranch?: (message: Message, targetLeafId: string) => void;
  onEditAndResend?: (message: Message, newText: string, userTurnIndex: number) => void;
  onRegenerate?: (message: Message, userTurnIndex: number) => void;
  onForkFromMessage?: (message: Message, userTurnIndex: number) => void;
  onSetMessageLabel?: (message: Message, label: string | undefined, userTurnIndex: number) => void;
  onToggleMessageOmit?: (message: Message, userTurnIndex: number) => void;
  onOpenPath?: (path: string) => void;
  /** 目前對話的連線狀態（頂列右側顯示） */
  connection?: ConnectionState;
  onRetryConnection?: () => void;
}

/* ------------------------------------------------------------------ */
/* 頂列右側的連線狀態：依實際狀態顯示，中斷時可重試                      */
/* ------------------------------------------------------------------ */
const STATUS_VIEW: Record<Exclude<ConnectionState['state'], 'failed'>, { dot: string; label: string }> = {
  connecting: { dot: 'bg-fg-subtle', label: 'Connecting…' },
  ready: { dot: 'bg-success', label: 'Ready' },
  working: { dot: 'bg-warning', label: 'Working…' },
  offline: { dot: 'bg-fg-disabled', label: 'Preview' },
};

const ConnectionStatus: React.FC<{ connection: ConnectionState; onRetry?: () => void }> = ({ connection, onRetry }) => {
  if (connection.state === 'failed') {
    return (
      <div role="alert" className="flex min-w-0 items-center gap-2 text-xs">
        <span className="flex shrink-0 items-center gap-1.5 text-danger">
          <AlertCircle size={13} className="shrink-0" />
          Disconnected
        </span>
        {connection.error && (
          <span className="min-w-0 max-w-[240px] truncate select-text text-fg-subtle" title={connection.error}>
            {connection.error}
          </span>
        )}
        {onRetry && (
          <button onClick={onRetry} className="btn-ghost shrink-0 px-2 py-0.5 text-xs">
            Retry
          </button>
        )}
      </div>
    );
  }
  const view = STATUS_VIEW[connection.state];
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
      <span className={`w-2 h-2 rounded-full ${view.dot}`} />
      <span>{view.label}</span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 純圖示 + 即時懸浮 Tooltip 按鈕元件（無文字、無表情符號）                */
/* ------------------------------------------------------------------ */
interface IconTipButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  active?: boolean;
  activeClassName?: string;
  danger?: boolean;
  className?: string;
}

const IconTipButton: React.FC<IconTipButtonProps> = ({
  icon,
  tooltip,
  onClick,
  disabled = false,
  active = false,
  activeClassName = 'text-primary bg-primary/15 border-primary/30',
  danger = false,
  className = '',
}) => {
  return (
    <div className="relative group/tip inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={tooltip}
        className={`min-h-6 min-w-6 p-1.5 rounded-md border transition flex items-center justify-center disabled:opacity-35 disabled:pointer-events-none ${
          danger
            ? 'border-transparent text-zinc-400 hover:text-danger hover:bg-danger/10 hover:border-danger/20'
            : active
              ? activeClassName
              : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/90 hover:border-zinc-700/60'
        } ${className}`}
      >
        {icon}
      </button>
      <div className="pointer-events-none absolute bottom-full right-0 mb-1.5 opacity-0 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 transition-opacity duration-150 z-40">
        <div className="px-2 py-1 rounded-md bg-zinc-950/95 border border-zinc-700/80 text-2xs text-zinc-200 whitespace-nowrap shadow-xl">
          {tooltip}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 單一訊息列：以 React.memo 包裝，只有該訊息或展開狀態改變時才重繪      */
/* ------------------------------------------------------------------ */
interface MessageItemProps {
  message: Message;
  userTurnIndex: number;
  isLoading: boolean;
  onInspectSubagent?: (task: SubagentTask) => void;
  onCopyMessage?: (text: string) => void;
  onSwitchBranch?: (message: Message, targetLeafId: string) => void;
  onEditAndResend?: (message: Message, newText: string, userTurnIndex: number) => void;
  onRegenerate?: (message: Message, userTurnIndex: number) => void;
  onForkFromMessage?: (message: Message, userTurnIndex: number) => void;
  onSetMessageLabel?: (message: Message, label: string | undefined, userTurnIndex: number) => void;
  onToggleMessageOmit?: (message: Message, userTurnIndex: number) => void;
  onOpenPath?: (path: string) => void;
}

/* ------------------------------------------------------------------ */
/* 工具呼叫卡片：獨立元件，供有序片段渲染使用                            */
/* ------------------------------------------------------------------ */
// 工具參數摘要（收合時單行顯示）
const toolSummary = (tool: ToolCall): string => {
  const a = tool.args || {};
  let summary = '';
  if (typeof a.command === 'string') summary = a.command;
  else if (typeof a.path === 'string') summary = a.path;
  else if (typeof a.file_path === 'string') summary = a.file_path;
  else {
    try {
      summary = JSON.stringify(a);
    } catch {
      summary = String(a);
    }
  }
  // 將換行替換為單一空格並去除頭尾空白，確保收合單行預覽時整潔不跳行
  return summary.replace(/\r?\n/g, ' ').trim();
};

// 工具參數完整內容（第一段展開時顯示）
const toolDetail = (tool: ToolCall): string => {
  const a = tool.args || {};
  if (typeof a.command === 'string') return a.command;
  try {
    return JSON.stringify(a, null, 2);
  } catch {
    return String(a);
  }
};

// 展開狀態（與右欄指令卡片一致）：0 = 單行、1 = 展開指令、2 = 顯示輸出
const ToolCallCard: React.FC<{ tool: ToolCall; onOpenPath?: (path: string) => void }> = ({
  tool,
  onOpenPath,
}) => {
  const [state, setState] = useState(0);
  const cycle = () => setState((s) => (s + 1) % 3);

  const summary = toolSummary(tool);
  const detail = toolDetail(tool);
  const output = tool.output ?? '';
  const running = tool.status === 'running';

  const filePathArg: string =
    (typeof tool.args?.path === 'string' && tool.args.path) ||
    (typeof tool.args?.file_path === 'string' && tool.args.file_path) ||
    '';

  return (
    <div className="w-full max-w-full min-w-0 overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={cycle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            cycle();
          }
        }}
        title={state === 0 ? summary || 'Expand' : state === 1 ? 'Show output' : 'Collapse'}
        className="focus-ring-inset w-full py-1 flex items-center space-x-2 text-zinc-300 text-sm text-left hover:text-zinc-100 transition-colors cursor-pointer select-none"
      >
        <Terminal size={13} className="text-fg-muted shrink-0" />
        <span className="shrink-0 font-mono text-zinc-200 font-semibold">{tool.name}</span>
        {state === 0 && summary ? (
          filePathArg && onOpenPath ? (
            <>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPath(filePathArg);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenPath(filePathArg);
                  }
                }}
                title={filePathArg}
                className="truncate font-mono text-fg-subtle hover:text-zinc-200 transition-colors cursor-pointer text-left"
              >
                {summary}
              </span>
              <span className="flex-1 min-w-0" />
            </>
          ) : (
            <span className="flex-1 min-w-0 truncate font-mono text-fg-subtle text-left" title={summary}>
              {summary}
            </span>
          )
        ) : (
          <span className="flex-1 min-w-0" />
        )}
        <span
          className={`text-xs shrink-0 ${
            tool.status === 'failed'
              ? 'text-danger'
              : running
                ? 'text-warning'
                : 'text-success'
          }`}
        >
          {tool.status}
        </span>
        <span className="ml-auto shrink-0 text-fg-subtle pl-1">
          {state === 0 ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </span>
      </div>

      {/* 第一段展開：完整指令／參數 */}
      {state >= 1 && (
        <div className="pl-5 pr-1.5 py-1 text-sm font-mono text-zinc-300 whitespace-pre-wrap break-all max-w-full overflow-x-auto">
          {typeof tool.args?.command === 'string' && (
            <span className="text-emerald-400 select-none">$ </span>
          )}
          {detail}
        </div>
      )}

      {/* 第二段展開：輸出 */}
      {state === 2 && (
        <div className="ml-5 mr-1.5 mb-1 border-l border-line pl-3 max-w-full">
          {output ? (
            <pre className="max-h-[320px] overflow-auto text-xs leading-[1.55] font-mono text-zinc-400 whitespace-pre-wrap break-words">
              {output}
            </pre>
          ) : (
            <div className="text-xs text-fg-subtle italic">
              {running ? 'Waiting for output…' : 'No output'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 取得文字最後一行非空白內容（用於收合思考時顯示最新生成的一行）
const lastLineOf = (text: string): string => {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line) return line;
  }
  return '';
};

const MessageItem = React.memo<MessageItemProps>(({
  message,
  userTurnIndex,
  isLoading,
  onInspectSubagent,
  onCopyMessage,
  onSwitchBranch,
  onEditAndResend,
  onRegenerate,
  onForkFromMessage,
  onSetMessageLabel,
  onToggleMessageOmit,
  onOpenPath,
}) => {
  const isUser = message.role === 'user';
  const parts = getMessageParts(message);
  // 每個思考片段的展開狀態各自管理（只重繪本則訊息）
  const [openThinking, setOpenThinking] = useState<Record<string, boolean>>({});
  const toggleThinking = (partKey: string) =>
    setOpenThinking((prev) => ({ ...prev, [partKey]: !prev[partKey] }));

  // 複製狀態提示
  const [copied, setCopied] = useState(false);

  // 原地編輯並重送狀態
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  // 書籤標記編輯器狀態
  const [isLabelOpen, setIsLabelOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState(message.label || '');

  useEffect(() => {
    setEditText(message.content);
  }, [message.content]);

  useEffect(() => {
    setLabelDraft(message.label || '');
  }, [message.label]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCopyMessage) {
      onCopyMessage(message.content);
    } else {
      navigator.clipboard?.writeText(message.content).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditText(message.content);
    setIsLabelOpen(false);
    setIsEditing(true);
  };

  const handleConfirmEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const trimmed = editText.trim();
    if (!trimmed || isLoading) return;
    setIsEditing(false);
    onEditAndResend?.(message, trimmed, userTurnIndex);
  };

  const handleSaveLabel = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const trimmed = labelDraft.trim();
    setIsLabelOpen(false);
    onSetMessageLabel?.(message, trimmed || undefined, userTurnIndex);
  };

  const handleRemoveLabel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLabelDraft('');
    setIsLabelOpen(false);
    onSetMessageLabel?.(message, undefined, userTurnIndex);
  };

  const branchCount = message.branchCount ?? 1;
  const branchIndex = message.branchIndex ?? 0;
  const siblingLeafIds = message.siblingLeafIds ?? [];

  const handlePrevBranch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (branchIndex <= 0 || isLoading) return;
    const targetLeafId = siblingLeafIds[branchIndex - 1];
    if (targetLeafId) onSwitchBranch?.(message, targetLeafId);
  };

  const handleNextBranch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (branchIndex >= branchCount - 1 || isLoading) return;
    const targetLeafId = siblingLeafIds[branchIndex + 1];
    if (targetLeafId) onSwitchBranch?.(message, targetLeafId);
  };

  return (
    <div
      className={`group/msg flex space-x-3 max-w-4xl mx-auto transition-opacity w-full min-w-0 ${
        isUser ? 'justify-end' : 'justify-start'
      } ${message.omitted ? 'opacity-50' : ''}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5 text-primary shadow-sm">
          <Bot size={16} />
        </div>
      )}

      <div className={`flex flex-col space-y-1.5 min-w-0 ${isUser ? 'max-w-[85%] items-end' : 'flex-1 min-w-0 items-stretch w-full'}`}>
        {/* 若使用者訊息有書籤標記，顯示於對話框右上角 */}
        {isUser && message.label && !isLabelOpen && (
          <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-2xs font-medium">
            <Bookmark size={11} className="fill-primary/40 text-primary shrink-0" />
            <span className="truncate max-w-[200px]">{message.label}</span>
          </div>
        )}

        {/* 使用者訊息原地編輯模式 */}
        {isUser && isEditing ? (
          <div className="w-full min-w-[300px] sm:min-w-[440px] rounded-xl bg-zinc-900 border border-primary/60 p-3 shadow-lg space-y-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEditing(false);
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleConfirmEdit();
                }
              }}
              rows={Math.min(8, Math.max(2, editText.split('\n').length))}
              autoFocus
              className="field rounded-lg bg-zinc-950/70 border-zinc-800 p-2.5 resize-y leading-relaxed"
            />
            <div className="flex items-center justify-end space-x-1">
              <IconTipButton
                icon={<X size={14} />}
                tooltip="Cancel (Esc)"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(false);
                }}
              />
              <IconTipButton
                icon={<Send size={14} />}
                tooltip="Resend as new branch (Enter)"
                disabled={!editText.trim() || isLoading}
                active
                activeClassName="text-white bg-primary-solid hover:brightness-110 border-primary/80"
                onClick={(e) => handleConfirmEdit(e)}
              />
            </div>
          </div>
        ) : (
          /* 依實際發生順序逐一片段渲染：思考 / 文字 / 工具 / 子代理交錯呈現 */
          parts.map((part, index) => {
            if (part.type === 'thinking') {
              const partKey = `${message.id}:${index}`;
              const isOpen = !!openThinking[partKey];
              // 收合時顯示最新生成的一行，讓使用者看到思考正在進行
              const preview = lastLineOf(part.text);
              return (
                <div
                  key={partKey}
                  className="w-full max-w-full min-w-0 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleThinking(partKey)}
                    className="focus-ring-inset w-full py-1 flex items-center space-x-2 text-zinc-300 text-sm text-left hover:text-zinc-100 transition-colors"
                  >
                    <Sparkles size={13} className="text-fg-muted shrink-0" />
                    <span className="shrink-0 text-fg-muted font-semibold">Thinking</span>
                    {!isOpen && preview && (
                      <span className="flex-1 min-w-0 truncate text-fg-subtle text-left" title={preview}>
                        {preview}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-fg-subtle pl-1">
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="pl-5 pr-1.5 py-1 text-zinc-400 font-sans text-sm leading-relaxed whitespace-pre-wrap">
                      {part.text}
                    </div>
                  )}
                </div>
              );
            }

            if (part.type === 'text') {
              return isUser ? (
                <div
                  key={index}
                  className={`px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm select-text bg-zinc-800 text-zinc-100 rounded-br-xs border ${
                    message.omitted
                      ? 'border-dashed border-zinc-600 line-through decoration-zinc-500/50'
                      : 'border-zinc-700/60'
                  }`}
                >
                  {part.text}
                </div>
              ) : (
                <Markdown key={index} onOpenPath={onOpenPath}>
                  {part.text}
                </Markdown>
              );
            }

            if (part.type === 'subagent') {
              return (
                <SubagentCard
                  key={`${message.id}:sub:${part.task.id}`}
                  task={part.task}
                  onInspect={onInspectSubagent}
                />
              );
            }

            if (part.type === 'tool') {
              // 修改檔案的工具（edit / write）改用可展開的 diff 卡片
              if (isFileEditTool(part.tool)) {
                return (
                  <DiffToolCard
                    key={`${message.id}:tool:${part.tool.id}`}
                    tool={part.tool}
                    onOpenPath={onOpenPath}
                  />
                );
              }
              return (
                <ToolCallCard
                  key={`${message.id}:tool:${part.tool.id}`}
                  tool={part.tool}
                  onOpenPath={onOpenPath}
                />
              );
            }

            return null;
          })
        )}

        {/* 書籤標記編輯列 */}
        {isUser && isLabelOpen && !isEditing && (
          <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700/80 shadow-lg">
            <Bookmark size={13} className="text-primary shrink-0" />
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveLabel();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsLabelOpen(false);
                }
              }}
              placeholder="Bookmark name"
              autoFocus
              className="field w-40 rounded bg-zinc-950/80 border-zinc-800 px-2 py-0.5 text-xs"
            />
            <IconTipButton
              icon={<Check size={13} />}
              tooltip="Save bookmark (Enter)"
              active
              activeClassName="text-emerald-300 bg-emerald-500/15 border-emerald-500/30"
              onClick={(e) => handleSaveLabel(e)}
            />
            {message.label && (
              <IconTipButton
                icon={<Trash2 size={13} />}
                tooltip="Remove bookmark"
                danger
                onClick={handleRemoveLabel}
              />
            )}
            <IconTipButton
              icon={<X size={13} />}
              tooltip="Cancel (Esc)"
              onClick={(e) => {
                e.stopPropagation();
                setIsLabelOpen(false);
              }}
            />
          </div>
        )}

        {/* 使用者對話框角落的操作按鈕列（全 Icon + Tooltip，無文字、無表情符號） */}
        {isUser && !isEditing && (
          <div className="flex items-center justify-end gap-0.5 pt-0.5 opacity-60 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity select-none">
            {/* 平行分支切換器 (< 1 / N >) */}
            {branchCount > 1 && (
              <div className="flex items-center space-x-0.5 mr-1 px-1 py-0.5 rounded-md bg-zinc-900/90 border border-zinc-800/90">
                <IconTipButton
                  icon={<ChevronLeft size={13} />}
                  tooltip="Previous branch"
                  disabled={branchIndex <= 0 || isLoading}
                  onClick={handlePrevBranch}
                  className="!p-1"
                />
                <span className="px-1 text-2xs tabular-nums text-zinc-300">
                  {branchIndex + 1} / {branchCount}
                </span>
                <IconTipButton
                  icon={<ChevronRight size={13} />}
                  tooltip="Next branch"
                  disabled={branchIndex >= branchCount - 1 || isLoading}
                  onClick={handleNextBranch}
                  className="!p-1"
                />
              </div>
            )}

            {/* 1. 複製訊息 */}
            <IconTipButton
              icon={copied ? <Check size={13} /> : <Copy size={13} />}
              tooltip={copied ? 'Copied' : 'Copy message'}
              active={copied}
              activeClassName="text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
              onClick={handleCopy}
            />

            {/* 2. 原地編輯並重送（建立新分支） */}
            <IconTipButton
              icon={<Pencil size={13} />}
              tooltip="Edit and resend"
              disabled={isLoading}
              onClick={handleStartEdit}
            />

            {/* 3. 重新生成此輪回應 */}
            <IconTipButton
              icon={<RotateCcw size={13} />}
              tooltip="Regenerate response"
              disabled={isLoading}
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate?.(message, userTurnIndex);
              }}
            />

            {/* 4. 從此輪對話分叉出獨立的新對話檔 (Fork) */}
            <IconTipButton
              icon={<GitBranch size={13} />}
              tooltip="Fork into new conversation"
              disabled={isLoading}
              onClick={(e) => {
                e.stopPropagation();
                onForkFromMessage?.(message, userTurnIndex);
              }}
            />

            {/* 5. 標記書籤 (Label) */}
            <IconTipButton
              icon={<Bookmark size={13} />}
              tooltip={message.label ? `Edit bookmark: ${message.label}` : 'Bookmark'}
              active={!!message.label || isLabelOpen}
              onClick={(e) => {
                e.stopPropagation();
                setLabelDraft(message.label || '');
                setIsLabelOpen((prev) => !prev);
              }}
            />

            {/* 6. 從 AI 上下文中隱藏 / 恢復此輪訊息 (Context Omit) */}
            <IconTipButton
              icon={message.omitted ? <Eye size={13} /> : <EyeOff size={13} />}
              tooltip={
                message.omitted
                  ? 'Hidden from AI context — click to include'
                  : 'Hide from AI context'
              }
              active={!!message.omitted}
              disabled={isLoading}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMessageOmit?.(message, userTurnIndex);
              }}
            />
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-zinc-700/60 border border-zinc-600/50 flex items-center justify-center shrink-0 mt-0.5 text-zinc-300 shadow-sm">
          <User size={16} />
        </div>
      )}
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

/* ------------------------------------------------------------------ */
/* 底部輸入框：獨立管理輸入狀態，打字時只重繪此元件                      */
/* ------------------------------------------------------------------ */
interface ChatInputProps {
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onStop: () => void;
  /** 輸入框左下角的工具列（模型 / 思考強度切換） */
  toolbar?: React.ReactNode;
}

const ChatInput = React.memo<ChatInputProps>(({ isLoading, onSendMessage, onStop, toolbar }) => {
  const [inputText, setInputText] = useState('');

  const submit = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    onSendMessage(text);
    setInputText('');
  }, [inputText, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim() && !isLoading) {
        submit();
      }
    }
  };

  return (
    <div className="p-3 border-t border-line bg-surface-2">
      <div className="max-w-4xl mx-auto">
        <div className="relative rounded-xl border border-zinc-700/60 bg-zinc-900/90 focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-primary/30 transition shadow-lg">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Pi… (Shift+Enter for a new line)"
            rows={3}
            className="w-full bg-transparent p-3 pb-11 text-sm text-zinc-100 placeholder:text-fg-subtle focus:outline-none resize-none font-sans"
          />

          {toolbar && <div className="absolute bottom-2 left-2">{toolbar}</div>}

          {/* 輸入框底部的按鈕 */}
          <div className="absolute bottom-2.5 right-3 flex items-center space-x-2">
            {isLoading ? (
              <button
                onClick={onStop}
                className="px-3 py-1.5 rounded-lg bg-danger-solid/80 hover:bg-danger-solid text-white text-sm font-medium flex items-center space-x-1.5 transition shadow"
              >
                <Square size={12} fill="white" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!inputText.trim()}
                className="p-1.5 rounded-lg bg-primary-solid hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 text-white transition shadow"
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

/* ------------------------------------------------------------------ */
/* ChatArea 主體                                                       */
/* ------------------------------------------------------------------ */
export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isLoading,
  onSendMessage,
  onStop,
  onInspectSubagent,
  projectName = '',
  projectPath = '',
  conversationId,
  modelInfo,
  thinkingLevel,
  envLabel,
  profiles = [],
  activeProfileId,
  onSelectProfile,
  onOpenModelSettings,
  thinkingLevels = ['off'],
  onSelectThinking,
  onCopyMessage,
  onSwitchBranch,
  onEditAndResend,
  onRegenerate,
  onForkFromMessage,
  onSetMessageLabel,
  onToggleMessageOmit,
  onOpenPath,
  connection = { state: 'connecting' },
  onRetryConnection,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  // 使用者是否貼齊底部（決定是否自動跟隨新內容）
  const stickToBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    stickToBottomRef.current = near;
    setShowScrollButton((prev) => (prev === !near ? prev : !near));
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setShowScrollButton(false);
  }, []);

  // 切換對話時重置跟隨狀態並直接跳到底部
  useEffect(() => {
    stickToBottomRef.current = true;
    setShowScrollButton(false);
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
  }, [conversationId]);

  // 有新內容時，只有在使用者仍貼齊底部才自動追到底；一旦往上捲就停止跟隨
  useEffect(() => {
    if (stickToBottomRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    }
  }, [messages, isLoading]);

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-canvas text-zinc-100 overflow-hidden">
      {/* 頂部會話導航列 */}
      <header className="panel-header justify-between px-4 select-none">
        <div className="flex items-center space-x-2 min-w-0">
          {/* 執行環境標籤：本機或 SSH 主機（模型設定也依此環境而定） */}
          {envLabel ? (
            <span
              title={`Running on ${envLabel}`}
              className="shrink-0 flex items-center space-x-1 text-2xs px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
            >
              <Server size={11} />
              <span className="truncate max-w-[140px]">{envLabel}</span>
            </span>
          ) : (
            <span
              title="Running locally"
              className="shrink-0 flex items-center space-x-1 text-2xs px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/60"
            >
              <Monitor size={11} />
              <span>Local</span>
            </span>
          )}
          <div
            className="flex items-center text-xs text-fg-subtle font-mono truncate max-w-md select-text"
            title={projectPath || projectName}
          >
            {projectPath || projectName}
          </div>
        </div>

        <ConnectionStatus connection={connection} onRetry={onRetryConnection} />
      </header>

      {/* 對話訊息列表 */}
      <div className="relative flex-1 flex flex-col min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 py-5 space-y-4"
        >
        {/* 空狀態 */}
        {messages.length === 0 && !isLoading && (
          <div className="h-full flex items-center justify-center text-sm text-fg-subtle select-none">
            No messages yet
          </div>
        )}

        {(() => {
          let currentUserTurnIndex = -1;
          return messages.map((message) => {
            if (message.role === 'user') {
              currentUserTurnIndex += 1;
            }
            const turnIdx = currentUserTurnIndex;
            return (
              <MessageItem
                key={message.id}
                message={message}
                userTurnIndex={turnIdx}
                isLoading={isLoading}
                onInspectSubagent={onInspectSubagent}
                onCopyMessage={onCopyMessage}
                onSwitchBranch={onSwitchBranch}
                onEditAndResend={onEditAndResend}
                onRegenerate={onRegenerate}
                onForkFromMessage={onForkFromMessage}
                onSetMessageLabel={onSetMessageLabel}
                onToggleMessageOmit={onToggleMessageOmit}
                onOpenPath={onOpenPath}
              />
            );
          });
        })()}

        {/* 送出後、第一段回應抵達前 */}
        {isLoading && (messages.length === 0 || messages[messages.length - 1].role === 'user') && (
          <div role="status" className="flex space-x-3 max-w-4xl mx-auto w-full min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5 text-primary shadow-sm">
              <Bot size={16} />
            </div>
            <div className="flex items-center gap-2 py-1 text-sm text-fg-muted">
              <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />
              Working…
            </div>
          </div>
        )}

        </div>

        {/* 不在最下方時才顯示「回到最下面」懸浮按鈕 */}
        {showScrollButton && (
          <button
            onClick={() => scrollToBottom()}
            title="Scroll to bottom"
            className="absolute bottom-4 right-6 z-10 w-8 h-8 rounded-full bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 shadow-lg flex items-center justify-center transition"
          >
            <ArrowDown size={16} />
          </button>
        )}
      </div>

      {/* 底部輸入區域（獨立元件，避免打字觸發訊息列表重繪） */}
      <ChatInput
        isLoading={isLoading}
        onSendMessage={onSendMessage}
        onStop={onStop}
        toolbar={
          <ModelPicker
            modelInfo={modelInfo}
            envLabel={envLabel}
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSelectProfile={onSelectProfile}
            onOpenModelSettings={onOpenModelSettings}
            thinkingLevel={thinkingLevel}
            thinkingLevels={thinkingLevels}
            onSelectThinking={onSelectThinking}
          />
        }
      />
    </div>
  );
};
