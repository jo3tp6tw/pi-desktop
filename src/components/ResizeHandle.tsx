import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ResizeHandleProps {
  /**
   * 拖曳時回報「相對上一次 mousemove 的位移量 (deltaX，單位 px)」。
   * 由父層決定要加到哪個面板的寬度上，並自行做邊界限制。
   */
  onResize: (deltaX: number) => void;
  /** 拖曳結束時呼叫（可用來保存狀態） */
  onResizeEnd?: () => void;
  /** 雙擊時呼叫（可用來還原預設寬度） */
  onReset?: () => void;
  /** 無障礙標籤 */
  ariaLabel?: string;
  /** 這條分隔線控制的面板目前寬度與上下限（給螢幕閱讀器與 Home / End 使用） */
  value: number;
  min: number;
  max: number;
  /** 受控面板在分隔線右側（右欄）：分隔線往右移時面板變窄 */
  panelAfter?: boolean;
}

const KEY_STEP = 16;

/**
 * 垂直分隔線：可像 VS Code 一樣按住拖曳來調整左右欄寬。
 * 平時是細線，滑鼠移過去或拖曳中會高亮顯示。
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  onResize,
  onResizeEnd,
  onReset,
  ariaLabel = 'Resize column',
  value,
  min,
  max,
  panelAfter = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const lastX = useRef(0);
  const saveTimer = useRef<number>();

  // 用 ref 保存 callback，避免拖曳期間因父層 re-render 造成監聽器被重新註冊
  const onResizeRef = useRef(onResize);
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeRef.current = onResize;
  onResizeEndRef.current = onResizeEnd;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 只處理左鍵
    if (e.button !== 0) return;
    e.preventDefault();
    lastX.current = e.clientX;
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - lastX.current;
      if (deltaX === 0) return;
      lastX.current = e.clientX;
      onResizeRef.current(deltaX);
    };

    const stopDragging = () => {
      setIsDragging(false);
      onResizeEndRef.current?.();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopDragging);

    // 拖曳期間鎖定游標與選取行為，避免選到文字或游標閃爍
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopDragging);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isDragging]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 把「面板要變成多寬」換算成分隔線的位移量（右欄方向相反）
    const toWidth = (width: number) => onResize(panelAfter ? value - width : width - value);
    if (e.key === 'ArrowLeft') onResize(-KEY_STEP);
    else if (e.key === 'ArrowRight') onResize(KEY_STEP);
    else if (e.key === 'Home') toWidth(min);
    else if (e.key === 'End') toWidth(max);
    else if (e.key === 'Enter') onReset?.();
    else return;
    e.preventDefault();
    // 連續按鍵時只在停下來後保存一次；延後到父層用新寬度重新渲染之後
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onResizeEndRef.current?.(), 300);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      title="Drag or use arrow keys to resize, double-click to reset"
      onMouseDown={handleMouseDown}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className={`group relative z-30 w-1 shrink-0 cursor-col-resize touch-none transition-colors focus-visible:outline-none focus-visible:bg-primary ${
        isDragging ? 'bg-primary/70' : 'bg-transparent hover:bg-primary/40'
      }`}
    >
      {/* 加大可點擊範圍（左右各延伸 3px），但不影響視覺上的細線 */}
      <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
    </div>
  );
};
