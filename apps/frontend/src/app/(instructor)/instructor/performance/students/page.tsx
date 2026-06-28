'use client';

import { useQuery } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';
import type { CourseSummary } from '@/types/course';

export default function StudentsPage() {
  const { data: coursesData, isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.getCourses(),
  });
  const courses: CourseSummary[] = coursesData?.data?.courses ?? coursesData?.data ?? [];
  const publishedCourses = courses.filter((c) => c.status === 'published');
  const totalStudents = courses.reduce((s, c) => s + (c.totalStudents ?? 0), 0);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-1">Học viên</h1>
        <p className="text-sm text-muted">Tổng hợp học viên theo khóa học</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-surface-card rounded-card border border-hairline p-5">
          <p className="text-3xl font-bold text-ink">{totalStudents}</p>
          <p className="text-xs text-muted mt-1">Tổng học viên</p>
        </div>
        <div className="bg-surface-card rounded-card border border-hairline p-5">
          <p className="text-3xl font-bold text-ink">{publishedCourses.length}</p>
          <p className="text-xs text-muted mt-1">Khóa học đang hoạt động</p>
        </div>
        <div className="bg-surface-card rounded-card border border-hairline p-5">
          <p className="text-3xl font-bold text-ink">
            {publishedCourses.length > 0 ? Math.round(totalStudents / publishedCourses.length) : 0}
          </p>
          <p className="text-xs text-muted mt-1">Trung bình học viên/khóa</p>
        </div>
      </div>

      <div className="bg-surface-card rounded-card border border-hairline overflow-hidden">
        <div className="px-5 py-4 border-b border-hairline">
          <h2 className="text-base font-semibold text-ink">Học viên theo khóa học</h2>
        </div>
        {courses.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">Chưa có khóa học nào</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-120">
            <thead className="bg-canvas-soft border-b border-hairline">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted">Khóa học</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted">Trạng thái</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted">Học viên</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {courses
                .sort((a, b) => (b.totalStudents ?? 0) - (a.totalStudents ?? 0))
                .map((course) => (
                  <tr key={course.id} className="hover:bg-canvas-soft">
                    <td className="px-5 py-3 font-medium text-ink">{course.title}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        course.status === 'published' ? 'bg-leaf-soft text-leaf-deep' :
                        course.status === 'pending' ? 'bg-sun-soft text-sun-deep' :
                        'bg-surface-strong text-ink-mute'
                      }`}>
                        {course.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-ink">{course.totalStudents ?? 0}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/instructor/courses/${course.id}/manage/curriculum`} className="text-xs text-sky hover:underline">
                        Xem
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
