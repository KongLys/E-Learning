'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Plus, X } from 'lucide-react';
import {
  aiChatApi,
  aiQuizApi,
  streamAsk,
  type AiConversation,
  type AiMessage,
  type AskScope,
  type CreatedQuizInfo,
} from '@/lib/api/ai.api';
import { learnApi } from '@/lib/api/learn.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { ReviewQuizUI } from '@/components/learn/ReviewQuizUI';

type Citation = NonNullable<AiMessage['citations']>[number];

interface SectionWithLessons {
  id: string;
  title: string;
  lessons?: { id: string; title: string; type: 'video' | 'document' | 'quiz' }[];
}

interface PendingMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

interface AiChatPanelProps {
  courseId: string;
  /** Có => bật nút Quiz/Podcast theo bài và đặt phạm vi mặc định theo bài. */
  currentLessonId?: string;
  currentLessonType?: 'video' | 'document' | 'quiz';
  /** Truyền vào khi dùng như panel để hiện nút đóng. */
  onClose?: () => void;
}

export function AiChatPanel({
  courseId,
  currentLessonId,
  currentLessonType,
  onClose,
}: AiChatPanelProps) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [streamError, setStreamError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  // Phạm vi truy vấn: '' = cả khóa, 's:{sectionId}' = theo Phần, 'l:{lessonId}' = theo Bài
  const [scopeKey, setScopeKey] = useState(currentLessonId ? `l:${currentLessonId}` : '');
  // Quiz vừa được tạo qua chat + quiz đang mở trong modal.
  // `openQuizKind` quyết định endpoint nộp bài: 'review' theo bài, 'ai' theo quiz cá nhân.
  const [createdQuiz, setCreatedQuiz] = useState<CreatedQuizInfo | null>(null);
  const [openQuiz, setOpenQuiz] = useState<any>(null);
  const [openQuizKind, setOpenQuizKind] = useState<'review' | 'ai'>('ai');
  const scrollRef = useRef<HTMLDivElement>(null);

  const openQuizMut = useMutation({
    mutationFn: (id: string) => aiQuizApi.get(id),
    onSuccess: (res) => {
      setOpenQuizKind('ai');
      setOpenQuiz(res.data);
    },
  });

  const conversationsQuery = useQuery({
    queryKey: ['ai-conversations', courseId],
    queryFn: async () => (await aiChatApi.listConversations(courseId)).data,
  });

  const sectionsQuery = useQuery({
    queryKey: ['course-sections', courseId],
    queryFn: async () => (await learnApi.getCourseSections(courseId)).data as SectionWithLessons[],
  });

  const messagesQuery = useQuery({
    queryKey: ['ai-messages', activeId],
    queryFn: async () => (activeId ? (await aiChatApi.getMessages(activeId)).data : []),
    enabled: !!activeId,
  });

  const createConv = useMutation({
    mutationFn: () => aiChatApi.createConversation(courseId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', courseId] });
      setActiveId(res.data.id);
      setPending([]);
      setHistoryOpen(false);
    },
  });

  // ----- Quiz ôn tập (AI) cho bài hiện tại -----
  const reviewQuizModal = useMutation({
    mutationFn: async () => {
      const res = await learnApi.generateReviewQuiz(currentLessonId!);
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['review-quiz', currentLessonId] });
      setOpenQuizKind('review');
      setOpenQuiz(data);
    },
  });

  // ----- Podcast (AI) cho bài tài liệu hiện tại -----
  const podcastEnabled = !!currentLessonId && currentLessonType === 'document';
  const podcastQuery = useQuery({
    queryKey: ['podcast', currentLessonId],
    queryFn: () => learnApi.getPodcast(currentLessonId!),
    enabled: podcastEnabled,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.data?.status;
      return s === 'pending' || s === 'processing' ? 5000 : false;
    },
  });
  const podcast = podcastQuery.data?.data ?? null;
  const generatePodcast = useMutation({
    mutationFn: () => learnApi.generatePodcast(currentLessonId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['podcast', currentLessonId] }),
  });

  useEffect(() => {
    if (!activeId && (conversationsQuery.data?.length ?? 0) > 0) {
      setActiveId(conversationsQuery.data![0].id);
    }
  }, [activeId, conversationsQuery.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [pending, messagesQuery.data]);

  const handleAsk = async () => {
    const q = input.trim();
    if (!q || streaming) return;
    let convId = activeId;
    if (!convId) {
      const res = await aiChatApi.createConversation(courseId, q.slice(0, 50));
      convId = res.data.id;
      setActiveId(convId);
      qc.invalidateQueries({ queryKey: ['ai-conversations', courseId] });
    }

    setInput('');
    setStreamError('');
    setStreaming(true);
    setPending([
      { role: 'user', content: q },
      { role: 'assistant', content: '' },
    ]);

    let buffer = '';
    let citations: Citation[] = [];

    const scope: AskScope | undefined = scopeKey.startsWith('s:')
      ? { sectionId: scopeKey.slice(2) }
      : scopeKey.startsWith('l:')
        ? { lessonId: scopeKey.slice(2) }
        : undefined;

    await streamAsk(
      convId,
      q,
      {
        onCitations: (cs) => {
          citations = (cs ?? []) as Citation[];
          setPending((p) =>
            p.map((m, i) => (i === p.length - 1 ? { ...m, citations } : m)),
          );
        },
        onToken: (text) => {
          buffer += text;
          setPending((p) =>
            p.map((m, i) =>
              i === p.length - 1 ? { ...m, content: buffer, citations } : m,
            ),
          );
        },
        onQuiz: (quiz) => {
          setCreatedQuiz(quiz);
          qc.invalidateQueries({ queryKey: ['ai-quizzes', courseId] });
        },
        onError: (msg) => setStreamError(msg),
      },
      scope,
    );

    setStreaming(false);
    setPending([]);
    qc.invalidateQueries({ queryKey: ['ai-messages', convId] });
    qc.invalidateQueries({ queryKey: ['ai-conversations', courseId] });
  };

  const messages: (AiMessage | PendingMessage)[] = [
    ...(messagesQuery.data ?? []),
    ...pending,
  ];

  const showActions = !!currentLessonId;
  const showQuizBtn = showActions && currentLessonType !== 'quiz';

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Header */}
      <div className="relative flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <span className="text-purple-600">✦</span> Hỏi AI
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => createConv.mutate()}
            title="Hội thoại mới"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            <Plus className="h-4 w-4" /> Mới
          </button>
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            title="Lịch sử hội thoại"
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-gray-100 ${
              historyOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-600'
            }`}
          >
            <History className="h-4 w-4" /> Lịch sử
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Đóng"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Đóng khung chat"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Dropdown lịch sử hội thoại */}
        {historyOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setHistoryOpen(false)} />
            <div className="absolute right-2 top-full z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border bg-white p-2 shadow-lg">
              <p className="px-2 py-1 text-xs font-medium text-gray-400">
                Hội thoại trong khóa học
              </p>
              {conversationsQuery.isLoading && (
                <div className="py-4">
                  <LoadingSpinner />
                </div>
              )}
              {!conversationsQuery.isLoading && (conversationsQuery.data?.length ?? 0) === 0 && (
                <p className="px-2 py-3 text-center text-xs text-gray-400">Chưa có hội thoại nào</p>
              )}
              {(conversationsQuery.data ?? []).map((c: AiConversation) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveId(c.id);
                    setPending([]);
                    setHistoryOpen(false);
                  }}
                  className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
                    activeId === c.id ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                  }`}
                >
                  {c.title || 'Hội thoại mới'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Tin nhắn — chỉ vùng này cuộn; cuộn ở đây thì lịch sử đoạn chat di chuyển */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        {messages.length === 0 && !streaming && (
          <p className="mt-12 text-center text-sm italic text-gray-500">
            Đặt câu hỏi đầu tiên để bắt đầu hội thoại với AI
          </p>
        )}
        {messages.map((m, idx) => (
          <MessageBubble key={'id' in m ? m.id : `pending-${idx}`} m={m} />
        ))}
        {streamError && <ErrorMessage message={streamError} />}
      </div>

      {/* Khu nhập liệu */}
      <div className="shrink-0 space-y-2 border-t p-3">
        {createdQuiz && (
          <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm">
            <span className="flex-1 truncate text-purple-800">
              ✅ Đã tạo quiz “{createdQuiz.title}” ({createdQuiz.questionCount} câu)
            </span>
            <button
              onClick={() => openQuizMut.mutate(createdQuiz.id)}
              disabled={openQuizMut.isPending}
              className="shrink-0 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {openQuizMut.isPending ? 'Đang mở…' : '📝 Làm bài ôn tập'}
            </button>
            <button
              onClick={() => setCreatedQuiz(null)}
              className="shrink-0 text-purple-400 hover:text-purple-600"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>
        )}

        {/* Hành động theo bài: tạo quiz / podcast */}
        {showActions && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {showQuizBtn && (
                <button
                  onClick={() => reviewQuizModal.mutate()}
                  disabled={reviewQuizModal.isPending}
                  className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                >
                  {reviewQuizModal.isPending ? '⏳ Đang tạo quiz…' : '✦ Tạo quiz ôn tập'}
                </button>
              )}
              {podcastEnabled && (
                <button
                  onClick={() => generatePodcast.mutate()}
                  disabled={
                    generatePodcast.isPending ||
                    podcast?.status === 'pending' ||
                    podcast?.status === 'processing'
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                >
                  {podcast?.status === 'pending' || podcast?.status === 'processing'
                    ? '⏳ Đang tạo podcast…'
                    : podcast?.status === 'ready'
                      ? '🎙 Tạo lại podcast'
                      : '🎙 Tạo podcast'}
                </button>
              )}
            </div>
            {reviewQuizModal.isError && (
              <p className="text-xs text-red-600">
                {(reviewQuizModal.error as any)?.response?.data?.message ??
                  'Không tạo được quiz ôn tập, vui lòng thử lại.'}
              </p>
            )}
            {podcastEnabled && podcast?.status === 'ready' && podcast.audioUrl && (
              <audio controls preload="none" src={podcast.audioUrl} className="w-full">
                Trình duyệt của bạn không hỗ trợ phát audio.
              </audio>
            )}
            {podcastEnabled && podcast?.status === 'failed' && (
              <p className="text-xs text-red-600">
                {podcast.errorMsg ?? 'Không tạo được podcast, vui lòng thử lại.'}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="shrink-0 text-xs text-gray-500">Phạm vi:</label>
          <select
            value={scopeKey}
            onChange={(e) => setScopeKey(e.target.value)}
            disabled={streaming}
            className="max-w-full flex-1 truncate rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Cả khóa học</option>
            {(sectionsQuery.data ?? []).map((s) => (
              <optgroup key={s.id} label={s.title}>
                <option value={`s:${s.id}`}>Phần: {s.title}</option>
                {/* Bỏ qua bài quiz/kiểm tra: AI không truy cập nội dung bài kiểm tra */}
                {(s.lessons ?? [])
                  .filter((l) => l.type !== 'quiz')
                  .map((l) => (
                    <option key={l.id} value={`l:${l.id}`}>
                      Bài: {l.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAsk();
              }
            }}
            placeholder="Hỏi điều gì đó về khóa học…"
            rows={2}
            disabled={streaming}
            className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAsk}
            disabled={streaming || !input.trim()}
            className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {streaming ? '…' : 'Gửi'}
          </button>
        </div>
      </div>

      {/* Modal làm quiz */}
      {openQuiz && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpenQuiz(null)}
        >
          <div
            className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold truncate">{openQuiz.title || 'Quiz ôn tập'}</h2>
              <button
                onClick={() => setOpenQuiz(null)}
                className="text-xl text-gray-400 hover:text-gray-700 shrink-0"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-5">
              <ReviewQuizUI
                quiz={openQuiz}
                submit={(ans) =>
                  openQuizKind === 'review'
                    ? learnApi.submitReviewQuiz(currentLessonId!, ans)
                    : aiQuizApi.submit(openQuiz.id, ans)
                }
                onClose={() => setOpenQuiz(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: AiMessage | PendingMessage }) {
  const isUser = m.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-2xl whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
          isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {isUser
          ? m.content
          : m.content
            ? renderWithCitations(m.content, m.citations ?? [])
            : '…'}
      </div>
    </div>
  );
}

/**
 * Thay các đánh dấu [Đoạn N] trong câu trả lời bằng tham chiếu nội dòng; rê chuột
 * vào để đọc đoạn trích nguồn (excerpt) kèm phần/ trang tương ứng.
 */
function renderWithCitations(content: string, citations: Citation[]) {
  const re = /\[Đoạn\s*(\d+(?:\s*,\s*\d+)*)\]/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(content)) !== null) {
    if (match.index > last) parts.push(content.slice(last, match.index));
    const nums = match[1].split(',').map((n) => parseInt(n.trim(), 10));
    for (const n of nums) {
      parts.push(<CitationRef key={`c-${key++}`} n={n} citation={citations[n - 1]} />);
    }
    last = match.index + match[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts;
}

function CitationRef({ n, citation }: { n: number; citation?: Citation }) {
  // Tooltip định vị theo viewport (position: fixed) để không bị panel cắt mất;
  // luôn bật phía dưới tham chiếu và cho cuộn khi đoạn trích dài.
  const [pos, setPos] = useState<{ x: number; y: number; maxH: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tham chiếu vượt ngoài danh sách nguồn → giữ nguyên dạng văn bản.
  if (!citation) return <span>[Đoạn {n}]</span>;
  const source = citation.sectionTitle || 'Nguồn';

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPos(null), 220);
  };
  const show = (e: React.SyntheticEvent<HTMLElement>) => {
    cancelClose();
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150);
    // Luôn hiện PHÍA DƯỚI tham chiếu; chiều cao tối đa = khoảng trống còn lại
    // bên dưới (trong viewport) để card không tràn ra ngoài và cuộn được.
    const maxH = Math.max(120, window.innerHeight - r.bottom - 12);
    setPos({ x, y: r.bottom + 4, maxH });
  };

  return (
    <>
      <button
        type="button"
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={scheduleClose}
        aria-label={`Nguồn ${n}: ${source}`}
        className="mx-0.5 inline-flex items-center rounded-full bg-blue-100 px-1.5 align-middle text-[10px] font-semibold leading-4 text-blue-700 transition-colors hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {n}
      </button>
      {pos && (
        <span
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onWheel={(e) => e.stopPropagation()}
          style={{ left: pos.x, top: pos.y, maxHeight: pos.maxH }}
          className="pointer-events-auto fixed z-50 block w-72 max-w-[80vw] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-lg bg-gray-900 p-3 text-left text-xs leading-relaxed text-gray-100 shadow-lg"
        >
          <span className="mb-1.5 block font-medium text-blue-200">
            {source}
            {citation.pageNumber ? ` · trang ${citation.pageNumber}` : ''}
          </span>
          <span className="block whitespace-pre-wrap">{citation.excerpt || '—'}</span>
        </span>
      )}
    </>
  );
}
