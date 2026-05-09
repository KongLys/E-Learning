'use client';

import { useQuery } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';

export default function InstructorDashboardPage() {
  const { data: coursesData, isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.getCourses(),
  });

  const courses: any[] = coursesData?.data?.courses ?? coursesData?.data ?? [];

  if (isLoading) return <LoadingSpinner />;

  const published = courses.filter((c: any) => c.status === 'published').length;
  const pending = courses.filter((c: any) => c.status === 'pending').length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <h1 className="text-2xl font-bold">Trang giảng viên</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Tổng khóa học', value: courses.length },
          { label: 'Đã xuất bản', value: published },
          { label: 'Chờ duyệt', value: pending },
          { label: 'Tổng học viên', value: courses.reduce((s: number, c: any) => s + (c.totalStudents ?? 0), 0) },
        ].map((stat) => (
          <div key={stat.label} className="border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Recent courses */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Khóa học gần đây</h2>
          <Link href="/instructor/courses" className="text-sm text-blue-600 hover:underline">Xem tất cả</Link>
        </div>
        {courses.slice(0, 3).map((course: any) => (
          <div key={course.id} className="flex items-center justify-between border-b py-3 last:border-0">
            <div>
              <p className="font-medium text-sm">{course.title}</p>
              <p className="text-xs text-gray-400">{course.status}</p>
            </div>
            <Link href={`/instructor/courses/${course.id}/edit`} className="text-xs text-blue-600 hover:underline">Sửa</Link>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        <Link href="/instructor/courses/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Tạo khóa học mới
        </Link>
        <Link href="/instructor/questions" className="border px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
          Inbox câu hỏi
        </Link>
      </div>
    </div>
  );
}
