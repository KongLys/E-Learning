'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/axios';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { AlertTriangle } from 'lucide-react';

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

  const insights: any[] = data?.data?.insights ?? [];

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Thông tin bài kiểm tra</h1>
        <p className="text-sm text-gray-500">Phân tích chi tiết kết quả bài kiểm tra của học viên</p>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : insights.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">Chưa có dữ liệu bài kiểm tra</p>
        </div>
      ) : (
        <div className="space-y-6">
          {insights.map((insight: any) => (
            <div key={insight.quizLessonId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <h2 className="text-base font-semibold text-gray-900">{insight.lessonTitle}</h2>
              </div>

              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{insight.uniqueStudents}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Học viên đã làm</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{insight.avgScore.toFixed(1)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Điểm trung bình</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${insight.passRate >= 70 ? 'text-green-600' : 'text-red-500'}`}>
                      {insight.passRate}%
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Tỷ lệ đậu</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{formatDuration(insight.avgDurationSec)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Thời gian TB</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    <span className="text-gray-500">Tổng lượt làm:</span>{' '}
                    <span className="font-medium text-gray-900">{insight.attemptCount}</span>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    <span className="text-gray-500">Số lần làm lại:</span>{' '}
                    <span className="font-medium text-gray-900">{insight.retakeCount}</span>
                  </div>
                </div>

                {insight.hardQuestions?.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={14} className="text-amber-500" />
                      <h3 className="text-sm font-semibold text-gray-700">Câu hỏi học viên hay làm sai</h3>
                    </div>
                    <div className="space-y-2">
                      {insight.hardQuestions.map((q: any) => (
                        <div key={q.questionId} className="flex items-start justify-between gap-4 bg-amber-50 rounded-lg px-4 py-3">
                          <p className="text-sm text-gray-800 flex-1 line-clamp-2">{q.content}</p>
                          <span className="shrink-0 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
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
