'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { notify } from '@/store/dialog.store';
import { getApiErrorMessage } from '@/lib/api/error';
import type { CourseSummary } from '@/types/course';

interface QaReply {
  id: string;
  content: string;
}

interface QaQuestion {
  id: string;
  content: string;
  status: string;
  createdAt: string;
  student?: { fullName?: string } | null;
  replies?: QaReply[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ trả lời',
  answered: 'Đã trả lời',
  closed: 'Đã đóng',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-sun-soft text-sun-deep',
  answered: 'bg-leaf-soft text-leaf-deep',
  closed: 'bg-surface-strong text-ink-mute',
};

export default function QaPage() {
  const qc = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});

  const { data: coursesData } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.getCourses(),
  });
  const courses: CourseSummary[] = coursesData?.data?.courses ?? coursesData?.data ?? [];

  const { data: inboxData, isLoading } = useQuery({
    queryKey: ['instructor-qa', selectedCourseId, statusFilter],
    queryFn: () => instructorApi.getInbox(selectedCourseId, statusFilter || undefined),
    enabled: !!selectedCourseId,
  });
  const questions: QaQuestion[] = inboxData?.data?.questions ?? inboxData?.data ?? [];

  const replyMutation = useMutation({
    mutationFn: ({ qId, content }: { qId: string; content: string }) =>
      instructorApi.replyQuestion(qId, content),
    onSuccess: (_, { qId }) => {
      qc.invalidateQueries({ queryKey: ['instructor-qa'] });
      setReplyMap((prev) => ({ ...prev, [qId]: '' }));
    },
    onError: (err) => notify.error(getApiErrorMessage(err, 'Lỗi gửi trả lời')),
  });

  const closeMutation = useMutation({
    mutationFn: (qId: string) => instructorApi.closeQuestion(qId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructor-qa'] }),
  });

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">Hỏi đáp</h1>
        <p className="text-sm text-muted">Câu hỏi của học viên từ các khóa học</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          className="flex-1 border border-hairline-strong rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Chọn khóa học</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-hairline-strong rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ trả lời</option>
          <option value="answered">Đã trả lời</option>
          <option value="closed">Đã đóng</option>
        </select>
      </div>

      {!selectedCourseId ? (
        <div className="text-center py-16 text-muted text-sm">Chọn khóa học để xem câu hỏi</div>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : questions.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">Không có câu hỏi nào</div>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="bg-surface-card rounded-card border border-hairline p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">{q.content}</p>
                  <p className="text-xs text-ink-subtle mt-1">
                    {q.student?.fullName ?? 'Học viên'} ·{' '}
                    {new Date(q.createdAt).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[q.status] ?? ''}`}>
                  {STATUS_LABELS[q.status] ?? q.status}
                </span>
              </div>

              {(q.replies?.length ?? 0) > 0 && (
                <div className="mt-3 pt-3 border-t border-hairline space-y-2">
                  {q.replies?.map((r) => (
                    <div key={r.id} className="flex gap-2 text-sm">
                      <span className="text-ink-subtle shrink-0">↳</span>
                      <p className="text-ink-mute">{r.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {q.status !== 'closed' && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={replyMap[q.id] ?? ''}
                    onChange={(e) => setReplyMap((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const content = replyMap[q.id]?.trim();
                        if (content) replyMutation.mutate({ qId: q.id, content });
                      }
                    }}
                    placeholder="Nhập câu trả lời..."
                    className="flex-1 border border-hairline-strong rounded-lg px-3 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => {
                      const content = replyMap[q.id]?.trim();
                      if (content) replyMutation.mutate({ qId: q.id, content });
                    }}
                    disabled={!replyMap[q.id]?.trim() || replyMutation.isPending}
                    className="px-3 py-1.5 bg-sky text-white rounded-lg text-sm font-medium hover:bg-sky-deep disabled:opacity-50"
                  >
                    Gửi
                  </button>
                  <button
                    onClick={() => closeMutation.mutate(q.id)}
                    disabled={closeMutation.isPending}
                    className="px-3 py-1.5 border border-hairline-strong rounded-lg text-sm text-ink-mute hover:bg-canvas-soft disabled:opacity-50"
                  >
                    Đóng
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
