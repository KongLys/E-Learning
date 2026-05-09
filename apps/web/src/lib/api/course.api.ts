import { apiClient } from './axios';

export interface CourseFilter {
  search?: string;
  categoryId?: string;
  level?: string;
  price?: 'free' | 'paid';
  sort?: string;
  page?: number;
  limit?: number;
}

export const courseApi = {
  getCourses: (filter: CourseFilter = {}) => apiClient.get('/courses', { params: filter }),
  getCourseBySlug: (slug: string) => apiClient.get(`/courses/${slug}`),
  getCategories: () => apiClient.get('/courses/categories'),
};

export const enrollmentApi = {
  getMyEnrollments: () => apiClient.get('/enrollments/my-courses'),
  enrollFree: (courseId: string) => apiClient.post('/enrollments', { courseId }),
  getProgress: (courseId: string) => apiClient.get(`/enrollments/${courseId}/progress`),
};

export const orderApi = {
  createOrder: (courseIds: string[], idempotencyKey: string) =>
    apiClient.post('/orders', { courseIds, idempotencyKey }),
  initiatePayment: (orderId: string, returnUrl: string) =>
    apiClient.post('/payments/initiate', { orderId, gateway: 'vnpay', returnUrl }),
};
