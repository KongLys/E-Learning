import { apiClient } from './axios';

export type ModerationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'appealing'
  | 'locked';

export interface CourseMaterial {
  id: string;
  courseId: string;
  fileName: string;
  fileUrl: string;
  markdownUrl: string | null;
  fileType: 'pdf' | 'docx';
  fileSize: string;
  status: 'uploaded' | 'parsing' | 'parsed' | 'ready' | 'failed';
  errorMsg: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
  moderationStatus: ModerationStatus;
  moderationLabel: string | null;
  moderationScore: number | null;
  moderationReason: string | null;
  appealReason: string | null;
  moderatedAt: string | null;
}

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
        materialId: string | null;
        lessonId: string | null;
      }>
    | null;
  createdAt: string;
}

export const materialsApi = {
  list: (courseId: string) =>
    apiClient.get<CourseMaterial[]>(`/courses/${courseId}/materials`),
  upload: (courseId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post<CourseMaterial>(`/courses/${courseId}/materials`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  remove: (courseId: string, materialId: string) =>
    apiClient.delete(`/courses/${courseId}/materials/${materialId}`),
  retry: (courseId: string, materialId: string) =>
    apiClient.post(`/courses/${courseId}/materials/${materialId}/retry`),
  appeal: (courseId: string, materialId: string, reason?: string) =>
    apiClient.post(`/courses/${courseId}/materials/${materialId}/moderation/appeal`, { reason }),
};

export const moderationApi = {
  appealCourse: (courseId: string, reason?: string) =>
    apiClient.post(`/courses/${courseId}/moderation/appeal`, { reason }),
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

export interface MindmapMaterial {
  id: string;
  fileName: string;
  chunkCount: number;
  mindmapStatus: 'pending' | 'generating' | 'ready' | 'failed' | null;
}

export const mindmapApi = {
  listMaterials: (courseId: string) =>
    apiClient.get<MindmapMaterial[]>(`/courses/${courseId}/mindmap/materials`),
  generate: (courseId: string, materialId: string, force = false) =>
    apiClient.post<MindmapResult>(
      `/courses/${courseId}/materials/${materialId}/mindmap${force ? '?force=true' : ''}`,
    ),
  get: (courseId: string, materialId: string) =>
    apiClient.get<MindmapResult>(`/courses/${courseId}/materials/${materialId}/mindmap`),
};

export interface AskStreamHandlers {
  onCitations?: (citations: AiMessage['citations']) => void;
  onToken?: (text: string) => void;
  onDone?: (info: { length: number }) => void;
  onError?: (msg: string) => void;
}

export async function streamAsk(
  conversationId: string,
  query: string,
  handlers: AskStreamHandlers,
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
    body: JSON.stringify({ query }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    handlers.onError?.(text || `HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
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
        else if (event === 'done') handlers.onDone?.(payload);
        else if (event === 'error') handlers.onError?.(payload.message);
      } catch {
        // ignore malformed events
      }
    }
  }
}
