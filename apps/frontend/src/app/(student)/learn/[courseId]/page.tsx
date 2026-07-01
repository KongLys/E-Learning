'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';
import { apiClient } from '@/lib/api/axios';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';

interface SectionLessonLite {
  id: string;
  orderIndex: number;
  isFinalQuiz?: boolean;
}
interface SectionLite {
  lessons?: SectionLessonLite[];
}

export default function LearnCoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();

  const { data: progressData, isLoading: progressLoading } = useQuery({
    queryKey: ['course-progress', courseId],
    queryFn: () => learnApi.getCourseProgress(courseId),
  });

  const lastLessonId = progressData?.data?.lastLessonId;

  const { data: sectionsData, isLoading: sectionsLoading } = useQuery({
    queryKey: ['course-sections', courseId],
    // Return the array body so this cache entry has a consistent shape across
    // all pages that share this query key (lesson page + AI chat page).
    queryFn: async () => (await apiClient.get(`/courses/${courseId}/sections`)).data,
    enabled: !progressLoading && !lastLessonId,
  });

  useEffect(() => {
    if (progressLoading) return;

    if (lastLessonId) {
      router.replace(`/learn/${courseId}/${lastLessonId}`);
      return;
    }

    if (sectionsLoading || !sectionsData) return;

    const sections: SectionLite[] = sectionsData ?? [];
    // Backend đã trả sections/lessons đúng thứ tự (bài kiểm tra cuối khóa luôn ở
    // cuối). Giữ nguyên thứ tự đó và bỏ qua bài final quiz để lần đầu vào khóa
    // luôn mở bài học đầu tiên, không nhảy vào quiz kiểm tra cuối khóa.
    const firstLesson = sections
      .flatMap((s) => s.lessons ?? [])
      .find((l) => !l.isFinalQuiz);

    if (firstLesson) {
      router.replace(`/learn/${courseId}/${firstLesson.id}`);
    }
  }, [progressLoading, lastLessonId, sectionsLoading, sectionsData, courseId, router]);

  const sections: SectionLite[] = sectionsData ?? [];
  const hasLessons = sections.some((s) => (s.lessons?.length ?? 0) > 0);
  const isLoading = progressLoading || sectionsLoading;

  if (!isLoading && !lastLessonId && !hasLessons) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ErrorMessage message="Khóa học chưa có bài học nào." />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <LoadingSpinner />
    </div>
  );
}
