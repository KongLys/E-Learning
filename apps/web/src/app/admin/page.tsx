'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border p-5 space-y-2">
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats(),
  });

  if (isLoading) return <LoadingSpinner />;

  const stats = data?.data ?? {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="👥" label="Tổng người dùng" value={stats.totalUsers ?? 0} />
        <StatCard icon="📚" label="Khóa học đã xuất bản" value={stats.totalPublishedCourses ?? 0} />
        <StatCard icon="💰" label="Doanh thu tháng này" value={formatCurrency(stats.revenueThisMonth ?? 0)} />
        <StatCard icon="🎓" label="Học viên đang học" value={stats.activeStudents ?? 0} />
      </div>

      <div className="space-y-3">
        {stats.pendingCourses > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-orange-500 text-lg">⏳</span>
              <div>
                <p className="font-medium text-orange-800">{stats.pendingCourses} khóa học chờ duyệt</p>
                <p className="text-xs text-orange-600">Cần xem xét và phê duyệt</p>
              </div>
            </div>
            <Link href="/admin/courses?tab=pending" className="text-sm text-orange-700 font-medium hover:underline">
              Xem ngay →
            </Link>
          </div>
        )}

        {stats.lockedUsers > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-red-500 text-lg">🔒</span>
              <div>
                <p className="font-medium text-red-800">{stats.lockedUsers} người dùng đang bị khóa</p>
              </div>
            </div>
            <Link href="/admin/users?status=locked" className="text-sm text-red-700 font-medium hover:underline">
              Xem →
            </Link>
          </div>
        )}

        {!stats.pendingCourses && !stats.lockedUsers && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4">
            <p className="text-green-700 font-medium">✓ Không có cảnh báo nào cần xử lý</p>
          </div>
        )}
      </div>
    </div>
  );
}
