'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { enrollmentApi } from '@/lib/api/course.api';
import { chatApi } from '@/lib/api/chat.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CommunityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
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

  const enrollments: any[] = data?.data ?? [];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-300 mx-auto px-6 py-10">
        <h1 className="font-display text-4xl text-ink mb-8">Khóa học của tôi</h1>

        {enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-strong flex items-center justify-center mb-5 text-muted">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <p className="text-muted mb-5 text-base">Bạn chưa đăng ký khóa học nào.</p>
            <Link
              href="/courses"
              className="inline-flex h-10 items-center gap-2 px-5 rounded-pill bg-emphasis text-white text-sm font-medium hover:bg-ink transition-colors"
            >
              Khám phá khóa học
              <ArrowRightIcon />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {enrollments.map((enrollment: any) => {
              const course = enrollment.course;
              const progress = Math.round(enrollment.progressPercent ?? 0);
              const isCompleted = enrollment.status === 'completed';
              const hasStarted = progress > 0;

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
                        <CheckIcon />
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
                    {course?.instructor?.id && (
                      <button
                        onClick={() =>
                          startChatMutation.mutate({
                            instructorId: course.instructor.id,
                          })
                        }
                        disabled={startChatMutation.isPending}
                        className="w-full inline-flex h-9 items-center justify-center gap-1.5 mt-2 rounded-pill border border-hairline-strong text-ink text-sm font-medium hover:bg-surface-strong transition-colors disabled:opacity-50"
                      >
                        <ChatBubbleIcon />
                        Chat với giảng viên
                      </button>
                    )}
                    {course?.slug && (
                      <Link
                        href={`/courses/${course.slug}/community`}
                        className="w-full inline-flex h-9 items-center justify-center gap-1.5 mt-2 rounded-pill border border-hairline-strong text-ink text-sm font-medium hover:bg-surface-strong transition-colors"
                      >
                        <CommunityIcon />
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
