'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuthStore } from '@/store/auth.store';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '@/lib/api/notification.api';
import { chatApi } from '@/lib/api/chat.api';

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChatLink() {
  const { data: convData } = useQuery({
    queryKey: ['chat-rooms-unread'],
    queryFn: () => chatApi.getConversations(),
    refetchInterval: 30000,
  });

  const conversations = Array.isArray(convData) ? convData : [];
  const unreadCount = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  return (
    <Link
      href="/chat"
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-surface-strong transition-colors"
      aria-label="Chat"
      title="Chat"
    >
      <ChatIcon />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-semantic-error text-white text-[10px] font-semibold leading-none">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
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
              <button onClick={() => markAllMutation.mutate()} className="text-xs text-muted hover:text-ink transition-colors">
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
                onClick={() => { if (!n.isRead) markReadMutation.mutate(n.id); setOpen(false); }}
                className={`px-4 py-3 cursor-pointer hover:bg-canvas transition-colors ${!n.isRead ? 'bg-canvas-soft' : ''}`}
              >
                <p className="text-sm font-medium text-ink">{n.title}</p>
                <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</p>
                <p className="text-xs text-muted-soft mt-1">{new Date(n.createdAt).toLocaleDateString('vi-VN')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const initials = user.fullName?.split(' ').map((w) => w[0]).slice(-2).join('').toUpperCase() ?? '?';

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.push('/');
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        aria-label="Tài khoản"
      >
        <div className="h-8 w-8 rounded-full overflow-hidden bg-surface-strong flex items-center justify-center ring-1 ring-hairline-strong">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt={user.fullName} width={32} height={32} className="object-cover" />
          ) : (
            <span className="text-xs font-semibold text-muted">{initials}</span>
          )}
        </div>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-surface-card border border-hairline rounded-2xl shadow-lg z-50 overflow-hidden py-1">
          <div className="px-4 py-3 border-b border-hairline">
            <p className="text-sm font-medium text-ink truncate">{user.fullName}</p>
            <p className="text-xs text-muted truncate">{user.email}</p>
          </div>
          <div className="py-1">
            {user.role === 'student' && (
              <Link href="/my-courses" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-muted hover:text-ink hover:bg-canvas transition-colors">
                Khóa học của tôi
              </Link>
            )}
            {user.role === 'instructor' && (
              <>
                <Link href="/instructor/dashboard" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-muted hover:text-ink hover:bg-canvas transition-colors">
                  Trang giảng viên
                </Link>
                <Link href="/instructor/statistics" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-muted hover:text-ink hover:bg-canvas transition-colors">
                  Thống kê
                </Link>
              </>
            )}
            {user.role === 'admin' && (
              <Link href="/admin" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-muted hover:text-ink hover:bg-canvas transition-colors">
                Admin
              </Link>
            )}
          </div>
          <div className="border-t border-hairline py-1">
            <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-muted hover:text-ink hover:bg-canvas transition-colors">
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { user } = useAuthStore();
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <nav className="sticky top-0 z-40 h-16 bg-canvas/95 backdrop-blur-sm border-b border-hairline">
      <div className="max-w-300 mx-auto h-full px-6 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="font-display text-xl text-ink select-none shrink-0">
          ELearn
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          <Link
            href="/courses"
            className={`px-4 py-2 text-[15px] font-medium transition-colors ${
              isActive('/courses')
                ? 'text-ink border-b-2 border-ink pb-1.5'
                : 'text-muted hover:text-ink rounded-lg hover:bg-surface-strong'
            }`}
          >
            Khám phá
          </Link>
          {user?.role === 'student' && (
            <Link
              href="/my-courses"
              className={`px-4 py-2 text-[15px] font-medium transition-colors ${
                isActive('/my-courses')
                  ? 'text-ink border-b-2 border-ink pb-1.5'
                  : 'text-muted hover:text-ink rounded-lg hover:bg-surface-strong'
              }`}
            >
              Khóa học của tôi
            </Link>
          )}
          {user?.role === 'instructor' && (
            <>
              <Link
                href="/instructor/dashboard"
                className={`px-4 py-2 text-[15px] font-medium transition-colors ${
                  isActive('/instructor/dashboard') || isActive('/instructor/courses') || isActive('/instructor/questions')
                    ? 'text-ink border-b-2 border-ink pb-1.5'
                    : 'text-muted hover:text-ink rounded-lg hover:bg-surface-strong'
                }`}
              >
                Giảng dạy
              </Link>
              <Link
                href="/instructor/statistics"
                className={`px-4 py-2 text-[15px] font-medium transition-colors ${
                  isActive('/instructor/statistics')
                    ? 'text-ink border-b-2 border-ink pb-1.5'
                    : 'text-muted hover:text-ink rounded-lg hover:bg-surface-strong'
                }`}
              >
                Thống kê
              </Link>
            </>
          )}
          {user?.role === 'admin' && (
            <Link
              href="/admin"
              className={`px-4 py-2 text-[15px] font-medium transition-colors ${
                isActive('/admin')
                  ? 'text-ink border-b-2 border-ink pb-1.5'
                  : 'text-muted hover:text-ink rounded-lg hover:bg-surface-strong'
              }`}
            >
              Admin
            </Link>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {(user.role === 'student' || user.role === 'instructor') && (
                <ChatLink />
              )}
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <>
              <Link href="/login" className="px-4 py-2 text-[15px] font-medium text-muted hover:text-ink transition-colors">
                Đăng nhập
              </Link>
              <Link href="/register" className="inline-flex h-9 items-center px-4 rounded-pill bg-emphasis text-white text-sm font-medium hover:bg-ink transition-colors">
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
