'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { courseApi } from '@/lib/api/course.api';
import { CourseGrid } from '@/components/course/CourseGrid';
import { formatVND } from '@/lib/utils';

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function CourseListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function CourseListItem({ course }: { course: any }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="flex items-center gap-4 py-4 group hover:bg-canvas-soft -mx-4 px-4 rounded-xl transition-colors"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-strong text-muted group-hover:bg-hairline transition-colors">
        <CourseListIcon />
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
  const { data: popularData, isLoading: loadingPopular } = useQuery({
    queryKey: ['courses-popular'],
    queryFn: () => courseApi.getCourses({ sort: 'popular', limit: 3 }),
  });

  const { data: newestData, isLoading: loadingNewest } = useQuery({
    queryKey: ['courses-newest'],
    queryFn: () => courseApi.getCourses({ sort: 'newest', limit: 5 }),
  });

  const popular = popularData?.data?.courses ?? [];
  const newest = newestData?.data?.courses ?? [];

  return (
    <div className="flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden py-28 md:py-36"
        style={{ background: 'linear-gradient(135deg, #cdd3ef 0%, #eec8b4 55%, #f5f5f5 100%)' }}
      >
        <div className="relative max-w-2xl mx-auto px-6 text-center">
          <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted mb-6">
            Kiến tạo tương lai của bạn
          </span>
          <h1 className="font-display text-5xl md:text-6xl text-ink leading-[1.08] mb-6">
            Mở khóa tiềm năng của bạn qua tri thức
          </h1>
          <p className="text-base md:text-lg text-muted leading-relaxed max-w-lg mx-auto mb-10">
            Trải nghiệm nền tảng học tập trực tuyến thế hệ mới với các khóa học từ những chuyên
            gia hàng đầu, được thiết kế theo phong cách tối giản và tập trung vào hiệu quả.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/courses"
              className="inline-flex h-11 items-center gap-2 px-7 rounded-pill bg-surface-dark text-white text-[15px] font-medium hover:bg-ink transition-colors"
            >
              Bắt đầu học ngay
              <ArrowRightIcon />
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
            {/* Left editorial */}
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="font-display text-3xl text-ink mb-2">Khóa học mới nhất</h2>
                <p className="text-sm text-muted leading-relaxed">
                  Khám phá những tri thức mới nhất vừa được cập nhật trên nền tảng của chúng tôi hàng tuần.
                </p>
              </div>
              <div
                className="flex-1 min-h-40 rounded-2xl flex items-center justify-center p-8 text-center"
                style={{ background: 'linear-gradient(135deg, #e6e0f5 0%, #d8d0ee 100%)' }}
              >
                <p className="font-display text-xl text-emphasis leading-snug">
                  Bắt kịp xu hướng tri thức mới
                </p>
              </div>
            </div>

            {/* Right list */}
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
                  {newest.map((course: any) => (
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
    </div>
  );
}
