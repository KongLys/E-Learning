// Kiểu dùng chung cho UI quiz (bài kiểm tra) và review quiz (quiz ôn tập AI).

export interface QuizOptionView {
  id: string;
  content: string;
}

export interface QuizQuestionView {
  id: string;
  content: string;
  questionType?: 'single' | 'multiple' | 'true_false' | string;
  options?: QuizOptionView[];
}

export interface QuizView {
  id: string;
  lessonId?: string;
  title?: string;
  passingScore?: number;
  timeLimit?: number;
  maxAttempts?: number;
  lesson?: { title?: string } | null;
  questions?: QuizQuestionView[];
}

export interface QuizResultItem {
  questionId: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface QuizSubmitResult {
  score: number;
  isPassed: boolean;
  results?: QuizResultItem[];
}

export interface QuizAttemptRecord {
  score: number;
  isPassed: boolean;
}

// Kết quả chấm của quiz ôn tập (review quiz).
export interface ReviewResultItem {
  questionId: string;
  isCorrect: boolean;
  correctOptionIds?: string[];
  explanation?: string;
}

export interface ReviewQuizResult {
  score: number;
  correct: number;
  total: number;
  results?: ReviewResultItem[];
}
