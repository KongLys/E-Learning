'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/axios';
import { moderationApi } from '@/lib/api/ai.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Bell, BellOff } from 'lucide-react';
import { notify, showPrompt } from '@/store/dialog.store';

type NotificationActionData = {
  action: 'appeal';
  contentType: 'course' | 'lesson';
  contentId: string;
  courseId?: string;
};

const notificationApi = {
  list: (page = 1) => apiClient.get('/notifications', { params: { page } }),
  markAllRead: () => apiClient.patch('/notifications/read-all'),
  markRead: (id: string) => apiClient.patch(`/notifications/${id}/read`),
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

export default function NotificationsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['instructor-notifications'],
    queryFn: () => notificationApi.list(1),
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructor-notifications'] }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructor-notifications'] }),
  });

  const appealMutation = useMutation({
    mutationFn: async (actionData: NotificationActionData) => {
      const reason = (await showPrompt({ title: 'Lý do kiến nghị (không bắt buộc):' })) ?? undefined;
      if (actionData.contentType === 'course') {
        return moderationApi.appealCourse(actionData.contentId, reason);
      }
      return moderationApi.appealLesson(actionData.contentId, reason);
    },
    onSuccess: () => {
      notify.success('Đã gửi kiến nghị thành công!');
      qc.invalidateQueries({ queryKey: ['instructor-notifications'] });
    },
    onError: (err: any) => notify.error(err?.response?.data?.message ?? 'Gửi kiến nghị thất bại'),
  });

  const notifications: any[] = data?.data?.notifications ?? data?.data ?? [];
  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1">Thông báo</h1>
          <p className="text-sm text-muted">Lịch sử thông báo của bạn</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 border border-hairline-strong rounded-lg text-sm text-ink-mute hover:bg-canvas-soft disabled:opacity-50 transition-colors"
          >
            <BellOff size={14} />
            Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : notifications.length === 0 ? (
        <div className="bg-surface-card rounded-card border border-hairline p-12 text-center">
          <Bell size={32} className="mx-auto text-ink-faint mb-3" />
          <p className="text-sm text-muted">Chưa có thông báo nào</p>
        </div>
      ) : (
        <div className="bg-surface-card rounded-card border border-hairline divide-y divide-hairline">
          {notifications.map((n: any) => (
            <div
              key={n.id}
              className={`flex items-start gap-4 px-5 py-4 transition-colors ${
                !n.isRead ? 'bg-sky-soft/40' : ''
              }`}
            >
              <div
                className={`mt-0.5 w-2 h-2 rounded-full shrink-0 cursor-pointer ${!n.isRead ? 'bg-sky' : 'bg-transparent'}`}
                onClick={() => !n.isRead && markReadMutation.mutate(n.id)}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="cursor-pointer"
                  onClick={() => !n.isRead && markReadMutation.mutate(n.id)}
                >
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  <p className="text-sm text-ink-mute mt-0.5">{n.body}</p>
                  <p className="text-xs text-ink-subtle mt-1">{timeAgo(n.createdAt)}</p>
                </div>
                {n.data?.action === 'appeal' && (
                  <button
                    onClick={() => appealMutation.mutate(n.data as NotificationActionData)}
                    disabled={appealMutation.isPending}
                    className="mt-2 text-xs font-medium text-sky hover:text-sky-deep border border-sky-soft rounded-md px-2.5 py-1 hover:bg-sky-soft disabled:opacity-50 transition-colors"
                  >
                    Kiến nghị lại
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
