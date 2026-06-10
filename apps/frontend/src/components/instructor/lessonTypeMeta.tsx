import { Video, FileText, ListChecks, type LucideIcon } from 'lucide-react';

export type LessonType = 'video' | 'document' | 'quiz';

interface LessonTypeMeta {
  label: string;
  Icon: LucideIcon;
}

export const LESSON_TYPE_META: Record<LessonType, LessonTypeMeta> = {
  video: { label: 'Video', Icon: Video },
  document: { label: 'Tài liệu', Icon: FileText },
  quiz: { label: 'Quiz', Icon: ListChecks },
};

export const LESSON_TYPES: LessonType[] = ['video', 'document', 'quiz'];

/** Icon Lucide đồng bộ cho từng loại bài học. */
export function LessonTypeIcon({
  type,
  size = 15,
  className,
}: {
  type: LessonType;
  size?: number;
  className?: string;
}) {
  const { Icon } = LESSON_TYPE_META[type];
  return <Icon size={size} strokeWidth={1.75} className={className} />;
}
