import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { formatVND } from '@/lib/utils';

export interface CourseCardData {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl?: string;
  instructor?: { fullName: string };
  price: number;
  totalLessons?: number;
  totalDurationSec?: number;
  level?: string;
  averageRating?: number;
  totalStudents?: number;
  category?: { name: string };
}

export function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group block bg-surface-card rounded-2xl border border-hairline overflow-hidden hover:shadow-[0_6px_24px_rgba(0,0,0,0.08)] transition-shadow"
    >
      <div className="relative h-48 bg-surface-strong">
        {course.thumbnailUrl ? (
          <Image src={course.thumbnailUrl} alt={course.title} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-soft text-sm">
            Chưa có ảnh
          </div>
        )}
        {course.category && (
          <span className="absolute top-3 right-3 inline-flex items-center px-2.5 py-1 rounded-full bg-surface-dark/80 backdrop-blur-sm text-xs font-medium text-white">
            {course.category.name}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="text-[15px] font-semibold text-ink line-clamp-2 mb-1.5 group-hover:text-emphasis transition-colors">
          {course.title}
        </h3>
        {course.instructor && (
          <p className="text-xs text-muted mb-3">Giảng viên: {course.instructor.fullName}</p>
        )}
        <div className="flex items-center justify-between pt-3 border-t border-hairline-soft">
          <span className="text-sm font-semibold">
            {course.price === 0 ? (
              <span className="text-semantic-success">Miễn phí</span>
            ) : (
              <span className="text-ink">{formatVND(course.price)}</span>
            )}
          </span>
          {course.averageRating !== undefined && (
            <span className="flex items-center gap-1 text-sm">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              <span className="font-medium text-ink">{course.averageRating.toFixed(1)}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
