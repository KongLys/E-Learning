import { apiClient } from './axios';

/** Một lần làm bài kiểm tra (graded) của học viên. */
export interface QuizAttemptSummary {
  id: string;
  quizLessonId: string;
  studentId: string;
  score: number;
  isPassed: boolean;
  startedAt: string;
}

/** Tóm tắt quiz ôn tập (theo bài) đã tạo trong khoá. */
export interface ReviewQuizSummary {
  lessonId: string;
  lessonTitle: string;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export type AiAssetStatus = 'pending' | 'processing' | 'ready' | 'failed';

/** Giọng đọc (TTS) tự sinh của bài đọc. */
export interface NarrationData {
  status: AiAssetStatus;
  audioUrl: string | null;
  durationSec: number;
  errorMsg?: string | null;
  updatedAt: string;
}

/** Video ngắn do AI tạo cho bài đọc. */
export interface AiVideoData {
  status: AiAssetStatus;
  videoUrl: string | null;
  durationSec: number;
  sections: { title: string; startSec: number; endSec: number }[];
  errorMsg?: string | null;
  updatedAt: string;
}

export const learnApi = {
  getLessonDetail: (lessonId: string) => apiClient.get(`/lessons/${lessonId}`),
  getVideoUrl: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/video-url`),
  getTranscript: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/transcript`),
  getDocumentUrl: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/document-url`),
  getQuiz: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/quiz`),
  getCourseProgress: (courseId: string) => apiClient.get(`/enrollments/${courseId}/progress`),
  getCourseSections: (courseId: string) => apiClient.get(`/courses/${courseId}/sections`),
  updateProgress: (lessonId: string, lastPositionSec: number, watchTimeSec: number) =>
    apiClient.patch('/progress', { lessonId, lastPositionSec, watchTimeSec }),
  markComplete: (lessonId: string) => apiClient.post('/progress/complete', { lessonId }),
  submitQuiz: (quizLessonId: string, answers: { questionId: string; optionIds: string[] }[]) =>
    apiClient.post(`/quiz/${quizLessonId}/attempts`, { answers }),
  // Lịch sử các lần làm bài kiểm tra của học viên (mới nhất trước)
  getQuizAttempts: (quizLessonId: string) =>
    apiClient.get<QuizAttemptSummary[]>(`/quiz/${quizLessonId}/attempts`),
  // Quiz ôn tập (AI) — tạo theo yêu cầu, không tính vào tiến độ khoá học
  getReviewQuiz: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/review-quiz`),
  generateReviewQuiz: (lessonId: string) => apiClient.post(`/lessons/${lessonId}/review-quiz`),
  // Danh sách quiz ôn tập (theo bài) đã tạo trong khoá — để xem lại trong sidebar
  listReviewQuizzes: (courseId: string) =>
    apiClient.get<ReviewQuizSummary[]>(`/courses/${courseId}/review-quizzes`),
  submitReviewQuiz: (lessonId: string, answers: { questionId: string; optionIds: string[] }[]) =>
    apiClient.post(`/lessons/${lessonId}/review-quiz/attempts`, { answers }),
  // Giọng đọc (TTS) tự sinh khi khóa được duyệt — đọc trung thực nội dung bài đọc
  getNarration: (lessonId: string) =>
    apiClient.get<NarrationData | null>(`/lessons/${lessonId}/narration`),
  // Video ngắn do AI tạo (tự sinh khi khóa được duyệt) — tùy chọn xem
  getAiVideo: (lessonId: string) =>
    apiClient.get<AiVideoData | null>(`/lessons/${lessonId}/ai-video`),
  // Tài liệu tham khảo + tài liệu toàn khóa (sidebar khung chương trình)
  getReferenceMaterials: (courseId: string) =>
    apiClient.get(`/courses/${courseId}/reference-materials`),
  getReferenceMaterialUrl: (id: string) =>
    apiClient.get(`/reference-materials/${id}/url`),
  getCourseLessonFiles: (courseId: string) =>
    apiClient.get(`/courses/${courseId}/lesson-files`),
  getNotes: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/notes`),
  createNote: (lessonId: string, content: string, positionType: string, positionValue: number) =>
    apiClient.post('/notes', { lessonId, content, positionType, positionValue }),
  updateNote: (id: string, content: string) => apiClient.patch(`/notes/${id}`, { content }),
  deleteNote: (id: string) => apiClient.delete(`/notes/${id}`),
  getQuestions: (lessonId: string) => apiClient.get(`/lessons/${lessonId}/quick-questions`),
  createQuestion: (lessonId: string, content: string, positionType: string, positionValue: number, isPublic = true) =>
    apiClient.post('/quick-questions', { lessonId, content, positionType, positionValue, isPublic }),
};
