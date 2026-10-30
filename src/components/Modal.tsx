import React, { useId, useLayoutEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps extends Omit<React.DialogHTMLAttributes<HTMLDialogElement>, 'open' | 'onClose'> {
  open: boolean;
  onClose: () => void;
  /** 點彈窗外的遮罩是否關閉（有編輯中內容的彈窗不要開） */
  closeOnBackdrop?: boolean;
}

/**
 * 共用彈窗：以原生 <dialog> + showModal() 實作。
 * - 背景自動 inert，Tab 不會跑到彈窗外
 * - Esc 關閉（子元素的 keydown 呼叫 preventDefault 可攔下）
 * - 開啟時聚焦 [data-autofocus] 或第一個可聚焦元素，關閉後焦點回到開啟前的元素
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  closeOnBackdrop = false,
  className = '',
  children,
  ...rest
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;

    dialog.showModal();
    const target =
      dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();

    // Esc 由瀏覽器原生關閉，再同步回 React 狀態。
    // close 事件是非同步送達的：cleanup 呼叫 close() 後若同一個 dialog 又被開啟（StrictMode 會重跑 effect），
    // 遲到的事件不能把它關掉，所以只在 dialog 確實已關閉時才通知
    const handleClose = () => {
      if (!dialog.open) onCloseRef.current();
    };
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
      if (dialog.open && dialog.isConnected) dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      {...rest}
      onMouseDown={(e) => {
        if (!closeOnBackdrop || e.target !== e.currentTarget) return;
        // 點在遮罩上時 target 也是 dialog 本身，用座標排除點在彈窗內距的情況
        const r = e.currentTarget.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) onClose();
      }}
      className={`w-[calc(100%-2rem)] max-h-[88vh] overflow-hidden rounded-xl border border-line-strong bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60 open:flex open:flex-col ${className}`}
    >
      {children}
    </dialog>
  );
};

interface ConfirmModalProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

/** 破壞性操作的確認彈窗：預設聚焦「Cancel」，避免按 Enter 直接刪除 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({ open, title, confirmLabel, onConfirm, onClose, children }) => {
  const titleId = useId();
  const descId = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="max-w-[420px] p-5"
    >
      <h2 id={titleId} className="mb-2 flex items-center gap-2 text-sm font-semibold text-danger">
        <AlertTriangle size={15} /> {title}
      </h2>
      <div id={descId} className="text-sm leading-relaxed text-fg-muted">
        {children}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button data-autofocus onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button onClick={onConfirm} className="btn-danger">
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
