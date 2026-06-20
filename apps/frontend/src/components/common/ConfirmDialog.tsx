'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Hộp thoại xác nhận cho các thao tác nguy hiểm (xóa). Esc để hủy. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xóa',
  isPending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-modal bg-surface-card p-6 shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral-soft text-coral">
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">{title}</h2>
            {message && <p className="mt-1 text-sm leading-relaxed text-muted">{message}</p>}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-pill px-4 py-2 text-sm text-ink-mute transition-colors hover:bg-surface-strong"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-pill bg-coral px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Đang xóa...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
