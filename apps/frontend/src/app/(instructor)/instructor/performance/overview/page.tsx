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
  Cell,
} from 'recharts';
import { AlertTriangle, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

type Period = '30d' | '90d' | '1y';

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

const RATING_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
const PERIOD_LABELS: Record<Period, string> = { '30d': '30 ngày', '90d': '90 ngày', '1y': '1 năm' };

export default function PerformanceOverviewPage() {
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
        value: count as number,
        fill: RATING_COLORS[idx % RATING_COLORS.length],
      }))
    : [];

  if (overviewLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Tổng quan</h1>
        <p className="text-sm text-gray-500">Phân tích hiệu quả giảng dạy của bạn</p>
      </div>

      {overview?.pendingQuestions > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            Bạn có <span className="font-semibold">{overview.pendingQuestions}</span> câu hỏi chưa được trả lời.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng khóa học" value={overview?.totalCourses ?? 0} />
        <StatCard label="Tổng học viên" value={overview?.totalStudents ?? 0} />
        <StatCard label="Đánh giá trung bình" value={overview?.avgRating ? <span className="inline-flex items-center gap-1">{overview.avgRating} <Star size={20} className="fill-amber-400 text-amber-400" /></span> : '—'} />
        <StatCard label="Tổng doanh thu" value={formatVND(overview?.totalRevenue ?? 0)} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Doanh thu theo thời gian</h2>
          <div className="flex gap-1">
            {(['30d', '90d', '1y'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  period === p ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-500 hover:text-gray-700'
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
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">
            Chưa có dữ liệu doanh thu trong khoảng thời gian này
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueChart} margin={{ top: 4, right: 4, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
              <Tooltip formatter={(value) => [formatVND(Number(value ?? 0)), 'Doanh thu']} labelStyle={{ color: '#374151', fontSize: 12 }} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {ratingDistribution.some((r) => r.value > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Phân bổ đánh giá</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={ratingDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={2}>
                {ratingDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
