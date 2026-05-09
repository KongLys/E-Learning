'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { courseApi, enrollmentApi, orderApi } from '@/lib/api/course.api';
import { useAuthStore } from '@/store/auth.store';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { PriceDisplay } from '@/components/ui/PriceDisplay';
import { formatDuration } from '@/lib/utils';
import { useState } from 'react';

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const [enrollError, setEnrollError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['course', slug],
    queryFn: () => courseApi.getCourseBySlug(slug),
  });

  const { data: enrollData } = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: () => enrollmentApi.getMyEnrollments(),
    enabled: !!user,
  });

  const course = data?.data;
  const enrollments: any[] = enrollData?.data ?? [];
  const isEnrolled = enrollments.some((e: any) => e.courseId === course?.id);

  const enrollMutation = useMutation({
    mutationFn: () => enrollmentApi.enrollFree(course.id),
    onSuccess: () => router.push(`/learn/${course.id}`),
    onError: (err: any) => setEnrollError(err?.response?.data?.message ?? 'Lỗi đăng ký'),
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const key = `${user!.id}-${course.id}-${Date.now()}`;
      const { data: order } = await orderApi.createOrder([course.id], key);
      const returnUrl = `${window.location.origin}/checkout/success`;
      const { data: payment } = await orderApi.initiatePayment(order.orderId, returnUrl);
      window.location.href = payment.paymentUrl;
    },
    onError: (err: any) => setEnrollError(err?.response?.data?.message ?? 'Lỗi thanh toán'),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error || !course) return <ErrorMessage message="Không tìm thấy khóa học" />;

  const isFree = Number(course.price) === 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-6">
          <h1 className="text-3xl font-bold">{course.title}</h1>
          {course.instructor && (
            <p className="text-gray-600">Giảng viên: <strong>{course.instructor.fullName}</strong></p>
          )}
          <p className="text-gray-700 leading-relaxed">{course.description}</p>

          <div className="flex gap-4 text-sm text-gray-500">
            <span>{course.totalLessons} bài học</span>
            <span>{formatDuration(course.totalDurationSec ?? 0)}</span>
            {course.level && <span className="capitalize">{course.level}</span>}
          </div>

          {/* Syllabus */}
          {course.sections?.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-3">Nội dung khóa học</h2>
              <div className="space-y-2">
                {course.sections.map((section: any) => (
                  <details key={section.id} className="border rounded-lg">
                    <summary className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-50">
                      {section.title} ({section.lessons?.length ?? 0} bài)
                    </summary>
                    <ul className="border-t divide-y">
                      {section.lessons?.map((lesson: any) => (
                        <li key={lesson.id} className="px-4 py-2 flex items-center justify-between text-sm">
                          <span className="text-gray-700">{lesson.title}</span>
                          <span className="text-gray-400">
                            {lesson.isPreview ? '▶ Preview' : '🔒'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: CTA */}
        <div className="lg:sticky lg:top-6 self-start border rounded-xl p-6 space-y-4 shadow-sm">
          <PriceDisplay price={Number(course.price)} className="text-2xl" />
          {enrollError && <ErrorMessage message={enrollError} />}

          {!user ? (
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
            >
              Đăng nhập để mua
            </button>
          ) : isEnrolled ? (
            <button
              onClick={() => router.push(`/learn/${course.id}`)}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700"
            >
              Tiếp tục học
            </button>
          ) : isFree ? (
            <button
              onClick={() => enrollMutation.mutate()}
              disabled={enrollMutation.isPending}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {enrollMutation.isPending ? 'Đang đăng ký...' : 'Học miễn phí'}
            </button>
          ) : (
            <button
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
              className="w-full bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50"
            >
              {checkoutMutation.isPending ? 'Đang xử lý...' : `Mua ngay`}
            </button>
          )}

          <div className="text-xs text-gray-500 space-y-1">
            <div>{course.totalLessons} bài học · {formatDuration(course.totalDurationSec ?? 0)}</div>
            <div>{course.totalStudents ?? 0} học viên</div>
          </div>
        </div>
      </div>
    </div>
  );
}
