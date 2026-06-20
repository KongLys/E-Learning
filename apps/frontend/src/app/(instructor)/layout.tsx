'use client';

import { useAuthStore } from '@/store/auth.store';
import { useHasHydrated } from '@/lib/hooks/useHasHydrated';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { UserMenu } from '@/components/layout/UserMenu';
import Link from 'next/link';
import {
  BookOpen,
  MessageSquare,
  BarChart2,
  Wrench,
  HelpCircle,
  MessageCircle,
  Bell,
  TrendingUp,
  DollarSign,
  Users,
  Star,
  Activity,
  FileText,
  Tag,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';

type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  href?: string;
  children?: { href: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'courses',
    label: 'Khóa học',
    icon: BookOpen,
    href: '/instructor/courses',
  },
  {
    id: 'communication',
    label: 'Giao tiếp',
    icon: MessageSquare,
    children: [
      { href: '/instructor/communication/qa', label: 'Hỏi đáp', icon: HelpCircle },
      { href: '/instructor/communication/messages', label: 'Tin nhắn', icon: MessageCircle },
      { href: '/instructor/communication/notifications', label: 'Thông báo', icon: Bell },
    ],
  },
  {
    id: 'performance',
    label: 'Hiệu suất',
    icon: BarChart2,
    children: [
      { href: '/instructor/performance/overview', label: 'Tổng quan', icon: TrendingUp },
      { href: '/instructor/performance/revenue', label: 'Doanh thu', icon: DollarSign },
      { href: '/instructor/performance/students', label: 'Học viên', icon: Users },
      { href: '/instructor/performance/reviews', label: 'Đánh giá', icon: Star },
      { href: '/instructor/performance/engagement', label: 'Mức độ tương tác', icon: Activity },
      { href: '/instructor/performance/quiz-insights', label: 'Thông tin bài kiểm tra', icon: FileText },
    ],
  },
  {
    id: 'tools',
    label: 'Công cụ',
    icon: Wrench,
    children: [
      { href: '/instructor/tools/coupons', label: 'Coupon', icon: Tag },
    ],
  },
];

function InstructorSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const g of NAV_GROUPS) {
      if (g.children?.some((c) => pathname.startsWith(c.href))) {
        initial.add(g.id);
      }
    }
    return initial;
  });

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 bg-ink-deep flex flex-col transition-transform duration-200 ease-in-out lg:relative lg:inset-auto lg:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <span className="text-white font-semibold text-sm tracking-wide">Instructor Studio</span>
          <button onClick={onClose} className="text-ink-subtle hover:text-white lg:hidden">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            if (group.href) {
              const active = pathname === group.href || pathname.startsWith(group.href + '/');
              return (
                <Link
                  key={group.id}
                  href={group.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-sky/20 text-sky-bright' : 'text-ink-subtle hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <group.icon size={16} strokeWidth={1.75} />
                  <span>{group.label}</span>
                </Link>
              );
            }

            const isOpen = openGroups.has(group.id);
            const groupActive = group.children?.some((c) => pathname.startsWith(c.href)) ?? false;

            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    groupActive ? 'text-sky-bright' : 'text-ink-subtle hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <group.icon size={16} strokeWidth={1.75} />
                  <span className="flex-1 text-left">{group.label}</span>
                  {isOpen ? (
                    <ChevronDown size={14} strokeWidth={2} />
                  ) : (
                    <ChevronRight size={14} strokeWidth={2} />
                  )}
                </button>
                {isOpen && group.children && (
                  <div className="ml-5 mt-0.5 space-y-0.5">
                    {group.children.map((child) => {
                      const active = pathname.startsWith(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onClose}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                            active ? 'bg-sky/20 text-sky-bright' : 'text-ink-faint hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <child.icon size={14} strokeWidth={1.75} />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const hasHydrated = useHasHydrated();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'instructor' && user.role !== 'admin') router.replace('/');
  }, [user, hasHydrated, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!hasHydrated) return <LoadingSpinner />;
  if (!user || (user.role !== 'instructor' && user.role !== 'admin')) return null;

  return (
    <div className="flex min-h-screen bg-canvas">
      <InstructorSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 bg-surface-card border-b border-hairline flex items-center justify-between px-4 sm:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-ink-mute hover:text-ink -ml-1"
              aria-label="Mở menu"
            >
              <Menu size={20} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="px-3 py-1.5 text-sm font-medium text-ink-mute hover:text-ink rounded-lg hover:bg-surface-strong transition-colors"
            >
              Học viên
            </Link>
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-7 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
