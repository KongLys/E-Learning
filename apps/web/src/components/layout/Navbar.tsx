'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '@/lib/api/notification.api';

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: countData } = useQuery({
    queryKey: ['notif-unread-count'],
    queryFn: () => notificationApi.getUnreadCount(),
    refetchInterval: 30000,
  });

  const { data: listData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationApi.getNotifications({ page: 1 }),
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-unread-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-unread-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = countData?.data?.count ?? 0;
  const notifications: any[] = listData?.data?.notifications ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-surface-strong transition-colors"
        aria-label="Thông báo"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-semantic-error text-white text-[10px] font-semibold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface-card border border-hairline rounded-2xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <span className="text-sm font-semibold text-ink">Thông báo</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllMutation.mutate()}
                className="text-xs text-muted hover:text-ink transition-colors"
              >
                Đọc tất cả
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-hairline">
            {notifications.length === 0 && (
              <p className="text-center py-8 text-sm text-muted">Không có thông báo</p>
            )}
            {notifications.slice(0, 10).map((n: any) => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.isRead) markReadMutation.mutate(n.id);
                  setOpen(false);
                }}
                className={`px-4 py-3 cursor-pointer hover:bg-canvas transition-colors ${!n.isRead ? 'bg-canvas-soft' : ''}`}
              >
                {n.linkUrl ? (
                  <Link href={n.linkUrl} className="block">
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</p>
                  </Link>
                ) : (
                  <>
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</p>
                  </>
                )}
                <p className="text-xs text-muted-soft mt-1">
                  {new Date(n.createdAt).toLocaleDateString('vi-VN')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <nav className="sticky top-0 z-40 h-16 bg-canvas border-b border-hairline">
      <div className="max-w-300 mx-auto h-full px-6 flex items-center justify-between">
        <Link href="/" className="font-display text-xl text-ink tracking-tight select-none">
          ELearn
        </Link>

        <div className="flex items-center gap-6">
          <Link
            href="/courses"
            className="text-[15px] font-medium text-muted hover:text-ink transition-colors"
          >
            Khóa học
          </Link>

          {user ? (
            <>
              {user.role === 'student' && (
                <Link
                  href="/my-courses"
                  className="text-[15px] font-medium text-muted hover:text-ink transition-colors"
                >
                  Học của tôi
                </Link>
              )}
              {user.role === 'instructor' && (
                <Link
                  href="/instructor/dashboard"
                  className="text-[15px] font-medium text-muted hover:text-ink transition-colors"
                >
                  Quản lý
                </Link>
              )}
              {user.role === 'admin' && (
                <Link
                  href="/admin"
                  className="text-[15px] font-medium text-muted hover:text-ink transition-colors"
                >
                  Admin
                </Link>
              )}
              <NotificationBell />
              <span className="text-[15px] font-medium text-body-copy">{user.fullName}</span>
              <button
                onClick={handleLogout}
                className="text-[15px] font-medium text-muted hover:text-ink transition-colors"
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-[15px] font-medium text-muted hover:text-ink transition-colors"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="inline-flex h-10 items-center px-5 rounded-pill bg-emphasis text-white text-[15px] font-medium hover:bg-ink transition-colors"
              >
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
