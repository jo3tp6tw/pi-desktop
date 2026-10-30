import type React from 'react';

/**
 * 方向鍵在一組項目間移動時的下一個索引：到底會循環，Home/End 跳到頭尾。
 * 不是導覽鍵時回傳 null。current 為 -1（目前沒有聚焦任何項目）時，往後從第一項、往前從最後一項開始。
 */
export function rovingIndex(
  key: string,
  current: number,
  count: number,
  orientation: 'vertical' | 'horizontal'
): number | null {
  if (count === 0) return null;
  const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const prev = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  if (key === next) return current < 0 ? 0 : (current + 1) % count;
  if (key === prev) return current < 0 ? count - 1 : (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** 這個選單本身（不含子選單）可以聚焦的項目 */
export function menuItemsOf(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')).filter(
    (el) =>
      el.closest('[role="menu"]') === menu &&
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-disabled') !== 'true'
  );
}

/** 選單的 ↑↓ / Home / End；有處理時回傳 true */
export function moveMenuFocus(e: React.KeyboardEvent, menu: HTMLElement | null): boolean {
  const items = menuItemsOf(menu);
  const i = rovingIndex(e.key, items.indexOf(document.activeElement as HTMLElement), items.length, 'vertical');
  if (i === null) return false;
  e.preventDefault();
  e.stopPropagation();
  items[i].focus();
  return true;
}

/**
 * 分頁列的 ←→ / Home / End，掛在 role="tablist" 元素的 onKeyDown。
 * automatic：移到哪個分頁就直接切換；否則只移動焦點，按 Enter / 空白鍵才切換
 */
export function handleTabListKeyDown(e: React.KeyboardEvent<HTMLElement>, automatic = true) {
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
  const i = rovingIndex(e.key, tabs.indexOf(document.activeElement as HTMLElement), tabs.length, 'horizontal');
  if (i === null) return;
  e.preventDefault();
  tabs[i].focus();
  if (automatic) tabs[i].click();
}

/**
 * 鍵盤開啟右鍵選單的按鍵：Shift+F10 或選單鍵。
 * 瀏覽器原生不一定會為它們送出 contextmenu 事件，所以在 keydown 自己處理（並 preventDefault 避免重複開啟）
 */
export const isContextMenuKey = (e: React.KeyboardEvent) =>
  e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');

/**
 * 右鍵選單的位置：滑鼠右鍵用游標位置；
 * 鍵盤觸發時貼在 anchor（預設為事件元素）的左下角
 */
export function contextMenuPoint(
  e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
  anchor?: Element | null
) {
  if ('button' in e && e.button === 2) return { x: e.clientX, y: e.clientY };
  const r = (anchor ?? e.currentTarget).getBoundingClientRect();
  return { x: r.left + 8, y: r.bottom };
}
