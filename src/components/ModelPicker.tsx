import React, { useEffect, useRef, useState } from 'react';
import { Brain, Check, ChevronDown, Cpu, Sliders } from 'lucide-react';
import type { ThinkingLevel } from '../types';

export interface PickerProfile {
  id: string;
  name: string;
  subtitle: string;
  isDefault: boolean;
}

interface ModelPickerProps {
  modelInfo?: string;
  envLabel?: string;
  /** 此環境已勾選啟用的模型設定檔 */
  profiles: PickerProfile[];
  activeProfileId?: string;
  onSelectProfile?: (profileId: string) => void;
  onOpenModelSettings?: () => void;
  thinkingLevel?: string;
  /** 目前模型支援的思考等級（由 pi 的模型定義推得） */
  thinkingLevels: ThinkingLevel[];
  onSelectThinking?: (level: ThinkingLevel) => void;
}

// 點選選單外部時關閉
function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);
  return ref;
}

/* 輸入框左下角：模型設定檔與思考等級切換 */
export const ModelPicker = React.memo<ModelPickerProps>(({
  modelInfo,
  envLabel,
  profiles,
  activeProfileId,
  onSelectProfile,
  onOpenModelSettings,
  thinkingLevel,
  thinkingLevels,
  onSelectThinking,
}) => {
  const [menu, setMenu] = useState<'profile' | 'thinking' | null>(null);
  const close = React.useCallback(() => setMenu(null), []);
  const ref = useOutsideClose(menu !== null, close);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const canThink = thinkingLevels.some((l) => l !== 'off');
  const level = (thinkingLevel || 'off') as ThinkingLevel;

  const pill =
    'flex items-center gap-1.5 px-2 py-1 rounded-md text-2xs font-medium transition border border-transparent hover:bg-zinc-800 hover:border-zinc-700/60';

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        onClick={() => setMenu((m) => (m === 'profile' ? null : 'profile'))}
        title={`Model profile · ${envLabel || 'Local'}`}
        className={`${pill} text-zinc-300 ${menu === 'profile' ? 'bg-zinc-800 border-zinc-700/60' : ''}`}
      >
        <Cpu size={12} className={envLabel ? 'text-cyan-400' : 'text-primary'} />
        <span className="truncate max-w-[200px]">{activeProfile?.name || modelInfo || 'Loading model…'}</span>
        <ChevronDown size={11} className="text-fg-subtle" />
      </button>

      <button
        onClick={() => canThink && setMenu((m) => (m === 'thinking' ? null : 'thinking'))}
        disabled={!canThink}
        title={canThink ? 'Thinking level' : 'This model does not support thinking'}
        className={`${pill} disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-transparent ${
          level !== 'off' && canThink ? 'text-primary' : 'text-zinc-400'
        } ${menu === 'thinking' ? 'bg-zinc-800 border-zinc-700/60' : ''}`}
      >
        <Brain size={12} className={level !== 'off' && canThink ? 'text-primary' : 'text-fg-subtle'} />
        <span>{canThink ? level : 'off'}</span>
        {canThink && <ChevronDown size={11} className="text-fg-subtle" />}
      </button>

      {menu === 'profile' && (
        <div className="absolute left-0 bottom-full mb-2 w-72 z-30 rounded-xl border border-zinc-700/80 bg-overlay shadow-2xl py-1.5 text-xs">
          <div className="px-3 py-1 text-2xs text-fg-subtle">{envLabel || 'Local'} profiles</div>
          {profiles.length === 0 && (
            <div className="px-3 py-2 text-zinc-400">No profiles enabled</div>
          )}
          {profiles.map((p) => {
            const active = p.id === activeProfileId;
            return (
              <button
                key={p.id}
                onClick={() => {
                  close();
                  if (!active) onSelectProfile?.(p.id);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-zinc-800/80 transition ${active ? 'text-zinc-100' : 'text-zinc-300'}`}
              >
                <Check size={13} className={`mt-0.5 shrink-0 ${active ? 'text-primary' : 'opacity-0'}`} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{p.name}</span>
                    {p.isDefault && <span className="text-2xs text-fg-subtle">Default</span>}
                  </span>
                  <span className="block truncate text-2xs text-fg-subtle font-mono">{p.subtitle}</span>
                </span>
              </button>
            );
          })}
          <div className="border-t border-zinc-800 mt-1.5 pt-1.5">
            <button
              onClick={() => {
                close();
                onOpenModelSettings?.();
              }}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-zinc-300 hover:bg-zinc-800/80 transition"
            >
              <Sliders size={13} className="text-zinc-400" />
              <span>Manage profiles…</span>
            </button>
          </div>
        </div>
      )}

      {menu === 'thinking' && (
        <div className="absolute left-0 bottom-full mb-2 w-36 z-30 rounded-xl border border-zinc-700/80 bg-overlay shadow-2xl py-1.5 text-xs">
          <div className="px-3 py-1 text-2xs text-fg-subtle">Thinking level</div>
          {/* 由高到低排列 */}
          {[...thinkingLevels].reverse().map((l) => {
            const active = l === level;
            return (
              <button
                key={l}
                onClick={() => {
                  close();
                  if (!active) onSelectThinking?.(l);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800/80 transition ${active ? 'text-zinc-100' : 'text-zinc-300'}`}
              >
                <Check size={13} className={`shrink-0 ${active ? 'text-primary' : 'opacity-0'}`} />
                <span className="flex-1">{l}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

ModelPicker.displayName = 'ModelPicker';
