'use client';

import { useQuery } from '@tanstack/react-query';
import { enrollmentApi } from '@/lib/api/course.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import Link from 'next/link';
import Image from 'next/image';

export default function MyCoursesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: () => enrollmentApi.getMyEnrollments(),
  });

  const enrollments: any[] = data?.data ?? [];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">Khóa học của tôi</h1>

      {enrollments.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">Bạn chưa đăng ký khóa học nào.</p>
          <Link href="/courses" className="text-blue-600 hover:underline">Khám phá khóa học</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {enrollments.map((enrollment: any) => {
            const course = enrollment.course;
            const progress = Math.round(enrollment.progressPercent ?? 0);
            const isCompleted = enrollment.status === 'completed';

            return (
              <div key={enrollment.enrollmentId} className="border rounded-xl overflow-hidden bg-white">
                <div className="relative h-40 bg-gray-100">
                  {course?.thumbnailUrl ? (
                    <Image src={course.thumbnailUrl} alt={course.title} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-400 text-sm">No image</div>
                  )}
                  {isCompleted && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                      Hoàn thành
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 line-clamp-2 mb-3">{course?.title}</h3>
                  <ProgressBar value={progress} className="mb-1" />
                  <p className="text-xs text-gray-500 mb-3">{progress}% hoàn thành</p>
                  <Link
                    href={enrollment.lastLessonId
                      ? `/learn/${enrollment.courseId}/${enrollment.lastLessonId}`
                      : `/learn/${enrollment.courseId}`}
                    className="block text-center text-sm bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
                  >
                    {progress > 0 ? 'Tiếp tục học' : 'Bắt đầu học'}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
