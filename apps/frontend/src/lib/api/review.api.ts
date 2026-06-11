import { apiClient } from './axios';

export type ReviewReportReason =
  | 'inappropriate_harmful'
  | 'inappropriate_other'
  | 'misconduct'
  | 'policy_violation'
  | 'spam'
  | 'inappropriate_ad'
  | 'other';

export interface ReviewUser {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
}

export interface Review {
  id: string;
  rating: number;
  content: string | null;
  createdAt: string;
  student?: ReviewUser;
}

export interface ReviewSummary {
  avg: number;
  total: number;
  distribution: Record<number, number>;
}

export interface CourseReviewsResponse {
  reviews: Review[];
  total: number;
  page: number;
  limit: number;
  summary: ReviewSummary;
}

export const reviewApi = {
  getCourseReviews: (courseId: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<CourseReviewsResponse>(`/courses/${courseId}/reviews`, { params }),
  getMyReview: (courseId: string) =>
    apiClient.get<Review | null>(`/courses/${courseId}/reviews/mine`),
  submitReview: (courseId: string, data: { rating: number; content?: string }) =>
    apiClient.post<Review>(`/courses/${courseId}/reviews`, data),
  deleteMyReview: (courseId: string) =>
    apiClient.delete(`/courses/${courseId}/reviews/mine`),
  reportReview: (reviewId: string, data: { reason: ReviewReportReason; detail?: string }) =>
    apiClient.post(`/reviews/${reviewId}/reports`, data),
};
