'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { enrollmentApi } from '@/lib/api/course.api';
import { chatApi } from '@/lib/api/chat.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Award, ArrowRight, BookOpen, Check, MessageSquare, Users } from 'lucide-react';
import type { CourseSummary } from '@/types/course';

interface Enrollment {
  enrollmentId: string;
  courseId: string;
  status?: string;
  progressPercent?: number;
  lastLessonId?: string | null;
  course?: CourseSummary | null;
}

export default function MyCoursesPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: () => enrollmentApi.getMyEnrollments(),
  });

  const startChatMutation = useMutation({
    mutationFn: ({ instructorId }: { instructorId: string }) =>
      chatApi.createConversation(instructorId),
    onSuccess: () => {
      router.push('/chat');
    },
  });

  const enrollments: Enrollment[] = data?.data ?? [];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-300 mx-auto px-6 py-10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <h1 className="font-display text-4xl text-ink">Khóa học của tôi</h1>
          <Link
            href="/certificates"
            className="inline-flex h-9 items-center gap-1.5 px-4 rounded-pill border border-hairline-strong text-ink text-sm font-medium hover:bg-surface-strong transition-colors shrink-0"
          >
            <Award size={15} />
            Chứng chỉ của tôi
          </Link>
        </div>

        {enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-strong flex items-center justify-center mb-5 text-muted">
              <BookOpen size={24} strokeWidth={1.5} />
            </div>
            <p className="text-muted mb-5 text-base">Bạn chưa đăng ký khóa học nào.</p>
            <Link
              href="/courses"
              className="inline-flex h-10 items-center gap-2 px-5 rounded-pill bg-emphasis text-white text-sm font-medium hover:bg-ink transition-colors"
            >
              Khám phá khóa học
              <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {enrollments.map((enrollment) => {
              const course = enrollment.course;
              const progress = Math.round(enrollment.progressPercent ?? 0);
              const isCompleted = enrollment.status === 'completed';
              const hasStarted = progress > 0;
              // Chỉ khóa trả phí mới có chứng chỉ.
              const hasCertificate = isCompleted && Number(course?.price) > 0;

              return (
                <div
                  key={enrollment.enrollmentId}
                  className="bg-surface-card rounded-2xl border border-hairline overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-shadow"
                >
                  <div className="relative h-40 bg-surface-strong">
                    {course?.thumbnailUrl ? (
                      <Image
                        src={course.thumbnailUrl}
                        alt={course.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-soft text-sm">
                        Chưa có ảnh
                      </div>
                    )}
                    {isCompleted && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-pill bg-semantic-success text-white text-xs font-semibold">
                        <Check size={12} strokeWidth={2.5} />
                        Hoàn thành
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="text-[15px] font-semibold text-ink line-clamp-2 mb-4">
                      {course?.title}
                    </h3>
                    <ProgressBar value={progress} className="mb-1.5" />
                    <p className="text-xs text-muted mb-4">{progress}% hoàn thành</p>
                    <Link
                      href={
                        enrollment.lastLessonId
                          ? `/learn/${enrollment.courseId}/${enrollment.lastLessonId}`
                          : `/learn/${enrollment.courseId}`
                      }
                      className="w-full inline-flex h-9 items-center justify-center rounded-pill bg-emphasis text-white text-sm font-medium hover:bg-ink transition-colors"
                    >
                      {hasStarted ? 'Tiếp tục học' : 'Bắt đầu học'}
                    </Link>
                    {hasCertificate && (
                      <Link
                        href={`/certificates?courseId=${enrollment.courseId}`}
                        className="w-full inline-flex h-9 items-center justify-center gap-1.5 mt-2 rounded-pill bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
                      >
                        <Award size={14} />
                        Xem chứng chỉ
                      </Link>
                    )}
                    {course?.instructor?.id && (
                      <button
                        onClick={() =>
                          startChatMutation.mutate({
                            instructorId: course!.instructor!.id!,
                          })
                        }
                        disabled={startChatMutation.isPending}
                        className="w-full inline-flex h-9 items-center justify-center gap-1.5 mt-2 rounded-pill border border-hairline-strong text-ink text-sm font-medium hover:bg-surface-strong transition-colors disabled:opacity-50"
                      >
                        <MessageSquare size={14} />
                        Chat với giảng viên
                      </button>
                    )}
                    {course?.slug && (
                      <Link
                        href={`/courses/${course.slug}/community`}
                        className="w-full inline-flex h-9 items-center justify-center gap-1.5 mt-2 rounded-pill border border-hairline-strong text-ink text-sm font-medium hover:bg-surface-strong transition-colors"
                      >
                        <Users size={14} />
                        Cộng đồng
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
