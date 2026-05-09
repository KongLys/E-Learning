'use client';

import { useAuthStore } from '@/store/auth.store';
import { useHasHydrated } from '@/lib/hooks/useHasHydrated';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';

function AdminSidebar({ pendingCourses }: { pendingCourses: number }) {
  const pathname = usePathname();
  const nav = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/users', label: 'Người dùng', icon: '👥' },
    { href: '/admin/courses', label: 'Khóa học', icon: '📚', badge: pendingCourses },
    { href: '/admin/orders', label: 'Đơn hàng', icon: '💳' },
  ];
  return (
    <aside className="w-56 shrink-0 border-r bg-white min-h-screen py-6">
      <div className="px-4 mb-6">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin Portal</span>
      </div>
      <nav className="space-y-1 px-2">
        {nav.map(({ href, label, icon, badge }) => {
          const active = pathname === href || (href !== '/admin' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <span>{icon}</span>
              <span className="flex-1">{label}</span>
              {badge ? (
                <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-4.5 text-center">{badge}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const hasHydrated = useHasHydrated();
  const router = useRouter();

  const { data: statsData } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats(),
    enabled: !!user && user.role === 'admin',
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'admin') router.replace('/');
  }, [user, hasHydrated, router]);

  if (!hasHydrated) return <LoadingSpinner />;
  if (!user || user.role !== 'admin') return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar pendingCourses={statsData?.data?.pendingCourses ?? 0} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
