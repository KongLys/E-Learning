'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aiChatApi,
  streamAsk,
  type AiConversation,
  type AiMessage,
} from '@/lib/api/ai.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';

type Citation = NonNullable<AiMessage['citations']>[number];

interface PendingMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

export default function CourseAiChatPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [streamError, setStreamError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationsQuery = useQuery({
    queryKey: ['ai-conversations', courseId],
    queryFn: async () => (await aiChatApi.listConversations(courseId)).data,
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

    await streamAsk(convId, q, {
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
    });

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
    <div className="flex h-[calc(100vh-4rem)]">
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
            Trợ lý AI trả lời dựa trên tài liệu khóa học (RAG)
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

        <div className="border-t p-4">
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
