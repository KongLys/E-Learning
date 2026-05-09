import Link from 'next/link';
import Image from 'next/image';
import { StarRating } from '@/components/ui/StarRating';
import { PriceDisplay } from '@/components/ui/PriceDisplay';
import { formatDuration } from '@/lib/utils';

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
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

export function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group block bg-surface-card rounded-2xl border border-hairline overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-shadow"
    >
      <div className="relative h-44 bg-surface-strong">
        {course.thumbnailUrl ? (
          <Image src={course.thumbnailUrl} alt={course.title} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-soft text-sm">
            Chưa có ảnh
          </div>
        )}
        {course.level && (
          <span className="absolute top-3 left-3 inline-flex items-center px-2.5 py-0.5 rounded-pill bg-surface-card/90 text-xs font-semibold text-ink">
            {LEVEL_LABELS[course.level] ?? course.level}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="text-[15px] font-semibold text-ink line-clamp-2 mb-1 group-hover:text-emphasis transition-colors">
          {course.title}
        </h3>
        {course.instructor && (
          <p className="text-xs text-muted mb-2">{course.instructor.fullName}</p>
        )}
        {course.averageRating !== undefined && (
          <div className="mb-2">
            <StarRating rating={course.averageRating} count={course.totalStudents} />
          </div>
        )}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-hairline-soft">
          <PriceDisplay price={course.price} />
          {course.totalDurationSec !== undefined && (
            <span className="text-xs text-muted-soft">{formatDuration(course.totalDurationSec)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
