'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/axios';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Clock, BookOpen, CheckCircle, HelpCircle, Star, Activity } from 'lucide-react';

function formatWatchTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function EngagementPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['instructor-stats-engagement'],
    queryFn: () => apiClient.get('/instructor/stats/engagement'),
  });

  const stats = data?.data;

  const metrics = stats
    ? [
        {
          icon: Clock,
          label: 'Tổng thời lượng xem video',
          value: formatWatchTime(stats.totalWatchTimeSec ?? 0),
          description: 'Tổng watch time của tất cả học viên',
          color: 'text-blue-500 bg-blue-50',
        },
        {
          icon: Activity,
          label: 'Tỷ lệ hoàn thành trung bình',
          value: `${stats.avgCompletionRate ?? 0}%`,
          description: 'Tiến độ trung bình của học viên',
          color: 'text-green-500 bg-green-50',
        },
        {
          icon: BookOpen,
          label: 'Số bài giảng đã học',
          value: (stats.totalLessonsCompleted ?? 0).toLocaleString('vi-VN'),
          description: 'Tổng lượt hoàn thành bài giảng',
          color: 'text-purple-500 bg-purple-50',
        },
        {
          icon: CheckCircle,
          label: 'Số lần làm bài kiểm tra',
          value: (stats.totalQuizAttempts ?? 0).toLocaleString('vi-VN'),
          description: 'Tổng lượt làm quiz của học viên',
          color: 'text-amber-500 bg-amber-50',
        },
        {
          icon: HelpCircle,
          label: 'Số câu hỏi trong Q&A',
          value: (stats.totalQaQuestions ?? 0).toLocaleString('vi-VN'),
          description: 'Tổng câu hỏi học viên đã đặt',
          color: 'text-red-500 bg-red-50',
        },
        {
          icon: Star,
          label: 'Đánh giá trung bình',
          value: stats.avgRating ? `${stats.avgRating}` : '—',
          description: `${stats.totalReviews ?? 0} lượt đánh giá`,
          color: 'text-yellow-500 bg-yellow-50',
        },
      ]
    : [];

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Mức độ tương tác</h1>
        <p className="text-sm text-gray-500">Đo lường sự tham gia của học viên</p>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-lg ${m.color}`}>
                  <m.icon size={20} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-bold text-gray-900 mb-0.5">{m.value}</p>
                  <p className="text-sm font-medium text-gray-700 leading-snug">{m.label}</p>
                  <p className="text-xs text-gray-400 mt-1">{m.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
