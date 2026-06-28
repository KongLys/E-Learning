'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MessageSquare, Network } from 'lucide-react';
import { mindmapApi } from '@/lib/api/ai.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { MindMapViewer } from '@/components/learn/MindMapViewer';
import { AiChatPanel } from '@/components/learn/AiChatPanel';

export default function CourseAiChatPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'chat' | 'mindmap'>(
    searchParams.get('tab') === 'mindmap' ? 'mindmap' : 'chat',
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex gap-1 border-b border-hairline bg-surface-card px-3 pt-2">
        <button
          onClick={() => setTab('chat')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${tab === 'chat'
            ? 'border-sky-deep text-sky-deep'
            : 'border-transparent text-muted hover:text-ink'
            }`}
        >
          <MessageSquare className="w-4 h-4" /> Hỏi AI
        </button>
        <button
          onClick={() => setTab('mindmap')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${tab === 'mindmap'
            ? 'border-sky-deep text-sky-deep'
            : 'border-transparent text-muted hover:text-ink'
            }`}
        >
          <Network className="w-4 h-4" /> Sơ đồ tư duy
        </button>
      </div>

      {tab === 'mindmap' ? (
        <MindMapTab courseId={courseId} />
      ) : (
        <div className="flex-1 min-h-0">
          <AiChatPanel courseId={courseId} />
        </div>
      )}
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
  // Tắt cờ triggered khi sinh mindmap xong (set-state-during-render thay cho useEffect).
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status === 'ready' || status === 'failed') setTriggered(false);
  }

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
        <p className="text-sm text-muted">
          Sơ đồ tư duy toàn khóa
        </p>
        <button
          onClick={() => generate.mutate(ready)}
          disabled={busy}
          className="bg-sky text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-sky-deep disabled:opacity-50"
        >
          {busy ? 'Đang tạo…' : ready ? 'Tạo lại' : 'Tạo sơ đồ tư duy'}
        </button>
        {ready && mindmapQuery.data?.updatedAt && (
          <span className="text-xs text-ink-subtle">
            Cập nhật: {new Date(mindmapQuery.data.updatedAt).toLocaleString('vi-VN')}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {busy ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted">
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
              className="text-sm text-sky hover:underline"
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
            <p className="text-center text-muted text-sm">
              Bấm <span className="font-medium">&quot;Tạo sơ đồ tư duy&quot;</span> để dựng sơ đồ từ nội dung
              các bài học trong khóa.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
