'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

type Period = '30d' | '90d' | '1y';

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

const PERIOD_LABELS: Record<Period, string> = { '30d': '30 ngày', '90d': '90 ngày', '1y': '1 năm' };

export default function RevenuePage() {
  const [period, setPeriod] = useState<Period>('30d');

  const { data: overviewData } = useQuery({
    queryKey: ['instructor-stats-overview'],
    queryFn: () => instructorApi.getStatsOverview(),
  });

  const { data: revenueData, isLoading } = useQuery({
    queryKey: ['instructor-stats-revenue', period],
    queryFn: () => instructorApi.getRevenueChart(period),
  });

  const overview = overviewData?.data;
  const revenueChart: { date: string; amount: number }[] = revenueData?.data?.data ?? [];
  const totalInPeriod = revenueChart.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-1">Doanh thu</h1>
        <p className="text-sm text-muted">Thống kê doanh thu theo thời gian</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-surface-card rounded-card border border-hairline p-5">
          <p className="text-2xl font-bold text-ink">{formatVND(overview?.totalRevenue ?? 0)}</p>
          <p className="text-xs text-muted mt-1">Tổng doanh thu</p>
        </div>
        <div className="bg-surface-card rounded-card border border-hairline p-5">
          <p className="text-2xl font-bold text-ink">{formatVND(totalInPeriod)}</p>
          <p className="text-xs text-muted mt-1">Trong {PERIOD_LABELS[period]}</p>
        </div>
        <div className="bg-surface-card rounded-card border border-hairline p-5">
          <p className="text-2xl font-bold text-ink">{overview?.totalStudents ?? 0}</p>
          <p className="text-xs text-muted mt-1">Tổng học viên</p>
        </div>
      </div>

      <div className="bg-surface-card rounded-card border border-hairline p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Biểu đồ doanh thu</h2>
          <div className="flex gap-1">
            {(['30d', '90d', '1y'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  period === p ? 'bg-sky text-white' : 'border border-hairline text-ink-mute hover:text-ink'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="h-60 flex items-center justify-center"><LoadingSpinner /></div>
        ) : revenueChart.length === 0 ? (
          <div className="h-60 flex items-center justify-center text-sm text-muted">
            Chưa có dữ liệu doanh thu
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenueChart} margin={{ top: 4, right: 4, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
              <Tooltip formatter={(value) => [formatVND(Number(value ?? 0)), 'Doanh thu']} labelStyle={{ color: '#0F172A', fontSize: 12 }} contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
              <Bar dataKey="amount" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
