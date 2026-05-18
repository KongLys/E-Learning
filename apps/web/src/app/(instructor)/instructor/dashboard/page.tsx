'use client';

import { useQuery } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
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

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  published: 'Đã xuất bản',
  rejected: 'Bị từ chối',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-muted bg-surface-strong',
  pending: 'text-amber-600 bg-amber-50',
  published: 'text-semantic-success bg-green-50',
  rejected: 'text-semantic-error bg-red-50',
};

export default function InstructorDashboardPage() {
  const { data: coursesData, isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.getCourses(),
  });

  const courses: any[] = coursesData?.data?.courses ?? coursesData?.data ?? [];

  if (isLoading) return <LoadingSpinner />;

  const published = courses.filter((c: any) => c.status === 'published').length;
  const pending = courses.filter((c: any) => c.status === 'pending').length;
  const totalStudents = courses.reduce((s: number, c: any) => s + (c.totalStudents ?? 0), 0);

  const stats = [
    { label: 'Tổng khóa học', value: courses.length },
    { label: 'Đã xuất bản', value: published },
    { label: 'Chờ duyệt', value: pending },
    { label: 'Tổng học viên', value: totalStudents },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-300 mx-auto px-6 py-10 space-y-10">
        <div>
          <h1 className="font-display text-4xl text-ink mb-1">Trang giảng viên</h1>
          <p className="text-sm text-muted">Quản lý khóa học và theo dõi học viên của bạn</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-surface-card rounded-2xl border border-hairline p-5 text-center"
            >
              <p className="font-display text-3xl text-ink mb-1">{stat.value}</p>
              <p className="text-xs text-muted">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Recent courses */}
        <div className="bg-surface-card rounded-2xl border border-hairline overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
            <h2 className="text-[15px] font-semibold text-ink">Khóa học gần đây</h2>
            <Link
              href="/instructor/courses"
              className="flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
            >
              Xem tất cả
              <ArrowRightIcon />
            </Link>
          </div>
          <div className="divide-y divide-hairline">
            {courses.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Chưa có khóa học nào</p>
            ) : (
              courses.slice(0, 5).map((course: any) => (
                <div key={course.id} className="flex items-center justify-between px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{course.title}</p>
                    <span
                      className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-pill text-xs font-medium ${STATUS_COLORS[course.status] ?? 'text-muted bg-surface-strong'}`}
                    >
                      {STATUS_LABELS[course.status] ?? course.status}
                    </span>
                  </div>
                  <Link
                    href={`/instructor/courses/${course.id}/edit`}
                    className="ml-4 text-sm text-muted hover:text-ink transition-colors shrink-0"
                  >
                    Chỉnh sửa
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/instructor/courses/new"
            className="inline-flex h-10 items-center gap-2 px-5 rounded-pill bg-emphasis text-white text-sm font-medium hover:bg-ink transition-colors"
          >
            <PlusIcon />
            Tạo khóa học mới
          </Link>
          <Link
            href="/instructor/questions"
            className="inline-flex h-10 items-center px-5 rounded-pill border border-hairline-strong text-ink text-sm font-medium hover:bg-surface-strong transition-colors"
          >
            Câu hỏi học viên
          </Link>
          <Link
            href="/instructor/statistics"
            className="inline-flex h-10 items-center px-5 rounded-pill border border-hairline-strong text-ink text-sm font-medium hover:bg-surface-strong transition-colors"
          >
            Thống kê
          </Link>
        </div>
      </div>
    </div>
  );
}
