import { apiClient } from './axios';

export const notificationApi = {
  getNotifications: (params?: { page?: number; unread_only?: boolean }) =>
    apiClient.get('/notifications', { params }),
  getUnreadCount: () => apiClient.get('/notifications/unread-count'),
  markRead: (id: string) => apiClient.patch(`/notifications/${id}/read`),
  markAllRead: () => apiClient.patch('/notifications/read-all'),
};
