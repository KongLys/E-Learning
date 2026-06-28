// Kiểu dùng chung cho khóa học ở các trang instructor / admin / public / student.
// Các field để optional vì dữ liệu đến từ nhiều endpoint khác nhau.

export type CourseStatus =
  | 'draft'
  | 'pending'
  | 'published'
  | 'rejected'
  | 'archived'
  | (string & {});

export type CourseModerationStatus =
  | 'pending'
  | 'approved'
  | 'appealing'
  | 'rejected'
  | 'locked'
  | (string & {});

export interface InstructorRef {
  id?: string;
  fullName?: string;
  email?: string;
}

export interface CourseSummary {
  id: string;
  title: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  thumbnailUrl?: string | null;
  status?: CourseStatus;
  moderationStatus?: CourseModerationStatus;
  moderationReason?: string;
  price?: number | string;
  discountPrice?: number | string | null;
  level?: string;
  language?: string;
  categoryId?: string;
  category?: { id?: string; name?: string; slug?: string } | null;
  instructor?: InstructorRef | null;
  rating?: number;
  enrollmentCount?: number;
  totalStudents?: number;
  totalLessons?: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface LessonSummary {
  id: string;
  title: string;
  type?: 'video' | 'document' | 'quiz' | (string & {});
  description?: string;
  durationSec?: number;
  moderationStatus?: CourseModerationStatus;
  moderationReason?: string;
  appealReason?: string;
  documentAsset?: {
    fileName?: string;
    fileType?: string;
    fileSize?: number | string;
    pageCount?: number;
    fileUrl?: string;
    contentHtml?: string;
  } | null;
}

export interface SectionSummary {
  id: string;
  title: string;
  lessons?: LessonSummary[];
}

export interface AdminCourseDetail extends CourseSummary {
  rejectionReason?: string;
  moderationReason?: string;
  appealReason?: string;
  sections?: SectionSummary[];
}
