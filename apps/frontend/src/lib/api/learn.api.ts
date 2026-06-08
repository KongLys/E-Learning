import { apiClient } from './axios';

export const learnApi = {
  getLessonDetail: (lessonId: string) => apiClient.get(`/lessons/${lessonId}`),
  getVideoUrl: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/video-url`),
  getDocumentUrl: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/document-url`),
  getQuiz: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/quiz`),
  getCourseProgress: (courseId: string) => apiClient.get(`/enrollments/${courseId}/progress`),
  getCourseSections: (courseId: string) => apiClient.get(`/courses/${courseId}/sections`),
  updateProgress: (lessonId: string, lastPositionSec: number, watchTimeSec: number) =>
    apiClient.patch('/progress', { lessonId, lastPositionSec, watchTimeSec }),
  markComplete: (lessonId: string) => apiClient.post('/progress/complete', { lessonId }),
  submitQuiz: (quizLessonId: string, answers: { questionId: string; optionIds: string[] }[]) =>
    apiClient.post(`/quiz/${quizLessonId}/attempts`, { answers }),
  getNotes: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/notes`),
  createNote: (lessonId: string, content: string, positionType: string, positionValue: number) =>
    apiClient.post('/notes', { lessonId, content, positionType, positionValue }),
  updateNote: (id: string, content: string) => apiClient.patch(`/notes/${id}`, { content }),
  deleteNote: (id: string) => apiClient.delete(`/notes/${id}`),
  getQuestions: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/quick-questions`),
  createQuestion: (lessonId: string, content: string, positionType: string, positionValue: number, isPublic = true) =>
    apiClient.post('/quick-questions', { lessonId, content, positionType, positionValue, isPublic }),
};
