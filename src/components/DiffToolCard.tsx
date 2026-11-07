import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FilePen, FilePlus } from 'lucide-react';
import type { ToolCall } from '../types';

/* ------------------------------------------------------------------ */
/* 檔案修改卡片（edit / write）：收合時單行顯示，點擊展開 diff            */
/* ------------------------------------------------------------------ */

type DiffLineKind = 'add' | 'del' | 'ctx' | 'skip';

interface DiffLine {
  kind: DiffLineKind;
  lineNo: string;
  text: string;
}

/** 判斷是否為會修改檔案、需要顯示 diff 的工具 */
export const isFileEditTool = (tool: ToolCall): boolean =>
  tool.name === 'edit' || tool.name === 'write';

/**
 * 解析 Pi edit 工具回傳的 diff 字串。
 * 每行格式：首字元為 '+' / '-' / ' '，接著是補齊寬度的行號、一個空白，再接內容；
 * 省略區段則為 ' <空白> ...'。
 */
const parsePiDiff = (diff: string): DiffLine[] =>
  diff.split('\n').map((raw) => {
    const m = raw.match(/^([+\- ])(\s*\d*) (.*)$/);
    if (!m) return { kind: 'ctx', lineNo: '', text: raw };
    const [, sign, num, text] = m;
    const lineNo = num.trim();
    if (sign === '+') return { kind: 'add', lineNo, text };
    if (sign === '-') return { kind: 'del', lineNo, text };
    if (!lineNo && text === '...') return { kind: 'skip', lineNo: '', text: '⋯' };
    return { kind: 'ctx', lineNo, text };
  });

/** 尚未取得 Pi 的 diff 時（執行中／舊資料），用參數推估 diff */
const diffFromArgs = (tool: ToolCall): DiffLine[] => {
  const a = tool.args || {};
  if (tool.name === 'write') {
    const content = typeof a.content === 'string' ? a.content : '';
    return content.split('\n').map((text, i) => ({ kind: 'add', lineNo: String(i + 1), text }));
  }

  // edit：支援 edits[] 與舊版單一 oldText/newText
  let edits: Array<{ oldText?: string; newText?: string }> = [];
  if (Array.isArray(a.edits)) edits = a.edits;
  else if (typeof a.edits === 'string') {
    try {
      const parsed = JSON.parse(a.edits);
      edits = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      /* 忽略無法解析的參數 */
    }
  } else if (a.edits && typeof a.edits === 'object') edits = [a.edits];
  if (typeof a.oldText === 'string' && typeof a.newText === 'string') {
    edits = [...edits, { oldText: a.oldText, newText: a.newText }];
  }

  const lines: DiffLine[] = [];
  edits.forEach((e, idx) => {
    if (idx > 0) lines.push({ kind: 'skip', lineNo: '', text: '⋯' });
    (e.oldText ?? '').split('\n').forEach((text) => lines.push({ kind: 'del', lineNo: '', text }));
    (e.newText ?? '').split('\n').forEach((text) => lines.push({ kind: 'add', lineNo: '', text }));
  });
  return lines;
};

const lineStyle: Record<DiffLineKind, string> = {
  add: 'bg-emerald-500/10 text-emerald-300',
  del: 'bg-danger/10 text-danger',
  ctx: 'text-zinc-400',
  skip: 'text-fg-subtle bg-zinc-800/40',
};

const lineSign: Record<DiffLineKind, string> = { add: '+', del: '-', ctx: ' ', skip: ' ' };

export const DiffToolCard: React.FC<{
  tool: ToolCall;
  onOpenPath?: (path: string) => void;
}> = ({ tool, onOpenPath }) => {
  const [open, setOpen] = useState(false);

  const path: string =
    (typeof tool.args?.path === 'string' && tool.args.path) ||
    (typeof tool.args?.file_path === 'string' && tool.args.file_path) ||
    '';

  const lines = useMemo(
    () => (tool.diff ? parsePiDiff(tool.diff) : diffFromArgs(tool)),
    [tool.diff, tool.args, tool.name]
  );

  const added = lines.filter((l) => l.kind === 'add').length;
  const removed = lines.filter((l) => l.kind === 'del').length;
  const running = tool.status === 'running';
  const failed = tool.status === 'failed';
  const Icon = tool.name === 'write' ? FilePlus : FilePen;

  return (
    <div className="w-full max-w-full min-w-0 overflow-hidden">
      {/* 標題列：鋪滿整列的透明按鈕負責展開；檔案路徑是疊在上面的另一個按鈕，避免按鈕包按鈕 */}
      <div className="relative w-full py-1 flex items-center gap-2 text-zinc-300 text-sm hover:text-zinc-100 transition-colors select-none">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${tool.name} ${path}${added ? `, ${added} added` : ''}${removed ? `, ${removed} removed` : ''}`}
          title={open ? 'Collapse' : 'Show diff'}
          className="focus-ring-inset absolute inset-0 rounded"
        />
        <Icon size={13} className="text-fg-muted shrink-0" />
        <span className="shrink-0 font-mono text-zinc-200 font-semibold">{tool.name}</span>
        {path && onOpenPath ? (
          <button
            type="button"
            onClick={() => onOpenPath(path)}
            title={path}
            aria-label={`Open ${path}`}
            className="relative z-10 min-w-0 truncate rounded font-mono text-fg-subtle hover:text-zinc-200 transition-colors text-left"
          >
            {path}
          </button>
        ) : path ? (
          <span title={path} className="min-w-0 truncate font-mono text-fg-subtle">
            {path}
          </span>
        ) : null}
        <span className="flex-1 min-w-0" />
        {added > 0 && <span className="text-xs text-emerald-400 shrink-0 tabular-nums">+{added}</span>}
        {removed > 0 && <span className="text-xs text-danger shrink-0 tabular-nums">-{removed}</span>}
        {(running || failed) && (
          <span className={`text-xs shrink-0 ${failed ? 'text-danger' : 'text-warning'}`}>
            {tool.status}
          </span>
        )}
        <span className="ml-auto shrink-0 text-fg-subtle pl-1">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </div>

      {open && (
        <div className="ml-5 mr-1.5 mb-1 rounded-md border border-line bg-sunken overflow-hidden">
          {failed && tool.output && (
            <div className="px-3 py-1.5 text-xs font-mono text-danger border-b border-line whitespace-pre-wrap break-words">
              {tool.output}
            </div>
          )}
          {lines.length === 0 ? (
            <div className="px-3 py-2 text-xs text-fg-subtle italic">No changes to show</div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full border-collapse text-xs leading-[1.55] font-mono">
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className={lineStyle[l.kind]}>
                      <td className="select-none text-right pl-2 pr-2 text-fg-subtle align-top w-[1%] whitespace-nowrap">
                        {l.lineNo}
                      </td>
                      <td className="select-none pr-1 align-top w-[1%]">{lineSign[l.kind]}</td>
                      <td className="pr-3 whitespace-pre-wrap break-all">{l.text || ' '}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
