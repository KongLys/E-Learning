'use client';

import { create } from 'zustand';
import type { AskScope } from '@/lib/api/ai.api';

/** Một prompt chờ được bơm vào panel "Hỏi AI". */
export interface PendingAsk {
  text: string;
  scope?: AskScope;
}

interface AiChatBridgeState {
  /** Prompt đang chờ panel tiêu thụ; `null` khi không có. */
  pending: PendingAsk | null;
  /** Đặt một prompt để panel "Hỏi AI" tự gửi (RAG theo `scope`). */
  askAi: (text: string, scope?: AskScope) => void;
  /** Lấy và xóa prompt đang chờ (panel gọi đúng 1 lần). */
  consume: () => PendingAsk | null;
}

/**
 * Kênh cầu nối để gửi prompt từ bất kỳ đâu (vd: nút "Vì sao đúng/sai?" trong
 * `ReviewQuizUI`) sang `AiChatPanel`. `AiChatPanel` là consumer duy nhất.
 */
export const useAiChatBridge = create<AiChatBridgeState>((set, get) => ({
  pending: null,
  askAi: (text, scope) => set({ pending: { text, scope } }),
  consume: () => {
    const p = get().pending;
    if (p) set({ pending: null });
    return p;
  },
}));
