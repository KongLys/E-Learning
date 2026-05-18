'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

type Period = '30d' | '90d' | '1y';

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-card rounded-2xl border border-hairline p-5">
      <p className="font-display text-3xl text-ink mb-1">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

const RATING_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
const PERIOD_LABELS: Record<Period, string> = { '30d': '30 ngày', '90d': '90 ngày', '1y': '1 năm' };

export default function InstructorStatisticsPage() {
  const [period, setPeriod] = useState<Period>('30d');

  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['instructor-stats-overview'],
    queryFn: () => instructorApi.getStatsOverview(),
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['instructor-stats-revenue', period],
    queryFn: () => instructorApi.getRevenueChart(period),
  });

  const overview = overviewData?.data;
  const revenueChart: { date: string; amount: number }[] = revenueData?.data?.data ?? [];

  const ratingDistribution = overview?.ratingDistribution
    ? Object.entries(overview.ratingDistribution as Record<string, number>).map(([star, count], idx) => ({
        name: `${star} sao`,
        value: count,
        fill: RATING_COLORS[idx % RATING_COLORS.length],
      }))
    : [];

  if (overviewLoading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-300 mx-auto px-6 py-10 space-y-10">
        <div>
          <h1 className="font-display text-4xl text-ink mb-1">Thống kê</h1>
          <p className="text-sm text-muted">Phân tích hiệu quả giảng dạy của bạn</p>
        </div>

        {/* Pending questions alert */}
        {overview?.pendingQuestions > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <AlertIcon />
            <p className="text-sm text-amber-800">
              Bạn có <span className="font-semibold">{overview.pendingQuestions}</span> câu hỏi chưa được trả lời.
            </p>
          </div>
        )}

        {/* Overview stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Tổng khóa học" value={overview?.totalCourses ?? 0} />
          <StatCard label="Tổng học viên" value={overview?.totalStudents ?? 0} />
          <StatCard label="Đánh giá trung bình" value={overview?.avgRating ? `${overview.avgRating} ★` : '—'} />
          <StatCard label="Tổng doanh thu" value={formatVND(overview?.totalRevenue ?? 0)} />
        </div>

        {/* Revenue chart */}
        <div className="bg-surface-card rounded-2xl border border-hairline p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Doanh thu theo thời gian</h2>
            <div className="flex gap-1">
              {(['30d', '90d', '1y'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs rounded-pill font-medium transition-colors ${
                    period === p
                      ? 'bg-emphasis text-white'
                      : 'border border-hairline text-muted hover:text-ink'
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {revenueLoading ? (
            <div className="h-48 flex items-center justify-center"><LoadingSpinner /></div>
          ) : revenueChart.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted">
              Chưa có dữ liệu doanh thu trong khoảng thời gian này
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenueChart} margin={{ top: 4, right: 4, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)
                  }
                />
                <Tooltip
                  formatter={(value) => [formatVND(Number(value ?? 0)), 'Doanh thu']}
                  labelStyle={{ color: '#374151', fontSize: 12 }}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Rating distribution */}
        {ratingDistribution.some((r) => r.value > 0) && (
          <div className="bg-surface-card rounded-2xl border border-hairline p-6">
            <h2 className="text-[15px] font-semibold text-ink mb-4">Phân bổ đánh giá</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={ratingDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  dataKey="value"
                  paddingAngle={2}
                />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 shrink-0">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
