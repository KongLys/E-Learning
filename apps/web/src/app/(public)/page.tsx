'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { courseApi } from '@/lib/api/course.api';
import { CourseGrid } from '@/components/course/CourseGrid';

function VideoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="15" height="15" rx="2" />
      <path d="M17 7l5-3v13l-5-3V7z" />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function CommunityIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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

function CourseSection({
  title,
  courses,
  loading,
  href,
  bg = 'bg-canvas',
}: {
  title: string;
  courses: any[];
  loading: boolean;
  href: string;
  bg?: string;
}) {
  return (
    <section className={`${bg} py-16`}>
      <div className="max-w-300 mx-auto px-6">
        <div className="flex items-end justify-between mb-8">
          <h2 className="font-display text-3xl text-ink">{title}</h2>
          <Link
            href={href}
            className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink transition-colors"
          >
            Xem tất cả
            <ArrowRightIcon />
          </Link>
        </div>
        <CourseGrid courses={courses} loading={loading} />
      </div>
    </section>
  );
}

export default function HomePage() {
  const { data: popularData, isLoading: loadingPopular } = useQuery({
    queryKey: ['courses-popular'],
    queryFn: () => courseApi.getCourses({ sort: 'popular', limit: 6 }),
  });

  const { data: newestData, isLoading: loadingNewest } = useQuery({
    queryKey: ['courses-newest'],
    queryFn: () => courseApi.getCourses({ sort: 'newest', limit: 6 }),
  });

  const { data: freeData, isLoading: loadingFree } = useQuery({
    queryKey: ['courses-free'],
    queryFn: () => courseApi.getCourses({ price: 'free' as any, limit: 6 }),
  });

  const popular = popularData?.data?.courses ?? [];
  const newest = newestData?.data?.courses ?? [];
  const free = freeData?.data?.courses ?? [];

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-canvas py-24 md:py-32">
        {/* Atmospheric gradient orbs — decoration only */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="h-120 w-120 rounded-full opacity-40"
            style={{ background: 'radial-gradient(ellipse at center, #a7e5d3 0%, transparent 70%)' }}
          />
        </div>
        <div className="pointer-events-none absolute top-0 right-1/4 opacity-20">
          <div
            className="h-72 w-72 rounded-full"
            style={{ background: 'radial-gradient(ellipse at center, #c8b8e0 0%, transparent 70%)' }}
          />
        </div>
        <div className="pointer-events-none absolute bottom-0 left-1/4 opacity-20">
          <div
            className="h-64 w-64 rounded-full"
            style={{ background: 'radial-gradient(ellipse at center, #f4c5a8 0%, transparent 70%)' }}
          />
        </div>

        <div className="relative max-w-300 mx-auto px-6 text-center">
          <span className="inline-flex items-center px-3 py-1 rounded-pill bg-surface-strong text-xs font-semibold uppercase tracking-widest text-muted mb-8">
            Nền tảng học trực tuyến
          </span>
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl text-ink leading-[1.05] mb-6">
            Học online cùng ELearn
          </h1>
          <p className="text-base md:text-lg text-muted leading-relaxed max-w-xl mx-auto mb-10">
            Hàng trăm khóa học chất lượng cao từ các chuyên gia hàng đầu.
            Học mọi lúc, mọi nơi, theo nhịp của bạn.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/courses"
              className="inline-flex h-11 items-center px-6 rounded-pill bg-emphasis text-white text-[15px] font-medium hover:bg-ink transition-colors"
            >
              Khám phá khóa học
            </Link>
            <Link
              href="/register"
              className="inline-flex h-11 items-center px-6 rounded-pill border border-hairline-strong text-ink text-[15px] font-medium hover:bg-surface-strong transition-colors"
            >
              Đăng ký miễn phí
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-canvas-soft py-16">
        <div className="max-w-300 mx-auto px-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {[
              {
                icon: <VideoIcon />,
                title: 'Video chất lượng cao',
                desc: 'Nội dung được quay và dựng chuyên nghiệp, phát trực tuyến mượt mà trên mọi thiết bị.',
              },
              {
                icon: <QuizIcon />,
                title: 'Quiz tương tác',
                desc: 'Kiểm tra kiến thức sau mỗi bài học với hệ thống bài tập và quiz đa dạng.',
              },
              {
                icon: <CommunityIcon />,
                title: 'Hỏi đáp trực tiếp',
                desc: 'Đặt câu hỏi và nhận phản hồi từ giảng viên và cộng đồng học viên.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-surface-card rounded-2xl p-6 border border-hairline hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] transition-shadow"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-strong text-muted mb-4">
                  {f.icon}
                </div>
                <h3 className="text-[15px] font-semibold text-ink mb-2">{f.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular courses */}
      <CourseSection
        title="Khóa học phổ biến"
        courses={popular}
        loading={loadingPopular}
        href="/courses?sort=popular"
        bg="bg-canvas"
      />

      {/* Newest courses */}
      <CourseSection
        title="Mới thêm gần đây"
        courses={newest}
        loading={loadingNewest}
        href="/courses?sort=newest"
        bg="bg-canvas-soft"
      />

      {/* Free courses — only shown when there's data */}
      {(free.length > 0 || loadingFree) && (
        <CourseSection
          title="Học miễn phí"
          courses={free}
          loading={loadingFree}
          href="/courses?price=free"
          bg="bg-canvas"
        />
      )}

      {/* CTA band */}
      <section className="bg-surface-dark py-24">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-display text-4xl md:text-5xl text-white mb-6">
            Bắt đầu hành trình học ngay hôm nay
          </h2>
          <p className="text-base text-white/60 mb-10">
            Tham gia cùng hàng nghìn học viên đang học trên ELearn.
          </p>
          <Link
            href="/register"
            className="inline-flex h-11 items-center px-8 rounded-pill bg-white text-ink text-[15px] font-medium hover:bg-canvas transition-colors"
          >
            Tạo tài khoản miễn phí
          </Link>
        </div>
      </section>
    </div>
  );
}
