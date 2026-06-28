'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/axios';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { AlertTriangle } from 'lucide-react';

interface HardQuestion {
  questionId: string;
  content: string;
  wrongRate: number;
}
interface QuizInsight {
  quizLessonId: string;
  lessonTitle: string;
  attemptCount: number;
  avgScore: number;
  passRate: number;
  avgDurationSec: number;
  retakeCount: number;
  uniqueStudents: number;
  hardQuestions: HardQuestion[];
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function QuizInsightsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['instructor-stats-quiz-insights'],
    queryFn: () => apiClient.get('/instructor/stats/quiz-insights'),
  });

  const insights: QuizInsight[] = data?.data?.insights ?? [];

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-1">Thông tin bài kiểm tra</h1>
        <p className="text-sm text-muted">Phân tích chi tiết kết quả bài kiểm tra của học viên</p>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : insights.length === 0 ? (
        <div className="bg-surface-card rounded-card border border-hairline p-12 text-center">
          <p className="text-sm text-muted">Chưa có dữ liệu bài kiểm tra</p>
        </div>
      ) : (
        <div className="space-y-6">
          {insights.map((insight) => (
            <div key={insight.quizLessonId} className="bg-surface-card rounded-card border border-hairline overflow-hidden">
              <div className="px-5 py-4 border-b border-hairline bg-canvas-soft">
                <h2 className="text-base font-semibold text-ink">{insight.lessonTitle}</h2>
              </div>

              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-ink">{insight.uniqueStudents}</p>
                    <p className="text-xs text-muted mt-0.5">Học viên đã làm</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-ink">{insight.avgScore.toFixed(1)}</p>
                    <p className="text-xs text-muted mt-0.5">Điểm trung bình</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${insight.passRate >= 70 ? 'text-leaf' : 'text-coral'}`}>
                      {insight.passRate}%
                    </p>
                    <p className="text-xs text-muted mt-0.5">Tỷ lệ đậu</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-ink">{formatDuration(insight.avgDurationSec)}</p>
                    <p className="text-xs text-muted mt-0.5">Thời gian TB</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
                  <div className="bg-canvas-soft rounded-lg px-4 py-3">
                    <span className="text-muted">Tổng lượt làm:</span>{' '}
                    <span className="font-medium text-ink">{insight.attemptCount}</span>
                  </div>
                  <div className="bg-canvas-soft rounded-lg px-4 py-3">
                    <span className="text-muted">Số lần làm lại:</span>{' '}
                    <span className="font-medium text-ink">{insight.retakeCount}</span>
                  </div>
                </div>

                {insight.hardQuestions?.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={14} className="text-sun-deep" />
                      <h3 className="text-sm font-semibold text-ink-mute">Câu hỏi học viên hay làm sai</h3>
                    </div>
                    <div className="space-y-2">
                      {insight.hardQuestions.map((q) => (
                        <div key={q.questionId} className="flex items-start justify-between gap-4 bg-sun-soft rounded-lg px-4 py-3">
                          <p className="text-sm text-ink flex-1 line-clamp-2">{q.content}</p>
                          <span className="shrink-0 text-xs font-semibold text-sun-deep bg-sun-soft px-2 py-0.5 rounded-full">
                            Sai {Math.round(q.wrongRate * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
