import { apiClient } from './axios';

export type ModerationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'appealing'
  | 'locked';

/** Trạng thái chuyển đổi file tài liệu của bài học (PDF/DOCX → markdown → index). */
export type DocumentParseStatus = 'uploaded' | 'parsing' | 'parsed' | 'ready' | 'failed';

export interface AiConversation {
  id: string;
  userId: string;
  courseId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  citations:
    | Array<{
        index?: number;
        chunkId: string;
        sectionTitle: string | null;
        pageNumber: number | null;
        sectionId?: string | null;
        lessonId: string | null;
        excerpt?: string;
      }>
    | null;
  createdAt: string;
}

export const moderationApi = {
  appealCourse: (courseId: string, reason?: string) =>
    apiClient.post(`/courses/${courseId}/moderation/appeal`, { reason }),
  appealLesson: (lessonId: string, reason?: string) =>
    apiClient.post(`/lessons/${lessonId}/moderation/appeal`, { reason }),
};

export const MODERATION_LABELS: Record<ModerationStatus, string> = {
  pending: 'Chờ kiểm duyệt',
  approved: 'Đã duyệt',
  rejected: 'Không phù hợp',
  appealing: 'Đang kiến nghị',
  locked: 'Đã khóa',
};

export const MODERATION_COLORS: Record<ModerationStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  appealing: 'bg-amber-100 text-amber-800',
  locked: 'bg-zinc-200 text-zinc-700',
};

export const aiChatApi = {
  createConversation: (courseId: string, title?: string) =>
    apiClient.post<AiConversation>(`/courses/${courseId}/ai/conversations`, {
      title,
    }),
  listConversations: (courseId: string) =>
    apiClient.get<AiConversation[]>(`/courses/${courseId}/ai/conversations`),
  getMessages: (conversationId: string) =>
    apiClient.get<AiMessage[]>(`/ai/conversations/${conversationId}/messages`),
};

// ─── Quiz cá nhân tạo qua chat AI (lưu chung bảng review_quizzes, per-user) ─────

export interface MyReviewQuizSummary {
  id: string;
  title: string | null;
  createdAt: string;
  questionCount: number;
}

/** Thông tin quiz vừa tạo, đến qua sự kiện SSE `quiz`. */
export interface CreatedQuizInfo {
  id: string;
  title: string;
  questionCount: number;
}

export const myReviewQuizApi = {
  list: (courseId: string) =>
    apiClient.get<MyReviewQuizSummary[]>(
      `/courses/${courseId}/review-quizzes/mine`,
    ),
  get: (id: string) => apiClient.get(`/review-quizzes/${id}`),
  submit: (
    id: string,
    answers: { questionId: string; optionIds: string[] }[],
  ) => apiClient.post(`/review-quizzes/${id}/attempts`, { answers }),
};

// ─── Mind map ────────────────────────────────────────────────────────────────

export interface MindmapNode {
  title: string;
  summary?: string;
  keywords?: string[];
  children?: MindmapNode[];
}

export interface MindmapResult {
  status: 'pending' | 'generating' | 'ready' | 'failed';
  title?: string;
  structure?: MindmapNode & {
    formats?: { mermaid?: string; xmind?: unknown };
  };
  markmap?: string;
  errorMsg?: string | null;
  cached?: boolean;
  updatedAt?: string;
}

export const mindmapApi = {
  generate: (courseId: string, force = false) =>
    apiClient.post<MindmapResult>(`/courses/${courseId}/mindmap${force ? '?force=true' : ''}`),
  get: (courseId: string) => apiClient.get<MindmapResult>(`/courses/${courseId}/mindmap`),
};

export interface AskStreamHandlers {
  onCitations?: (citations: AiMessage['citations']) => void;
  onToken?: (text: string) => void;
  onQuiz?: (quiz: CreatedQuizInfo) => void;
  onDone?: (info: { length: number }) => void;
  onError?: (msg: string) => void;
}

/** Phạm vi truy vấn AI: cả khóa (rỗng), theo Phần (sectionId) hoặc theo Bài (lessonId). */
export interface AskScope {
  sectionId?: string;
  lessonId?: string;
}

export async function streamAsk(
  conversationId: string,
  query: string,
  handlers: AskStreamHandlers,
  scope?: AskScope,
): Promise<void> {
  const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const res = await fetch(`${baseURL}/ai/conversations/${conversationId}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, ...(scope?.sectionId ? { sectionId: scope.sectionId } : {}), ...(scope?.lessonId ? { lessonId: scope.lessonId } : {}) }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    handlers.onError?.(text || `HTTP ${res.status}`);
    return;
  }

  await consumeSse(res, handlers);
}

/** Đọc & phân giải luồng SSE (citations → token → quiz → done/error). */
async function consumeSse(res: Response, handlers: AskStreamHandlers): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nlIdx: number;
    while ((nlIdx = buffer.indexOf('\n\n')) >= 0) {
      const rawEvent = buffer.slice(0, nlIdx);
      buffer = buffer.slice(nlIdx + 2);
      const lines = rawEvent.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const payload = JSON.parse(data);
        if (event === 'citations') handlers.onCitations?.(payload);
        else if (event === 'token') handlers.onToken?.(payload as string);
        else if (event === 'quiz') handlers.onQuiz?.(payload as CreatedQuizInfo);
        else if (event === 'done') handlers.onDone?.(payload);
        else if (event === 'error') handlers.onError?.(payload.message);
      } catch {
        // ignore malformed events
      }
    }
  }
}

/** Giải thích đáp án một câu quiz ôn tập (stream SSE như streamAsk). */
export async function streamExplainQuiz(
  conversationId: string,
  body: { questionId: string; pickedOptionIds: string[] },
  handlers: AskStreamHandlers,
): Promise<void> {
  const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const res = await fetch(
    `${baseURL}/ai/conversations/${conversationId}/explain-quiz`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    handlers.onError?.(text || `HTTP ${res.status}`);
    return;
  }
  await consumeSse(res, handlers);
}
