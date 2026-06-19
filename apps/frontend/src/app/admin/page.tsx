'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';
import { Users, BookOpen, DollarSign, GraduationCap, Clock, Lock, CheckCircle, ArrowRight } from 'lucide-react';

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="p-1.5 bg-gray-100 rounded-lg text-gray-500">
          <Icon size={14} strokeWidth={1.75} />
        </span>
      </div>
      <p className="text-2xl font-semibold text-gray-900 tracking-tight">{value}</p>
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
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tổng quan hệ thống</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Người dùng" value={stats.totalUsers ?? 0} />
        <StatCard icon={BookOpen} label="Khóa học" value={stats.totalPublishedCourses ?? 0} />
        <StatCard icon={DollarSign} label="Doanh thu tháng" value={formatCurrency(stats.revenueThisMonth ?? 0)} />
        <StatCard icon={GraduationCap} label="Học viên đang học" value={stats.activeStudents ?? 0} />
      </div>

      <div className="space-y-2">
        {stats.pendingCourses > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock size={16} className="text-amber-600" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-medium text-amber-800">{stats.pendingCourses} khóa học chờ duyệt</p>
                <p className="text-xs text-amber-600 mt-0.5">Cần xem xét và phê duyệt</p>
              </div>
            </div>
            <Link href="/admin/courses?tab=pending" className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline">
              Xem ngay <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {stats.lockedUsers > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock size={16} className="text-red-500" strokeWidth={1.75} />
              <p className="text-sm font-medium text-red-800">{stats.lockedUsers} người dùng đang bị khóa</p>
            </div>
            <Link href="/admin/users?status=locked" className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline">
              Xem <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {!stats.pendingCourses && !stats.lockedUsers && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <CheckCircle size={16} className="text-green-600" strokeWidth={1.75} />
            <p className="text-sm font-medium text-green-700">Không có cảnh báo nào cần xử lý</p>
          </div>
        )}
      </div>
    </div>
  );
}
