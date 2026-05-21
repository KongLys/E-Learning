'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function InstructorQuestionsPage() {
  const qc = useQueryClient();
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['instructor-questions-all'],
    queryFn: () => instructorApi.getInbox('all', 'pending'),
  });

  const questions: any[] = data?.data ?? [];

  const replyMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      instructorApi.replyQuestion(id, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-questions-all'] });
      setReplyingId(null);
      setReplyContent('');
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => instructorApi.closeQuestion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructor-questions-all'] }),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Câu hỏi cần trả lời</h1>

      {questions.length === 0 ? (
        <div className="text-center py-16 text-gray-500">Không có câu hỏi nào đang chờ</div>
      ) : (
        <div className="space-y-4">
          {questions.map((q: any) => (
            <div key={q.id} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-400 mb-1">
                    {q.student?.fullName} · {q.lesson?.title}
                    {q.positionValue > 0 && ` · tại ${q.positionValue}s`}
                  </p>
                  <p className="text-sm font-medium">{q.content}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${q.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                  {q.status}
                </span>
              </div>

              {replyingId === q.id ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Nhập câu trả lời..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => replyMutation.mutate({ id: q.id, content: replyContent })}
                      disabled={!replyContent.trim()}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded disabled:opacity-50"
                    >
                      Gửi trả lời
                    </button>
                    <button onClick={() => setReplyingId(null)} className="text-xs border px-3 py-1.5 rounded">Hủy</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => { setReplyingId(q.id); setReplyContent(''); }} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded">Trả lời</button>
                  <button onClick={() => closeMutation.mutate(q.id)} className="text-xs border px-3 py-1.5 rounded text-gray-500">Đóng</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
