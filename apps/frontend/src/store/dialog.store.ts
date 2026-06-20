'use client';

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ConfirmState {
  kind: 'confirm';
  title: string;
  message?: string;
  confirmLabel?: string;
  resolve: (value: boolean) => void;
}

interface PromptState {
  kind: 'prompt';
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  resolve: (value: string | null) => void;
}

type DialogState = ConfirmState | PromptState;

interface DialogStore {
  toasts: Toast[];
  dialog: DialogState | null;
  pushToast: (type: ToastType, message: string) => void;
  dismissToast: (id: number) => void;
  openDialog: (dialog: DialogState) => void;
  closeDialog: () => void;
}

let toastSeq = 0;
const TOAST_DURATION = 3500;

export const useDialogStore = create<DialogStore>((set, get) => ({
  toasts: [],
  dialog: null,

  pushToast: (type, message) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => get().dismissToast(id), TOAST_DURATION);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));

/** API thông báo dạng popup (thay alert), gọi được ở mọi nơi kể cả callback. */
export const notify = {
  success: (message: string) => useDialogStore.getState().pushToast('success', message),
  error: (message: string) => useDialogStore.getState().pushToast('error', message),
  info: (message: string) => useDialogStore.getState().pushToast('info', message),
};

/** Hộp thoại xác nhận (thay confirm). Trả Promise<boolean>. */
export function showConfirm(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().openDialog({ kind: 'confirm', ...opts, resolve });
  });
}

/** Hộp thoại nhập liệu (thay prompt). Trả Promise<string | null> (null khi hủy). */
export function showPrompt(opts: {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().openDialog({ kind: 'prompt', ...opts, resolve });
  });
}
