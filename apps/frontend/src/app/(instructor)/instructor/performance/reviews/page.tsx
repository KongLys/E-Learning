'use client';

import { useQuery } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { Star } from 'lucide-react';

const RATING_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

const STAR_LABELS: Record<string, string> = {
  '1': '1 sao',
  '2': '2 sao',
  '3': '3 sao',
  '4': '4 sao',
  '5': '5 sao',
};

export default function ReviewsPage() {
  const { data: overviewData, isLoading } = useQuery({
    queryKey: ['instructor-stats-overview'],
    queryFn: () => instructorApi.getStatsOverview(),
  });

  const overview = overviewData?.data;

  const ratingDistribution = overview?.ratingDistribution
    ? Object.entries(overview.ratingDistribution as Record<string, number>)
        .map(([star, count], idx) => ({
          name: STAR_LABELS[star] ?? `${star} sao`,
          value: count as number,
          fill: RATING_COLORS[idx % RATING_COLORS.length],
        }))
        .filter((r) => r.value > 0)
    : [];

  const totalReviews = ratingDistribution.reduce((s, r) => s + r.value, 0);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Đánh giá</h1>
        <p className="text-sm text-gray-500">Tổng hợp đánh giá từ học viên</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="flex items-center gap-1 text-3xl font-bold text-gray-900">
            {overview?.avgRating ? <>{overview.avgRating} <Star size={22} className="fill-amber-400 text-amber-400" /></> : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Đánh giá trung bình</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-3xl font-bold text-gray-900">{totalReviews}</p>
          <p className="text-xs text-gray-500 mt-1">Tổng lượt đánh giá</p>
        </div>
      </div>

      {ratingDistribution.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">Chưa có đánh giá nào</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-6">Phân bổ đánh giá</h2>
          <div className="flex flex-col sm:flex-row gap-8 items-center">
            <ResponsiveContainer width={260} height={220}>
              <PieChart>
                <Pie data={ratingDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={2}>
                  {ratingDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>

            <div className="flex-1 space-y-3">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = (overview?.ratingDistribution as Record<string, number>)?.[String(star)] ?? 0;
                const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-12 shrink-0">{star} sao</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-amber-400 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
