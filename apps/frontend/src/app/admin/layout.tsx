'use client';

import { useAuthStore } from '@/store/auth.store';
import { useHasHydrated } from '@/lib/hooks/useHasHydrated';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';
import { LayoutDashboard, Users, BookOpen, ShoppingCart, ShieldCheck, Flag } from 'lucide-react';

function AdminSidebar({ pendingCourses, pendingReports, pendingModeration }: { pendingCourses: number; pendingReports: number; pendingModeration: number }) {
  const pathname = usePathname();
  const nav = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/users', label: 'Người dùng', icon: Users },
    { href: '/admin/courses', label: 'Khóa học', icon: BookOpen, badge: pendingCourses },
    { href: '/admin/moderation', label: 'Kiểm duyệt', icon: ShieldCheck, badge: pendingModeration },
    { href: '/admin/reports', label: 'Báo cáo', icon: Flag, badge: pendingReports },
    { href: '/admin/orders', label: 'Đơn hàng', icon: ShoppingCart },
  ];

  return (
    <aside className="w-60 shrink-0 bg-ink-deep min-h-screen flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <span className="text-white font-semibold text-sm tracking-wide">Admin Portal</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || (href !== '/admin' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-sky/20 text-sky-bright'
                  : 'text-ink-subtle hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={16} strokeWidth={1.75} />
              <span className="flex-1">{label}</span>
              {badge ? (
                <span className="bg-coral text-white text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-5 text-center leading-none">
                  {badge}
                </span>
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
    <div className="flex min-h-screen bg-canvas">
      <AdminSidebar
        pendingCourses={statsData?.data?.pendingCourses ?? 0}
        pendingReports={statsData?.data?.pendingReports ?? 0}
        pendingModeration={statsData?.data?.pendingModeration ?? 0}
      />
      <div className="flex-1 flex flex-col">
        <header className="h-12 bg-surface-card border-b border-hairline flex items-center px-6">
          <span className="text-xs text-ink-subtle">{user.email}</span>
        </header>
        <main className="flex-1 p-7">{children}</main>
      </div>
    </div>
  );
}
