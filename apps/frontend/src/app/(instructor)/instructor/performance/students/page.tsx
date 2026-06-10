'use client';

import { useQuery } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';

export default function StudentsPage() {
  const { data: coursesData, isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.getCourses(),
  });
  const courses: any[] = coursesData?.data?.courses ?? coursesData?.data ?? [];
  const publishedCourses = courses.filter((c: any) => c.status === 'published');
  const totalStudents = courses.reduce((s: number, c: any) => s + (c.totalStudents ?? 0), 0);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Học viên</h1>
        <p className="text-sm text-gray-500">Tổng hợp học viên theo khóa học</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-3xl font-bold text-gray-900">{totalStudents}</p>
          <p className="text-xs text-gray-500 mt-1">Tổng học viên</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-3xl font-bold text-gray-900">{publishedCourses.length}</p>
          <p className="text-xs text-gray-500 mt-1">Khóa học đang hoạt động</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-3xl font-bold text-gray-900">
            {publishedCourses.length > 0 ? Math.round(totalStudents / publishedCourses.length) : 0}
          </p>
          <p className="text-xs text-gray-500 mt-1">Trung bình học viên/khóa</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Học viên theo khóa học</h2>
        </div>
        {courses.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Chưa có khóa học nào</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-120">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Khóa học</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Trạng thái</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500">Học viên</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {courses
                .sort((a: any, b: any) => (b.totalStudents ?? 0) - (a.totalStudents ?? 0))
                .map((course: any) => (
                  <tr key={course.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{course.title}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        course.status === 'published' ? 'bg-green-50 text-green-700' :
                        course.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {course.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">{course.totalStudents ?? 0}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/instructor/courses/${course.id}/manage/curriculum`} className="text-xs text-blue-600 hover:underline">
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
