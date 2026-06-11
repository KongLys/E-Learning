import { apiClient } from './axios';

export interface CourseFilter {
  search?: string;
  category?: string;
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

export interface SepayPaymentInfo {
  orderId: string;
  qrUrl: string;
  transferCode: string;
  amount: number;
  currency: string;
  accountNumber: string;
  bankCode: string;
  accountName: string;
}

export interface CouponPreview {
  code: string;
  discountPct: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
}

export const orderApi = {
  createOrder: (
    courseIds: string[],
    idempotencyKey: string,
    discountCode?: string,
  ) =>
    apiClient.post('/orders', { courseIds, idempotencyKey, discountCode }),
  initiatePayment: (orderId: string) =>
    apiClient.post<SepayPaymentInfo>('/payments/initiate', { orderId }),
  getOrder: (orderId: string) => apiClient.get(`/orders/${orderId}`),
  cancelOrder: (orderId: string) =>
    apiClient.post(`/orders/${orderId}/cancel`),
  validateCoupon: (code: string, courseId: string) =>
    apiClient.post<CouponPreview>('/coupons/validate', { code, courseId }),
};
