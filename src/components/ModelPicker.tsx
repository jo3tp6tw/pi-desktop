import React, { useEffect, useRef, useState } from 'react';
import { Brain, Check, ChevronDown, Cpu, Sliders } from 'lucide-react';
import type { ThinkingLevel } from '../types';
import { menuItemsOf, moveMenuFocus } from '../lib/a11y';

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
  const menuRef = useRef<HTMLDivElement>(null);
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const thinkingBtnRef = useRef<HTMLButtonElement>(null);

  // 開啟時聚焦目前選中的項目（沒有就第一項）
  useEffect(() => {
    if (!menu) return;
    const items = menuItemsOf(menuRef.current);
    (items.find((el) => el.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
  }, [menu]);

  // 用鍵盤或選了項目後關閉：焦點回到觸發按鈕
  const closeAndReturn = () => {
    (menu === 'thinking' ? thinkingBtnRef : profileBtnRef).current?.focus();
    setMenu(null);
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (moveMenuFocus(e, menuRef.current)) return;
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      closeAndReturn();
    }
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const canThink = thinkingLevels.some((l) => l !== 'off');
  const level = (thinkingLevel || 'off') as ThinkingLevel;

  const pill =
    'flex items-center gap-1.5 px-2 py-1 rounded-md text-2xs font-medium transition border border-transparent hover:bg-zinc-800 hover:border-zinc-700/60';

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        ref={profileBtnRef}
        onClick={() => setMenu((m) => (m === 'profile' ? null : 'profile'))}
        aria-haspopup="menu"
        aria-expanded={menu === 'profile'}
        title={`Model profile · ${envLabel || 'Local'}`}
        className={`${pill} text-zinc-300 ${menu === 'profile' ? 'bg-zinc-800 border-zinc-700/60' : ''}`}
      >
        <Cpu size={12} className={envLabel ? 'text-cyan-400' : 'text-primary'} />
        <span className="truncate max-w-[200px]">{activeProfile?.name || modelInfo || 'Loading model…'}</span>
        <ChevronDown size={11} className="text-fg-subtle" />
      </button>

      <button
        ref={thinkingBtnRef}
        onClick={() => canThink && setMenu((m) => (m === 'thinking' ? null : 'thinking'))}
        disabled={!canThink}
        aria-haspopup="menu"
        aria-expanded={menu === 'thinking'}
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
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${envLabel || 'Local'} profiles`}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 bottom-full mb-2 w-72 z-30 rounded-xl border border-zinc-700/80 bg-overlay shadow-2xl py-1.5 text-xs"
        >
          <div aria-hidden className="px-3 py-1 text-2xs text-fg-subtle">{envLabel || 'Local'} profiles</div>
          {profiles.length === 0 && (
            <div role="menuitem" aria-disabled="true" className="px-3 py-2 text-zinc-400">No profiles enabled</div>
          )}
          {profiles.map((p) => {
            const active = p.id === activeProfileId;
            return (
              <button
                key={p.id}
                role="menuitemradio"
                aria-checked={active}
                tabIndex={-1}
                onClick={() => {
                  closeAndReturn();
                  if (!active) onSelectProfile?.(p.id);
                }}
                className={`focus-ring-inset w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-zinc-800/80 transition ${active ? 'text-zinc-100' : 'text-zinc-300'}`}
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
          <div role="separator" className="border-t border-zinc-800 my-1.5" />
          <button
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              closeAndReturn();
              onOpenModelSettings?.();
            }}
            className="focus-ring-inset w-full text-left px-3 py-1.5 flex items-center gap-2 text-zinc-300 hover:bg-zinc-800/80 transition"
          >
            <Sliders size={13} className="text-zinc-400" />
            <span>Manage profiles…</span>
          </button>
        </div>
      )}

      {menu === 'thinking' && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Thinking level"
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 bottom-full mb-2 w-36 z-30 rounded-xl border border-zinc-700/80 bg-overlay shadow-2xl py-1.5 text-xs"
        >
          <div aria-hidden className="px-3 py-1 text-2xs text-fg-subtle">Thinking level</div>
          {/* 由高到低排列 */}
          {[...thinkingLevels].reverse().map((l) => {
            const active = l === level;
            return (
              <button
                key={l}
                role="menuitemradio"
                aria-checked={active}
                tabIndex={-1}
                onClick={() => {
                  closeAndReturn();
                  if (!active) onSelectThinking?.(l);
                }}
                className={`focus-ring-inset w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800/80 transition ${active ? 'text-zinc-100' : 'text-zinc-300'}`}
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
