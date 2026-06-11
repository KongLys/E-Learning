'use client';

import { apiClient } from './axios';

export const adminApi = {
  getStats: () => apiClient.get('/admin/stats'),

  getUsers: (params?: { page?: number; limit?: number; role?: string; status?: string; search?: string }) =>
    apiClient.get('/admin/users', { params }),
  updateUserStatus: (id: string, status: 'active' | 'locked') =>
    apiClient.patch(`/admin/users/${id}/status`, { status }),

  getCourses: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get('/admin/courses', { params }),
  approveCourse: (id: string) => apiClient.patch(`/admin/courses/${id}/approve`),
  rejectCourse: (id: string, reason: string) => apiClient.patch(`/admin/courses/${id}/reject`, { reason }),

  getOrders: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get('/admin/orders', { params }),
  refundOrder: (id: string) => apiClient.post(`/admin/orders/${id}/refund`),

  getModeration: (params?: { status?: string; type?: 'course' | 'lesson' }) =>
    apiClient.get('/admin/moderation', { params }),
  approveModeration: (type: 'course' | 'lesson', id: string) =>
    apiClient.post(`/admin/moderation/${type}/${id}/approve`),
  rejectModeration: (type: 'course' | 'lesson', id: string, reason?: string) =>
    apiClient.post(`/admin/moderation/${type}/${id}/reject`, { reason }),

  getReviewReports: (params?: { status?: 'pending' | 'resolved' | 'dismissed' }) =>
    apiClient.get('/admin/review-reports', { params }),
  resolveReviewReport: (id: string, action: 'delete' | 'dismiss') =>
    apiClient.post(`/admin/review-reports/${id}/resolve`, { action }),
};
