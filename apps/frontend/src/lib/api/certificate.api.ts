import { apiClient } from './axios';

/** Dữ liệu chứng chỉ trả về cho học viên (đủ để render PDF). */
export interface CertificateView {
  code: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string | null;
  studentFullName: string;
  instructorName: string;
  issuedAt: string;
}

/** Kết quả xác minh công khai theo mã. */
export type CertificateVerifyResult =
  | { valid: false }
  | {
      valid: true;
      code: string;
      studentName: string;
      courseTitle: string;
      instructorName: string;
      issuedAt: string;
    };

export const certificateApi = {
  listMine: () => apiClient.get<CertificateView[]>('/certificates'),
  getByCourse: (courseId: string) =>
    apiClient.get<CertificateView>(`/certificates/course/${courseId}`),
  verify: (code: string) =>
    apiClient.get<CertificateVerifyResult>(`/certificates/verify/${code}`),
};
