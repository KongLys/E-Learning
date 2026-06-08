'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import {
  moderationApi,
  MODERATION_COLORS,
  MODERATION_LABELS,
  type ModerationStatus,
} from '@/lib/api/ai.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { PriceDisplay } from '@/components/ui/PriceDisplay';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-700',
  published: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  archived: 'bg-gray-200 text-gray-500',
};

export default function InstructorCoursesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.getCourses(),
  });

  const appealMutation = useMutation({
    mutationFn: (courseId: string) => moderationApi.appealCourse(courseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructor-courses'] }),
    onError: (err: { response?: { data?: { message?: string } } }) =>
      alert(err?.response?.data?.message ?? 'Gửi kiến nghị thất bại'),
  });

  const courses: any[] = data?.data?.courses ?? data?.data ?? [];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Khóa học của tôi</h1>
        <Link
          href="/instructor/courses/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Tạo khóa học mới
        </Link>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="mb-4">Bạn chưa có khóa học nào.</p>
          <Link href="/instructor/courses/new" className="text-blue-600 hover:underline">Tạo khóa học đầu tiên</Link>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Khóa học</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Kiểm duyệt</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Giá</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {courses.map((course: any) => (
                <tr key={course.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{course.title}</p>
                    <p className="text-xs text-gray-400">{course.totalLessons ?? 0} bài học</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[course.status] ?? 'bg-gray-100'}`}>
                      {course.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {course.moderationStatus && course.moderationStatus !== 'approved' ? (
                      <span
                        title={course.moderationReason ?? ''}
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${MODERATION_COLORS[course.moderationStatus as ModerationStatus]}`}
                      >
                        {MODERATION_LABELS[course.moderationStatus as ModerationStatus]}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PriceDisplay price={Number(course.price)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {course.moderationStatus === 'rejected' && (
                      <button
                        onClick={() => {
                          if (confirm(`Gửi kiến nghị duyệt lại khóa học "${course.title}"?`))
                            appealMutation.mutate(course.id);
                        }}
                        disabled={appealMutation.isPending}
                        className="text-amber-600 hover:underline text-xs mr-3 disabled:opacity-50"
                      >
                        Kiến nghị
                      </button>
                    )}
                    <Link href={`/instructor/courses/${course.id}/edit`} className="text-blue-600 hover:underline text-xs mr-3">Sửa</Link>
                    <Link href={`/courses/${course.slug}`} className="text-gray-500 hover:text-gray-700 text-xs">Xem</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
