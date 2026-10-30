import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { menuItemsOf, moveMenuFocus } from '../lib/a11y';

export interface ContextMenuItem {
  /** 選單文字（separator 時可省略） */
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  /** 紅色危險樣式（例如刪除） */
  danger?: boolean;
  disabled?: boolean;
  /** 設為 true 時渲染成一條分隔線 */
  separator?: boolean;
  /** 子選單項目（出現右側箭頭） */
  submenu?: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/** 單層選單面板（支援巢狀子選單） */
const MenuPanel: React.FC<{
  items: ContextMenuItem[];
  onSelect: (item: ContextMenuItem) => void;
  /** 關閉這一層子選單（回到上一層的項目）；最上層沒有 */
  onCloseSubmenu?: () => void;
  /** 開啟時是否把焦點移到第一項（滑鼠移入開啟的子選單不搶焦點） */
  autoFocus: boolean;
  /** 深度，用於擺放方向 */
  depth?: number;
}> = ({ items, onSelect, onCloseSubmenu, autoFocus, depth = 0 }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<{ index: number; focus: boolean } | null>(null);

  useEffect(() => {
    if (autoFocus) menuItemsOf(menuRef.current)[0]?.focus();
  }, [autoFocus]);

  const closeSub = (index: number) => {
    setOpenSub(null);
    menuRef.current?.querySelector<HTMLElement>(`[data-menu-index="${index}"]`)?.focus();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="py-1"
      onKeyDown={(e) => {
        if (moveMenuFocus(e, menuRef.current)) return;
        if (onCloseSubmenu && (e.key === 'ArrowLeft' || e.key === 'Escape')) {
          e.preventDefault();
          e.stopPropagation();
          onCloseSubmenu();
        }
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-zinc-700/60" />;
        }
        const hasSub = !!(item.submenu && item.submenu.length > 0);
        const subOpen = hasSub && openSub?.index === i;
        return (
          <div
            key={`${item.label}-${i}`}
            role="none"
            className="relative"
            onMouseEnter={(e) => {
              // 焦點跟著滑鼠，之後改用鍵盤時從這一項接著走
              if (!item.disabled) e.currentTarget.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
              setOpenSub(hasSub ? { index: i, focus: false } : null);
            }}
          >
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-menu-index={i}
              disabled={item.disabled}
              aria-haspopup={hasSub ? 'menu' : undefined}
              aria-expanded={hasSub ? subOpen : undefined}
              onClick={() => {
                if (item.disabled) return;
                if (hasSub) setOpenSub({ index: i, focus: true });
                else onSelect(item);
              }}
              onKeyDown={(e) => {
                if (hasSub && e.key === 'ArrowRight') {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenSub({ index: i, focus: true });
                }
              }}
              className={`focus-ring-inset w-full flex items-center gap-3 px-3 py-[7px] text-sm transition-colors text-left ${
                item.disabled
                  ? 'text-fg-disabled cursor-default'
                  : item.danger
                  ? 'text-danger hover:bg-danger/10 hover:text-danger'
                  : 'text-zinc-200 hover:bg-zinc-700/60'
              }`}
            >
              <span className={`w-4 h-4 shrink-0 flex items-center justify-center ${item.danger ? 'text-danger' : 'text-zinc-400'}`}>
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {hasSub && <ChevronRight size={13} className="text-fg-subtle shrink-0" />}
            </button>

            {subOpen && (
              <div
                className={`absolute top-[-4px] ${
                  depth === 0 ? 'left-full ml-0.5' : 'right-full mr-0.5'
                } min-w-[170px] rounded-lg border border-line-strong bg-overlay shadow-2xl shadow-black/50 z-50`}
              >
                <MenuPanel
                  items={item.submenu!}
                  onSelect={onSelect}
                  onCloseSubmenu={() => closeSub(i)}
                  autoFocus={openSub!.focus}
                  depth={depth + 1}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/**
 * 自製右鍵選單（深色主題，與 App 樣式一致）
 * - 全螢幕透明遮罩：點擊任意處 / 右鍵 / Escape / Tab 皆可關閉
 * - 鍵盤：↑↓ Home End 移動，→ / Enter 開子選單，← / Esc 回上一層
 * - 開啟時聚焦第一項，關閉後焦點回到開啟前的元素
 * - 自動避開視窗邊界
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  // 開啟選單前聚焦的元素（例如側欄的對話列），關閉或選了項目後焦點回到這裡
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const restoreFocus = () => {
    if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
  };

  // 自動避開視窗邊界
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (x + rect.width > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - rect.width - 8);
    if (y + rect.height > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - rect.height - 8);
    setPos({ x: nx, y: ny });
  }, [x, y, items]);

  // Escape / Tab 關閉 + 視窗縮放/滾動時關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    const onScrollOrResize = () => onCloseRef.current();
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('wheel', onScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('wheel', onScrollOrResize);
    };
  }, []);

  // 關閉時，若焦點還留在選單裡（或已隨選單消失），交回開啟前的元素
  useEffect(
    () => () => {
      const active = document.activeElement;
      if (!active || active === document.body || ref.current?.contains(active)) restoreFocus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleSelect = (item: ContextMenuItem) => {
    // 先把焦點交回開啟前的元素，項目若開啟彈窗，彈窗關閉後焦點才會回到正確的位置
    restoreFocus();
    try {
      item.onClick?.();
    } finally {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000]"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        style={{ left: pos.x, top: pos.y }}
        className="fixed min-w-[190px] rounded-lg border border-line-strong bg-overlay shadow-2xl shadow-black/50 text-zinc-200"
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <MenuPanel items={items} onSelect={handleSelect} autoFocus />
      </div>
    </div>
  );
};
