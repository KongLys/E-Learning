'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';
import { formatSeconds } from './VideoPlayer';

interface QuestionReply {
  id: string;
  content: string;
  author?: { fullName?: string } | null;
}
interface LessonQuestion {
  id: string;
  content: string;
  status: string;
  positionType?: string;
  positionValue?: number;
  replies?: QuestionReply[];
}

interface QuestionsPanelProps {
  lessonId: string;
  positionType: 'video_timestamp' | 'document_page' | 'none';
  getCurrentPosition: () => number;
  onJumpTo?: (position: number) => void;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Chưa trả lời', cls: 'bg-amber-100 text-amber-700' },
  answered: { label: 'Đã trả lời', cls: 'bg-green-100 text-green-700' },
  closed: { label: 'Đã đóng', cls: 'bg-gray-200 text-gray-500' },
};

export function QuestionsPanel({ lessonId, positionType, getCurrentPosition, onJumpTo }: QuestionsPanelProps) {
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [attachTime, setAttachTime] = useState(true);
  const [capturedPos, setCapturedPos] = useState(0);

  const canAttachTime = positionType === 'video_timestamp';

  const { data } = useQuery({
    queryKey: ['questions', lessonId],
    queryFn: () => learnApi.getQuestions(lessonId),
  });
  const questions: LessonQuestion[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => {
      const usePos = canAttachTime && attachTime;
      return learnApi.createQuestion(
        lessonId,
        content,
        usePos ? 'video_timestamp' : 'none',
        usePos ? capturedPos : 0,
        true,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions', lessonId] });
      setContent('');
      setAdding(false);
    },
  });

  const startAdding = () => {
    setCapturedPos(Math.floor(getCurrentPosition()));
    setAttachTime(canAttachTime);
    setAdding(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Hỏi đáp <span className="text-gray-400 font-normal">· {questions.length}</span></h3>
        {!adding && questions.length > 0 && (
          <button onClick={startAdding} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-full font-medium hover:bg-blue-700">
            Đặt câu hỏi
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-2xl bg-blue-50/70 p-4 space-y-3">
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Nhập câu hỏi của bạn về bài học này..."
            rows={3}
            className="w-full text-sm bg-white rounded-xl px-3 py-2.5 resize-none outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
          />
          {canAttachTime && (
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={attachTime}
                onChange={(e) => setAttachTime(e.target.checked)}
                className="accent-blue-600 w-4 h-4"
              />
              Đính kèm thời điểm video
              {attachTime && <span className="inline-flex items-center gap-1 text-blue-700 font-semibold bg-white/70 px-2 py-0.5 rounded-full"><Clock size={12} /> {formatSeconds(capturedPos)}</span>}
            </label>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!content.trim() || createMutation.isPending}
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-full font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'Đang gửi...' : 'Gửi câu hỏi'}
            </button>
            <button onClick={() => setAdding(false)} className="text-sm text-gray-600 px-4 py-1.5 rounded-full hover:bg-gray-100">Hủy</button>
          </div>
        </div>
      )}

      {questions.length === 0 && !adding && (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center">
          <p className="text-base font-semibold text-gray-900 mb-1.5">Chưa có câu hỏi nào</p>
          <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed mb-5">
            Đặt câu hỏi cho giảng viên — bạn cũng sẽ thấy câu hỏi và giải đáp của các học viên khác tại đây.
          </p>
          <button onClick={startAdding} className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-full">
            Đặt câu hỏi đầu tiên
          </button>
        </div>
      )}

      <div className="space-y-3 max-h-112 overflow-y-auto">
        {questions.map((q) => {
          const badge = STATUS_BADGE[q.status] ?? STATUS_BADGE.pending;
          return (
            <div key={q.id} className="rounded-2xl bg-slate-50 p-4 text-sm space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                {q.positionType === 'video_timestamp' && (q.positionValue ?? 0) > 0 && (
                  <button
                    onClick={() => onJumpTo?.(q.positionValue ?? 0)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 px-2.5 py-1 rounded-full"
                  >
                    <Clock size={12} /> {formatSeconds(q.positionValue ?? 0)}
                  </button>
                )}
              </div>
              <p className="text-[15px] text-gray-800 whitespace-pre-wrap leading-relaxed">{q.content}</p>

              {(q.replies?.length ?? 0) > 0 && (
                <div className="space-y-2 mt-1">
                  {q.replies?.map((r) => (
                    <div key={r.id} className="rounded-xl bg-green-50 px-3 py-2">
                      <p className="text-xs font-semibold text-green-700 mb-0.5">↳ {r.author?.fullName ?? 'Giảng viên'}</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{r.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
