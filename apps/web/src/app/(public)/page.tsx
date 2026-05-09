'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { courseApi } from '@/lib/api/course.api';
import { CourseGrid } from '@/components/course/CourseGrid';

export default function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['featured-courses'],
    queryFn: () => courseApi.getCourses({ sort: 'popular', limit: 8 }),
  });

  const courses = data?.data?.courses ?? [];

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">Học online cùng ELearn</h1>
          <p className="text-blue-100 text-lg mb-8">
            Hàng trăm khóa học chất lượng cao từ các chuyên gia hàng đầu
          </p>
          <Link
            href="/courses"
            className="inline-block bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50"
          >
            Khám phá khóa học
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-12 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto grid grid-cols-1 gap-6 sm:grid-cols-3 text-center">
          {[
            { icon: '🎥', title: 'Video chất lượng cao', desc: 'Nội dung được quay và dựng chuyên nghiệp' },
            { icon: '📝', title: 'Quiz tương tác', desc: 'Kiểm tra kiến thức sau mỗi bài học' },
            { icon: '💬', title: 'Hỏi đáp trực tiếp', desc: 'Đặt câu hỏi, nhận trả lời từ giảng viên' },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-xl p-6 border">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured courses */}
      <section className="py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">Khóa học nổi bật</h2>
          <CourseGrid courses={courses} loading={isLoading} />
          <div className="text-center mt-8">
            <Link href="/courses" className="text-blue-600 font-medium hover:underline">
              Xem tất cả khóa học →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
