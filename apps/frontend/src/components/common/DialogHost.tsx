'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Info, X, AlertTriangle } from 'lucide-react';
import { useDialogStore, type ToastType } from '@/store/dialog.store';

const TOAST_STYLE: Record<ToastType, { wrap: string; icon: React.ReactNode }> = {
  success: { wrap: 'bg-leaf-soft text-leaf-deep', icon: <CheckCircle size={18} /> },
  error: { wrap: 'bg-coral-soft text-coral', icon: <XCircle size={18} /> },
  info: { wrap: 'bg-sky-soft text-sky-deep', icon: <Info size={18} /> },
};

function ToastStack() {
  const toasts = useDialogStore((s) => s.toasts);
  const dismissToast = useDialogStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-60 flex flex-col items-center justify-center gap-3 p-4">
      {toasts.map((t) => {
        const style = TOAST_STYLE[t.type];
        return (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-modal bg-surface-card p-4 shadow-modal"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.wrap}`}>
              {style.icon}
            </div>
            <p className="min-w-0 flex-1 pt-1 text-sm leading-relaxed text-ink">{t.message}</p>
            <button
              onClick={() => dismissToast(t.id)}
              className="shrink-0 rounded-full p-1 text-ink-subtle transition-colors hover:bg-surface-strong hover:text-ink"
              aria-label="Đóng"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function DialogModal() {
  const dialog = useDialogStore((s) => s.dialog);
  const closeDialog = useDialogStore((s) => s.closeDialog);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dialog.kind === 'confirm') dialog.resolve(false);
      else dialog.resolve(null);
      closeDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, closeDialog]);

  if (!dialog) return null;

  const cancel = () => {
    if (dialog.kind === 'confirm') dialog.resolve(false);
    else dialog.resolve(null);
    closeDialog();
  };

  const accept = () => {
    if (dialog.kind === 'confirm') dialog.resolve(true);
    else dialog.resolve(inputRef.current?.value ?? '');
    closeDialog();
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={cancel}
    >
      <div
        className="w-full max-w-sm rounded-modal bg-surface-card p-6 shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral-soft text-coral">
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">{dialog.title}</h2>
            {dialog.message && <p className="mt-1 text-sm leading-relaxed text-muted">{dialog.message}</p>}
          </div>
        </div>

        {dialog.kind === 'prompt' && (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={dialog.defaultValue}
            onKeyDown={(e) => {
              if (e.key === 'Enter') accept();
            }}
            placeholder={dialog.placeholder}
            className="mt-4 w-full rounded-lg border border-hairline bg-surface-card px-3 py-2 text-sm text-ink outline-none focus:border-sky"
          />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={cancel}
            className="rounded-pill px-4 py-2 text-sm text-ink-mute transition-colors hover:bg-surface-strong"
          >
            Hủy
          </button>
          <button
            onClick={accept}
            className="rounded-pill bg-coral px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            {dialog.kind === 'confirm' ? dialog.confirmLabel ?? 'Xác nhận' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mount một lần ở root: hiển thị toast (thay alert) và modal confirm/prompt giữa màn hình. */
export function DialogHost() {
  return (
    <>
      <ToastStack />
      <DialogModal />
    </>
  );
}
