'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, FileText, Headphones, History, Loader2, Mic, Plus, RotateCw, Sparkles, X } from 'lucide-react';
import {
  aiChatApi,
  myReviewQuizApi,
  streamAsk,
  type AiConversation,
  type AiMessage,
  type AskScope,
  type CreatedQuizInfo,
} from '@/lib/api/ai.api';
import { learnApi } from '@/lib/api/learn.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { useAiChatBridge } from '@/store/ai-chat-bridge.store';

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
  /** Tiêu đề bài hiện tại — để mở podcast ở cột nội dung. */
  currentLessonTitle?: string;
  /** Truyền vào khi dùng như panel để hiện nút đóng. */
  onClose?: () => void;
  /** Mở quiz ở cột nội dung bài học (thay vì modal nội bộ). */
  onOpenQuiz?: (quiz: any, kind: 'review' | 'ai') => void;
  /** Mở/nghe podcast ở cột nội dung bài học. */
  onOpenPodcast?: (lessonId: string, lessonTitle: string) => void;
}

export function AiChatPanel({
  courseId,
  currentLessonId,
  currentLessonType,
  currentLessonTitle,
  onClose,
  onOpenQuiz,
  onOpenPodcast,
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
  // Quiz vừa được tạo qua chat (banner mời làm bài).
  const [createdQuiz, setCreatedQuiz] = useState<CreatedQuizInfo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const openQuizMut = useMutation({
    mutationFn: (id: string) => myReviewQuizApi.get(id),
    onSuccess: (res) => onOpenQuiz?.(res.data, 'ai'),
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
  // Kiểm tra bài này đã có quiz ôn tập chưa (null = chưa tạo).
  const reviewQuizQuery = useQuery({
    queryKey: ['review-quiz', currentLessonId],
    queryFn: async () => (await learnApi.getReviewQuiz(currentLessonId!)).data ?? null,
    enabled: !!currentLessonId && currentLessonType !== 'quiz',
  });
  const hasReviewQuiz = !!reviewQuizQuery.data;

  // Đã có sẵn → mở thẳng quiz đó, KHÔNG tạo lại.
  const openExistingReviewQuiz = () => {
    if (reviewQuizQuery.data) onOpenQuiz?.(reviewQuizQuery.data, 'review');
  };

  // Tạo mới, hoặc tạo lại (đè lên nội dung cũ khi bài học đã cập nhật) rồi mở.
  const generateReviewQuiz = useMutation({
    mutationFn: async () => {
      // POST chỉ trả { count }; fetch lại quiz đầy đủ (đã ẩn đáp án) để mở.
      await learnApi.generateReviewQuiz(currentLessonId!);
      const res = await learnApi.getReviewQuiz(currentLessonId!);
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['review-quiz', currentLessonId] });
      qc.invalidateQueries({ queryKey: ['review-quizzes', courseId] });
      onOpenQuiz?.(data, 'review');
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
  // Hộp xác nhận trước khi tạo lại (podcast cũ vẫn dùng được — chỉ nên tạo lại khi nội dung bài đã đổi).
  const [confirmRegen, setConfirmRegen] = useState(false);
  const generatePodcast = useMutation({
    mutationFn: () => learnApi.generatePodcast(currentLessonId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['podcast', currentLessonId] });
      qc.invalidateQueries({ queryKey: ['podcasts', courseId] });
    },
  });

  useEffect(() => {
    if (!activeId && (conversationsQuery.data?.length ?? 0) > 0) {
      setActiveId(conversationsQuery.data![0].id);
    }
  }, [activeId, conversationsQuery.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [pending, messagesQuery.data]);

  const handleAsk = async (override?: { query?: string; scope?: AskScope }) => {
    const q = (override?.query ?? input).trim();
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

    const scope: AskScope | undefined =
      override?.scope ??
      (scopeKey.startsWith('s:')
        ? { sectionId: scopeKey.slice(2) }
        : scopeKey.startsWith('l:')
          ? { lessonId: scopeKey.slice(2) }
          : undefined);

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
          qc.invalidateQueries({ queryKey: ['my-review-quizzes', courseId] });
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

  // Tiêu thụ prompt được bơm từ ngoài (vd: nút "Vì sao đúng/sai?" trong quiz).
  const pendingAsk = useAiChatBridge((s) => s.pending);
  const consumeAsk = useAiChatBridge((s) => s.consume);
  useEffect(() => {
    if (!pendingAsk || streaming) return;
    const p = consumeAsk();
    if (!p) return;
    if (p.scope?.lessonId) setScopeKey(`l:${p.scope.lessonId}`);
    else if (p.scope?.sectionId) setScopeKey(`s:${p.scope.sectionId}`);
    void handleAsk({ query: p.text, scope: p.scope });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk, streaming]);

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
          <Sparkles size={16} className="text-purple-600" /> Hỏi AI
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
            <span className="flex flex-1 items-center gap-1 truncate text-purple-800">
              <CheckCircle2 size={14} className="shrink-0" /> Đã tạo quiz “{createdQuiz.title}” ({createdQuiz.questionCount} câu)
            </span>
            <button
              onClick={() => openQuizMut.mutate(createdQuiz.id)}
              disabled={openQuizMut.isPending}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {openQuizMut.isPending ? 'Đang mở…' : <><FileText size={13} /> Làm bài ôn tập</>}
            </button>
            <button
              onClick={() => setCreatedQuiz(null)}
              className="shrink-0 text-purple-400 hover:text-purple-600"
              aria-label="Đóng"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Hành động theo bài: tạo quiz / podcast */}
        {showActions && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {showQuizBtn && (
                reviewQuizQuery.isLoading ? (
                  <span className="text-xs text-gray-400">Đang kiểm tra quiz ôn tập…</span>
                ) : hasReviewQuiz ? (
                  <SplitActionButton
                    mainIcon={<FileText size={13} />}
                    mainLabel="Làm quiz ôn tập"
                    onMain={openExistingReviewQuiz}
                    regenIcon={<RotateCw size={13} />}
                    regenLabel="Tạo lại quiz"
                    regenTitle="Tạo lại quiz, đè lên nội dung cũ (dùng khi bài học đã cập nhật)"
                    onRegen={() => generateReviewQuiz.mutate()}
                    pending={generateReviewQuiz.isPending}
                    pendingLabel="Đang tạo lại quiz…"
                  />
                ) : (
                  <button
                    onClick={() => generateReviewQuiz.mutate()}
                    disabled={generateReviewQuiz.isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                  >
                    {generateReviewQuiz.isPending ? <><Loader2 size={13} className="animate-spin" /> Đang tạo quiz…</> : <><Sparkles size={13} /> Tạo quiz ôn tập</>}
                  </button>
                )
              )}
              {podcastEnabled && (
                podcast?.status === 'pending' || podcast?.status === 'processing' ? (
                  <button
                    disabled
                    className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    <Loader2 size={13} className="animate-spin" /> Đang tạo podcast…
                  </button>
                ) : podcast?.status === 'ready' ? (
                  <SplitActionButton
                    mainIcon={<Headphones size={13} />}
                    mainLabel="Nghe podcast"
                    onMain={() => onOpenPodcast?.(currentLessonId!, currentLessonTitle ?? 'Podcast')}
                    regenIcon={<RotateCw size={13} />}
                    regenLabel="Tạo lại podcast"
                    regenTitle="Tạo lại podcast, đè lên bản cũ (dùng khi bài học đã cập nhật)"
                    onRegen={() => setConfirmRegen(true)}
                  />
                ) : (
                  <button
                    onClick={() => generatePodcast.mutate()}
                    disabled={generatePodcast.isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                  >
                    <Mic size={13} /> Tạo podcast
                  </button>
                )
              )}
            </div>
            {generateReviewQuiz.isError && (
              <p className="text-xs text-red-600">
                {(generateReviewQuiz.error as any)?.response?.data?.message ??
                  'Không tạo được quiz ôn tập, vui lòng thử lại.'}
              </p>
            )}
            {podcastEnabled && podcast?.status === 'failed' && (
              <p className="text-xs text-red-600">
                {podcast.errorMsg ?? 'Không tạo được podcast, vui lòng thử lại.'}
              </p>
            )}
          </div>
        )}

        {/* Xác nhận tạo lại podcast (ghi đè bản hiện tại). */}
        {confirmRegen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setConfirmRegen(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-gray-900">Tạo lại podcast?</h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Bài học đã có podcast. Chỉ nên tạo lại nếu nội dung bài đã thay đổi — podcast hiện tại sẽ
                bị thay thế.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmRegen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  onClick={() => {
                    generatePodcast.mutate();
                    setConfirmRegen(false);
                  }}
                  className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
                >
                  Tạo lại
                </button>
              </div>
            </div>
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
            onClick={() => handleAsk()}
            disabled={streaming || !input.trim()}
            className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {streaming ? '…' : 'Gửi'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Nút hành động dạng "split": nút chính + mũi tên đổ xuống mở menu "Tạo lại".
 * Khi đang tạo lại, nút thu gọn thành trạng thái chờ (spinner + nhãn).
 */
function SplitActionButton({
  mainIcon,
  mainLabel,
  onMain,
  regenIcon,
  regenLabel,
  regenTitle,
  onRegen,
  pending = false,
  pendingLabel,
}: {
  mainIcon: ReactNode;
  mainLabel: string;
  onMain: () => void;
  regenIcon: ReactNode;
  regenLabel: string;
  regenTitle?: string;
  onRegen: () => void;
  pending?: boolean;
  pendingLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  if (pending) {
    return (
      <button
        disabled
        className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      >
        <Loader2 size={13} className="animate-spin" /> {pendingLabel ?? 'Đang xử lý…'}
      </button>
    );
  }

  return (
    <div className="relative inline-flex">
      <button
        onClick={onMain}
        className="inline-flex items-center gap-1 rounded-l-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
      >
        {mainIcon} {mainLabel}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Tùy chọn khác"
        aria-label="Tùy chọn khác"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center rounded-r-lg border-l border-purple-500 bg-purple-600 px-1.5 py-1.5 text-white hover:bg-purple-700"
      >
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border bg-white p-1 shadow-lg">
            <button
              onClick={() => {
                setOpen(false);
                onRegen();
              }}
              title={regenTitle}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              {regenIcon} {regenLabel}
            </button>
          </div>
        </>
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
