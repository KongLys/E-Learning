'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Network } from 'lucide-react';
import {
  aiChatApi,
  mindmapApi,
  streamAsk,
  type AiConversation,
  type AiMessage,
  type AskScope,
} from '@/lib/api/ai.api';
import { learnApi } from '@/lib/api/learn.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { MindMapViewer } from '@/components/learn/MindMapViewer';

type Citation = NonNullable<AiMessage['citations']>[number];

interface SectionWithLessons {
  id: string;
  title: string;
  lessons?: { id: string; title: string }[];
}

interface PendingMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

export default function CourseAiChatPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'chat' | 'mindmap'>('chat');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [streamError, setStreamError] = useState('');
  // Phạm vi truy vấn: '' = cả khóa, 's:{sectionId}' = theo Phần, 'l:{lessonId}' = theo Bài
  const [scopeKey, setScopeKey] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

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
    queryFn: async () =>
      activeId ? (await aiChatApi.getMessages(activeId)).data : [],
    enabled: !!activeId,
  });

  const createConv = useMutation({
    mutationFn: () => aiChatApi.createConversation(courseId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', courseId] });
      setActiveId(res.data.id);
      setPending([]);
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex gap-1 border-b bg-white px-3 pt-2">
        <button
          onClick={() => setTab('chat')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
            tab === 'chat'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> Hỏi AI
        </button>
        <button
          onClick={() => setTab('mindmap')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
            tab === 'mindmap'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Network className="w-4 h-4" /> Sơ đồ tư duy
        </button>
      </div>

      {tab === 'mindmap' ? (
        <MindMapTab courseId={courseId} />
      ) : (
    <div className="flex flex-1 min-h-0">
      <aside className="w-64 border-r bg-gray-50 flex flex-col">
        <div className="p-3 border-b">
          <button
            onClick={() => createConv.mutate()}
            className="w-full bg-blue-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-blue-700"
          >
            + Hội thoại mới
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversationsQuery.isLoading && <LoadingSpinner />}
          {(conversationsQuery.data ?? []).map((c: AiConversation) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveId(c.id);
                setPending([]);
              }}
              className={`w-full text-left text-sm px-3 py-2 rounded-lg truncate ${
                activeId === c.id ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
              }`}
            >
              {c.title || 'Hội thoại mới'}
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <div className="p-4 border-b">
          <h1 className="font-semibold">Hỏi AI về khóa học</h1>
          <p className="text-xs text-gray-500">
            Trợ lý AI trả lời dựa trên nội dung và tài liệu của các bài học (RAG)
          </p>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !streaming && (
            <p className="text-center text-gray-500 text-sm italic mt-12">
              Đặt câu hỏi đầu tiên để bắt đầu hội thoại với AI
            </p>
          )}
          {messages.map((m, idx) => (
            <MessageBubble key={'id' in m ? m.id : `pending-${idx}`} m={m} />
          ))}
          {streamError && <ErrorMessage message={streamError} />}
        </div>

        <div className="border-t p-4 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 shrink-0">Phạm vi:</label>
            <select
              value={scopeKey}
              onChange={(e) => setScopeKey(e.target.value)}
              disabled={streaming}
              className="border rounded-lg px-2 py-1.5 text-xs max-w-xs truncate focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Cả khóa học</option>
              {(sectionsQuery.data ?? []).map((s) => (
                <optgroup key={s.id} label={s.title}>
                  <option value={`s:${s.id}`}>Phần: {s.title}</option>
                  {(s.lessons ?? []).map((l) => (
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
              className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAsk}
              disabled={streaming || !input.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {streaming ? 'Đang trả lời…' : 'Gửi'}
            </button>
          </div>
        </div>
      </main>
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
        className={`max-w-2xl rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
          isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {m.content || (isUser ? '' : '…')}
        {!isUser && m.citations && m.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-300 space-y-1">
            <p className="text-xs font-medium text-gray-600">Nguồn:</p>
            {m.citations.map((c, i) => (
              <div key={c.chunkId} className="text-xs text-gray-700">
                [Đoạn {c.index ?? i + 1}]{' '}
                <span className="font-medium">
                  {c.sectionTitle || 'Không rõ phần'}
                </span>
                {c.pageNumber ? <span> · trang {c.pageNumber}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MindMapTab({ courseId }: { courseId: string }) {
  const [triggered, setTriggered] = useState(false);

  const mindmapQuery = useQuery({
    queryKey: ['mindmap', courseId],
    queryFn: async () => (await mindmapApi.get(courseId)).data,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s === 'generating') return 2000;
      if (s === 'pending' && triggered) return 2000;
      return false;
    },
  });

  const status = mindmapQuery.data?.status;
  useEffect(() => {
    if (status === 'ready' || status === 'failed') setTriggered(false);
  }, [status]);

  const generate = useMutation({
    mutationFn: (force: boolean) => mindmapApi.generate(courseId, force),
    onSuccess: () => {
      setTriggered(true);
      mindmapQuery.refetch();
    },
  });

  if (mindmapQuery.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const busy = status === 'generating' || (status === 'pending' && triggered) || generate.isPending;
  const ready = status === 'ready';

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-gray-600">
          Sơ đồ tư duy toàn khóa: Khóa học → Phần → Bài → đề mục nội dung.
        </p>
        <button
          onClick={() => generate.mutate(ready)}
          disabled={busy}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Đang tạo…' : ready ? 'Tạo lại' : 'Tạo sơ đồ tư duy'}
        </button>
        {ready && mindmapQuery.data?.updatedAt && (
          <span className="text-xs text-gray-400">
            Cập nhật: {new Date(mindmapQuery.data.updatedAt).toLocaleString('vi-VN')}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {busy ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500">
            <LoadingSpinner />
            <p className="text-sm">Đang phân tích nội dung bài học và tạo sơ đồ tư duy…</p>
          </div>
        ) : status === 'failed' ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <ErrorMessage
              message={mindmapQuery.data?.errorMsg || 'Tạo sơ đồ tư duy thất bại'}
            />
            <button
              onClick={() => generate.mutate(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              Thử lại
            </button>
          </div>
        ) : ready && mindmapQuery.data?.markmap ? (
          <MindMapViewer
            markmap={mindmapQuery.data.markmap}
            title={mindmapQuery.data.title}
            structure={mindmapQuery.data.structure}
          />
        ) : (
          <div className="h-full flex items-center justify-center p-8">
            <p className="text-center text-gray-500 text-sm">
              Bấm <span className="font-medium">“Tạo sơ đồ tư duy”</span> để dựng sơ đồ từ nội dung
              các bài học trong khóa.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
