import { apiClient } from './axios';

export const instructorApi = {
  getCourses: () => apiClient.get('/instructor/courses'),
  createCourse: (dto: any) => apiClient.post('/courses', dto),
  updateCourse: (id: string, dto: any) => apiClient.patch(`/courses/${id}`, dto),
  uploadThumbnail: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post(`/courses/${id}/thumbnail`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  publishCourse: (id: string) => apiClient.patch(`/courses/${id}/publish`),
  submitCourse: (id: string) => apiClient.post(`/courses/${id}/submit`),
  unpublishCourse: (id: string) => apiClient.post(`/courses/${id}/unpublish`),
  deleteCourse: (id: string) => apiClient.delete(`/courses/${id}`),
  getCourseById: (id: string) => apiClient.get(`/courses/${id}/manage`),

  // Sections
  getSections: (courseId: string) => apiClient.get(`/courses/${courseId}/sections`),
  addSection: (courseId: string, dto: any) => apiClient.post(`/courses/${courseId}/sections`, dto),
  updateSection: (courseId: string, id: string, dto: any) => apiClient.patch(`/courses/${courseId}/sections/${id}`, dto),
  deleteSection: (courseId: string, id: string) => apiClient.delete(`/courses/${courseId}/sections/${id}`),
  reorderSections: (courseId: string, ids: string[]) => apiClient.patch(`/courses/${courseId}/sections/reorder`, { sectionIds: ids }),

  // Lessons
  addLesson: (sectionId: string, dto: any) => apiClient.post(`/sections/${sectionId}/lessons`, dto),
  reorderLessons: (sectionId: string, ids: string[]) =>
    apiClient.patch(`/sections/${sectionId}/lessons/reorder`, { lessonIds: ids }),
  updateLesson: (id: string, dto: any) => apiClient.patch(`/lessons/${id}`, dto),
  deleteLesson: (id: string) => apiClient.delete(`/lessons/${id}`),
  uploadVideo: (lessonId: string, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append('video', file);
    return apiClient.post(`/lessons/${lessonId}/video`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => { if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100)); },
    });
  },
  uploadDocument: (lessonId: string, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append('document', file);
    return apiClient.post(`/lessons/${lessonId}/document`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => { if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100)); },
    });
  },
  getLesson: (lessonId: string) => apiClient.get(`/lessons/${lessonId}`),
  getVideoUrl: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/video-url`),
  deleteVideo: (lessonId: string) => apiClient.delete(`/lessons/${lessonId}/video`),
  deleteDocument: (lessonId: string) => apiClient.delete(`/lessons/${lessonId}/document`),
  configVideo: (lessonId: string, dto: { completionMode: 'percent_90' | 'ended_autonext' }) =>
    apiClient.post(`/lessons/${lessonId}/video/config`, dto),
  configDocument: (lessonId: string, dto: { contentHtml?: string; minReadTimeSec?: number }) =>
    apiClient.post(`/lessons/${lessonId}/document/config`, dto),
  getQuiz: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/quiz`),
  configQuiz: (lessonId: string, dto: any) => apiClient.post(`/lessons/${lessonId}/quiz/config`, dto),
  addQuizQuestion: (lessonId: string, dto: any) => apiClient.post(`/lessons/${lessonId}/quiz/questions`, dto),
  updateQuizQuestion: (qId: string, dto: any) => apiClient.patch(`/quiz/questions/${qId}`, dto),
  deleteQuizQuestion: (qId: string) => apiClient.delete(`/quiz/questions/${qId}`),

  // Statistics
  getStatsOverview: () => apiClient.get('/instructor/stats/overview'),
  getRevenueChart: (period: '30d' | '90d' | '1y') =>
    apiClient.get(`/instructor/stats/revenue?period=${period}`),
  getCourseStats: (courseId: string) =>
    apiClient.get(`/instructor/courses/${courseId}/stats`),

  // Questions inbox
  getInbox: (courseId: string, status?: string) =>
    apiClient.get(`/instructor/courses/${courseId}/questions`, { params: { status } }),
  replyQuestion: (questionId: string, content: string) =>
    apiClient.post(`/quick-questions/${questionId}/replies`, { content }),
  closeQuestion: (questionId: string) => apiClient.post(`/quick-questions/${questionId}/close`),
};
