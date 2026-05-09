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

export function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <Link href={`/courses/${course.slug}`} className="group block rounded-xl border bg-white hover:shadow-md transition-shadow overflow-hidden">
      <div className="relative h-44 bg-gray-100">
        {course.thumbnailUrl ? (
          <Image src={course.thumbnailUrl} alt={course.title} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400 text-sm">No image</div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1 group-hover:text-blue-600">
          {course.title}
        </h3>
        {course.instructor && (
          <p className="text-xs text-gray-500 mb-2">{course.instructor.fullName}</p>
        )}
        {course.averageRating !== undefined && (
          <StarRating rating={course.averageRating} count={course.totalStudents} />
        )}
        <div className="mt-2 flex items-center justify-between">
          <PriceDisplay price={course.price} />
          {course.totalDurationSec !== undefined && (
            <span className="text-xs text-gray-400">{formatDuration(course.totalDurationSec)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
