'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '@/lib/api/notification.api';

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-unread-count'] }); qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-unread-count'] }); qc.invalidateQueries({ queryKey: ['notifications'] }); },
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
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
        <span className="text-lg leading-none">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-medium text-sm">Thông báo</span>
            {unreadCount > 0 && (
              <button onClick={() => markAllMutation.mutate()} className="text-xs text-blue-500 hover:text-blue-700">Đọc tất cả</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y">
            {notifications.length === 0 && (
              <p className="text-center py-6 text-sm text-gray-400">Không có thông báo</p>
            )}
            {notifications.slice(0, 10).map((n: any) => (
              <div
                key={n.id}
                onClick={() => { if (!n.isRead) markReadMutation.mutate(n.id); setOpen(false); }}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${!n.isRead ? 'bg-blue-50' : ''}`}
              >
                {n.linkUrl ? (
                  <Link href={n.linkUrl} className="block">
                    <p className="text-sm font-medium text-gray-800">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                  </Link>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-800">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                  </>
                )}
                <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleDateString('vi-VN')}</p>
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
    <nav className="border-b bg-white px-6 py-3 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold text-blue-600">ELearn</Link>

      <div className="flex items-center gap-4">
        <Link href="/courses" className="text-sm text-gray-600 hover:text-gray-900">Khóa học</Link>

        {user ? (
          <>
            {user.role === 'student' && (
              <Link href="/my-courses" className="text-sm text-gray-600 hover:text-gray-900">Học của tôi</Link>
            )}
            {user.role === 'instructor' && (
              <Link href="/instructor/dashboard" className="text-sm text-gray-600 hover:text-gray-900">Quản lý</Link>
            )}
            {user.role === 'admin' && (
              <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">Admin</Link>
            )}
            <NotificationBell />
            <span className="text-sm font-medium text-gray-700">{user.fullName}</span>
            <button onClick={handleLogout} className="text-sm text-red-500 hover:text-red-700">
              Đăng xuất
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">Đăng nhập</Link>
            <Link href="/register" className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
              Đăng ký
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
