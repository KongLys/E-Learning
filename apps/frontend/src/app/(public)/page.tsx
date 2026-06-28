'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { courseApi, enrollmentApi } from '@/lib/api/course.api';
import { CourseGrid } from '@/components/course/CourseGrid';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatVND } from '@/lib/utils';
import { ArrowRight, BookOpen } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useHasHydrated } from '@/lib/hooks/useHasHydrated';
import type { CourseSummary } from '@/types/course';

type EnrolledItem = {
  courseId: string;
  status?: string;
  progressPercent?: number;
  lastLessonId?: string | null;
  course?: CourseSummary | null;
};

function CourseListItem({ course }: { course: CourseSummary }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="flex items-center gap-4 py-4 group hover:bg-canvas-soft -mx-4 px-4 rounded-xl transition-colors"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-strong text-muted group-hover:bg-hairline transition-colors">
        <BookOpen size={16} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-ink truncate group-hover:text-emphasis transition-colors">
          {course.title}
        </p>
        <p className="text-xs text-muted mt-0.5">
          Bởi {course.instructor?.fullName ?? 'Giảng viên'}
          {course.totalLessons ? ` • ${course.totalLessons} bài học` : ''}
        </p>
      </div>
      <div className="shrink-0 text-sm font-semibold">
        {Number(course.price) === 0 ? (
          <span className="text-semantic-success">Miễn phí</span>
        ) : (
          <span className="text-ink">{formatVND(Number(course.price))}</span>
        )}
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { user } = useAuthStore();
  const hasHydrated = useHasHydrated();

  // Cache theo user để tránh phục vụ lại kết quả lấy lúc chưa đăng nhập
  // (chưa lọc khóa đã mua). Chờ hydrate xong mới fetch.
  const userId = user?.id;

  const { data: popularData, isLoading: loadingPopular } = useQuery({
    queryKey: ['courses-popular', userId ?? 'guest'],
    queryFn: () => courseApi.getCourses({ sort: 'popular', limit: 6 }),
    enabled: hasHydrated,
  });

  const { data: newestData, isLoading: loadingNewest } = useQuery({
    queryKey: ['courses-newest', userId ?? 'guest'],
    queryFn: () => courseApi.getCourses({ sort: 'newest', limit: 8 }),
    enabled: hasHydrated,
  });

  const { data: enrollmentsData } = useQuery({
    queryKey: ['my-enrollments-home'],
    queryFn: () => enrollmentApi.getMyEnrollments(),
    enabled: hasHydrated && !!user,
  });

  const enrollments: EnrolledItem[] = enrollmentsData?.data ?? [];
  const hasEnrollments = enrollments.length > 0;

  // Lưới an toàn phía client: loại mọi khóa đã đăng ký khỏi các listing công khai,
  // kể cả khi backend/cache còn độ trễ.
  const enrolledIds = new Set(enrollments.map((e) => e.courseId));
  const notEnrolled = (c: CourseSummary) => !enrolledIds.has(c.id);

  const popular = (popularData?.data?.courses ?? []).filter(notEnrolled).slice(0, 3);
  const newest = (newestData?.data?.courses ?? []).filter(notEnrolled).slice(0, 5);

  // Khóa đang học dở (chưa hoàn thành) → mục "Tiếp tục học".
  const inProgress = enrollments.filter((e) => e.status !== 'completed' && e.course);

  const categoryIds = [...new Set(
    enrollments.map((e) => e.course?.categoryId).filter(Boolean),
  )] as string[];
  const primaryCategoryId = categoryIds[0];

  const { data: recommendedData, isLoading: loadingRecommended } = useQuery({
    queryKey: ['courses-recommended', primaryCategoryId, userId ?? 'guest'],
    queryFn: () => courseApi.getCourses({ categoryId: primaryCategoryId, sort: 'rating', limit: 8 }),
    enabled: !!primaryCategoryId,
  });
  const recommended = (recommendedData?.data?.courses ?? []).filter(notEnrolled).slice(0, 4);

  const isPersonalized = hasHydrated && !!user && hasEnrollments;

  return (
    <div className="flex flex-col">
      {isPersonalized ? (
        <>
          {/* ── Welcome banner ───────────────────────────────── */}
          <section
            className="py-10"
            style={{ background: 'linear-gradient(135deg, var(--color-sky-soft) 0%, var(--color-berry-soft) 55%, var(--color-canvas-soft) 100%)' }}
          >
            <div className="max-w-300 mx-auto px-6 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted mb-1">
                  Chào mừng trở lại
                </p>
                <h1 className="font-display text-3xl text-ink">
                  {user!.fullName}
                </h1>
              </div>
              <Link
                href="/my-courses"
                className="inline-flex h-10 items-center gap-2 px-6 rounded-pill bg-surface-dark text-white text-[14px] font-medium hover:bg-ink transition-colors"
              >
                Tiếp tục học
                <ArrowRight size={13} strokeWidth={2.5} />
              </Link>
            </div>
          </section>

          {/* ── Tiếp tục học ─────────────────────────────────── */}
          {inProgress.length > 0 && (
            <section className="bg-canvas-soft py-16">
              <div className="max-w-300 mx-auto px-6">
                <div className="flex items-end justify-between mb-8">
                  <div>
                    <h2 className="font-display text-3xl text-ink mb-1">Tiếp tục học</h2>
                    <p className="text-sm text-muted">Học tiếp các khóa bạn đang theo dở</p>
                  </div>
                  <Link
                    href="/my-courses"
                    className="text-sm font-medium text-muted hover:text-ink transition-colors underline underline-offset-4"
                  >
                    Xem tất cả
                  </Link>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {inProgress.map((e) => {
                    const course = e.course!;
                    const progress = Math.round(e.progressPercent ?? 0);
                    const hasStarted = progress > 0;
                    return (
                      <div
                        key={e.courseId}
                        className="bg-surface-card rounded-2xl border border-hairline overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-shadow"
                      >
                        <div className="relative h-40 bg-surface-strong">
                          {course.thumbnailUrl ? (
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
                        </div>
                        <div className="p-4">
                          <h3 className="text-[15px] font-semibold text-ink line-clamp-2 mb-4">
                            {course.title}
                          </h3>
                          <ProgressBar value={progress} className="mb-1.5" />
                          <p className="text-xs text-muted mb-4">{progress}% hoàn thành</p>
                          <Link
                            href={
                              e.lastLessonId
                                ? `/learn/${e.courseId}/${e.lastLessonId}`
                                : `/learn/${e.courseId}`
                            }
                            className="w-full inline-flex h-9 items-center justify-center gap-1.5 rounded-pill bg-emphasis text-white text-sm font-medium hover:bg-ink transition-colors"
                          >
                            {hasStarted ? 'Tiếp tục học' : 'Bắt đầu học'}
                            <ArrowRight size={14} />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ── Đề xuất cho bạn ─────────────────────────────── */}
          {primaryCategoryId && (
            <section className="bg-canvas py-16">
              <div className="max-w-300 mx-auto px-6">
                <div className="flex items-end justify-between mb-8">
                  <div>
                    <h2 className="font-display text-3xl text-ink mb-1">Đề xuất cho bạn</h2>
                    <p className="text-sm text-muted">Dựa trên các khóa học bạn đã đăng ký</p>
                  </div>
                  <Link
                    href="/courses?sort=rating"
                    className="text-sm font-medium text-muted hover:text-ink transition-colors underline underline-offset-4"
                  >
                    Xem tất cả
                  </Link>
                </div>
                <CourseGrid courses={recommended} loading={loadingRecommended} columns={4} />
              </div>
            </section>
          )}

          {/* ── Khóa học nổi bật ────────────────────────────── */}
          <section className={primaryCategoryId ? 'bg-canvas-soft py-16' : 'bg-canvas py-16'}>
            <div className="max-w-300 mx-auto px-6">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <h2 className="font-display text-3xl text-ink mb-1">Khóa học nổi bật</h2>
                  <p className="text-sm text-muted">Những nội dung được học viên đánh giá cao nhất</p>
                </div>
                <Link
                  href="/courses?sort=popular"
                  className="text-sm font-medium text-muted hover:text-ink transition-colors underline underline-offset-4"
                >
                  Xem tất cả
                </Link>
              </div>
              <CourseGrid courses={popular} loading={loadingPopular} columns={3} />
            </div>
          </section>

          {/* ── Khóa học mới nhất ───────────────────────────── */}
          <section className={primaryCategoryId ? 'bg-canvas py-16' : 'bg-canvas-soft py-16'}>
            <div className="max-w-300 mx-auto px-6">
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
                <div className="flex flex-col gap-6">
                  <div>
                    <h2 className="font-display text-3xl text-ink mb-2">Khóa học mới nhất</h2>
                    <p className="text-sm text-muted leading-relaxed">
                      Khám phá những tri thức mới nhất vừa được cập nhật trên nền tảng của chúng tôi hàng tuần.
                    </p>
                  </div>
                  <div
                    className="flex-1 min-h-40 rounded-2xl flex items-center justify-center p-8 text-center"
                    style={{ background: 'linear-gradient(135deg, var(--color-sky-soft) 0%, var(--color-berry-soft) 100%)' }}
                  >
                    <p className="font-display text-xl text-emphasis leading-snug">
                      Bắt kịp xu hướng tri thức mới
                    </p>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  {loadingNewest ? (
                    <div className="space-y-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 py-4 animate-pulse">
                          <div className="h-11 w-11 rounded-xl bg-surface-strong shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-surface-strong rounded-lg w-3/4" />
                            <div className="h-3 bg-surface-strong rounded-lg w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : newest.length === 0 ? (
                    <p className="text-sm text-muted py-8 text-center">Chưa có khóa học nào</p>
                  ) : (
                    <div className="divide-y divide-hairline">
                      {newest.map((course: CourseSummary) => (
                        <CourseListItem key={course.id} course={course} />
                      ))}
                    </div>
                  )}
                  <div className="mt-6 text-right">
                    <Link
                      href="/courses?sort=newest"
                      className="text-sm font-medium text-muted hover:text-ink transition-colors underline underline-offset-4"
                    >
                      Xem tất cả
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          {/* ── Hero ─────────────────────────────────────────────── */}
          <section
            className="relative overflow-hidden py-28 md:py-36"
            style={{ background: 'linear-gradient(135deg, var(--color-sky-soft) 0%, var(--color-berry-soft) 55%, var(--color-canvas-soft) 100%)' }}
          >
            <div className="relative max-w-2xl mx-auto px-6 text-center">
              <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted mb-6">
                Kiến tạo tương lai của bạn
              </span>
              <h1 className="font-display text-5xl md:text-6xl text-ink leading-[1.08] mb-6">
                Mở khóa tiềm năng của bạn qua tri thức
              </h1>
              <p className="text-lg text-muted leading-relaxed max-w-lg mx-auto mb-10">
                Trải nghiệm nền tảng học tập trực tuyến thế hệ mới với các khóa học từ những chuyên
                gia hàng đầu, được thiết kế theo phong cách tối giản và tập trung vào hiệu quả.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/courses"
                  className="inline-flex h-14 items-center gap-2 px-7 rounded-pill bg-sky text-white text-lg font-semibold hover:bg-sky-deep transition-colors"
                >
                  Bắt đầu học ngay
                  <ArrowRight size={14} strokeWidth={2.5} />
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-11 items-center px-7 rounded-pill border border-hairline-strong bg-canvas/60 text-ink text-[15px] font-medium hover:bg-surface-card transition-colors"
                >
                  Tìm hiểu thêm
                </Link>
              </div>
            </div>
          </section>

          {/* ── Khóa học nổi bật ────────────────────────────────── */}
          <section className="bg-canvas py-16">
            <div className="max-w-300 mx-auto px-6">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <h2 className="font-display text-3xl text-ink mb-1">Khóa học nổi bật</h2>
                  <p className="text-sm text-muted">Những nội dung được học viên đánh giá cao nhất</p>
                </div>
                <Link
                  href="/courses?sort=popular"
                  className="text-sm font-medium text-muted hover:text-ink transition-colors underline underline-offset-4"
                >
                  Xem tất cả
                </Link>
              </div>
              <CourseGrid courses={popular} loading={loadingPopular} columns={3} />
            </div>
          </section>

          {/* ── Khóa học mới nhất ────────────────────────────────── */}
          <section className="bg-canvas-soft py-16">
            <div className="max-w-300 mx-auto px-6">
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
                <div className="flex flex-col gap-6">
                  <div>
                    <h2 className="font-display text-3xl text-ink mb-2">Khóa học mới nhất</h2>
                    <p className="text-sm text-muted leading-relaxed">
                      Khám phá những tri thức mới nhất vừa được cập nhật trên nền tảng của chúng tôi hàng tuần.
                    </p>
                  </div>
                  <div
                    className="flex-1 min-h-40 rounded-2xl flex items-center justify-center p-8 text-center"
                    style={{ background: 'linear-gradient(135deg, var(--color-sky-soft) 0%, var(--color-berry-soft) 100%)' }}
                  >
                    <p className="font-display text-xl text-emphasis leading-snug">
                      Bắt kịp xu hướng tri thức mới
                    </p>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  {loadingNewest ? (
                    <div className="space-y-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 py-4 animate-pulse">
                          <div className="h-11 w-11 rounded-xl bg-surface-strong shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-surface-strong rounded-lg w-3/4" />
                            <div className="h-3 bg-surface-strong rounded-lg w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : newest.length === 0 ? (
                    <p className="text-sm text-muted py-8 text-center">Chưa có khóa học nào</p>
                  ) : (
                    <div className="divide-y divide-hairline">
                      {newest.map((course: CourseSummary) => (
                        <CourseListItem key={course.id} course={course} />
                      ))}
                    </div>
                  )}
                  <div className="mt-6 text-right">
                    <Link
                      href="/courses?sort=newest"
                      className="text-sm font-medium text-muted hover:text-ink transition-colors underline underline-offset-4"
                    >
                      Xem tất cả
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
