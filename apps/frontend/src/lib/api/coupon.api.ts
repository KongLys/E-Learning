import { apiClient } from './axios';

export interface CreateCouponDto {
  code: string;
  courseId?: string;
  discountPct: number;
  maxUses?: number;
  expiresAt?: string;
}

export const couponApi = {
  list: () => apiClient.get('/instructor/coupons'),

  create: (dto: CreateCouponDto) => apiClient.post('/instructor/coupons', dto),

  bulkCreate: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post('/instructor/coupons/bulk', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  coursesExport: async (): Promise<void> => {
    const res = await apiClient.get('/instructor/coupons/courses-export', { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'courses.csv';
    a.click();
    URL.revokeObjectURL(url);
  },

  delete: (id: string) => apiClient.delete(`/instructor/coupons/${id}`),
};
