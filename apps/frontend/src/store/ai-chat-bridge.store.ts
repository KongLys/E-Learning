'use client';

import { create } from 'zustand';
import type { AskScope } from '@/lib/api/ai.api';

/** Một prompt chờ được bơm vào panel "Hỏi AI". */
export interface PendingAsk {
  text: string;
  scope?: AskScope;
  /**
   * Nếu có: dùng endpoint giải thích đáp án quiz (grounding theo chunk nguồn) thay
   * cho RAG chung. `text` chỉ làm bong bóng câu hỏi hiển thị.
   */
  explain?: { questionId: string; pickedOptionIds: string[] };
}

interface AiChatBridgeState {
  /** Prompt đang chờ panel tiêu thụ; `null` khi không có. */
  pending: PendingAsk | null;
  /** Đặt một prompt để panel "Hỏi AI" tự gửi (RAG theo `scope`, hoặc giải thích quiz). */
  askAi: (
    text: string,
    scope?: AskScope,
    explain?: { questionId: string; pickedOptionIds: string[] },
  ) => void;
  /** Lấy và xóa prompt đang chờ (panel gọi đúng 1 lần). */
  consume: () => PendingAsk | null;
}

/**
 * Kênh cầu nối để gửi prompt từ bất kỳ đâu (vd: nút "Vì sao đúng/sai?" trong
 * `ReviewQuizUI`) sang `AiChatPanel`. `AiChatPanel` là consumer duy nhất.
 */
export const useAiChatBridge = create<AiChatBridgeState>((set, get) => ({
  pending: null,
  askAi: (text, scope, explain) => set({ pending: { text, scope, explain } }),
  consume: () => {
    const p = get().pending;
    if (p) set({ pending: null });
    return p;
  },
}));
