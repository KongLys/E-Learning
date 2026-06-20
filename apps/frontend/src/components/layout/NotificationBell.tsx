'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '@/lib/api/notification.api';
import { moderationApi } from '@/lib/api/ai.api';
import { Bell } from 'lucide-react';
import { notify, showPrompt } from '@/store/dialog.store';

type NotificationActionData = {
  action: 'appeal';
  contentType: 'course' | 'lesson';
  contentId: string;
  courseId?: string;
};

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  data?: NotificationActionData;
};

export function NotificationBell() {
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

  const appealMutation = useMutation({
    mutationFn: async ({ contentType, contentId }: NotificationActionData) => {
      const reason = (await showPrompt({ title: 'Lý do kiến nghị (không bắt buộc):' })) ?? undefined;
      if (contentType === 'course') {
        return moderationApi.appealCourse(contentId, reason);
      }
      return moderationApi.appealLesson(contentId, reason);
    },
    onSuccess: () => notify.success('Đã gửi kiến nghị thành công!'),
    onError: (err: any) => notify.error(err?.response?.data?.message ?? 'Gửi kiến nghị thất bại'),
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = countData?.data?.count ?? 0;
  const notifications: NotificationItem[] = listData?.data?.notifications ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-surface-strong transition-colors"
        aria-label="Thông báo"
      >
        <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-semantic-error text-white text-[10px] font-semibold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface-card border border-hairline rounded-card shadow-modal z-50 overflow-hidden">
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
            {notifications.slice(0, 10).map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 hover:bg-canvas transition-colors ${!n.isRead ? 'bg-canvas-soft' : ''}`}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => { if (!n.isRead) markReadMutation.mutate(n.id); setOpen(false); }}
                >
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-xs text-muted-soft mt-1">{new Date(n.createdAt).toLocaleDateString('vi-VN')}</p>
                </div>
                {n.data?.action === 'appeal' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); appealMutation.mutate(n.data!); }}
                    disabled={appealMutation.isPending}
                    className="mt-1.5 text-xs text-sky hover:text-sky-deep font-medium disabled:opacity-50"
                  >
                    Kiến nghị lại
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
