import { CourseCard, CourseCardData } from './CourseCard';

interface CourseGridProps {
  courses: CourseCardData[];
  loading?: boolean;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-white overflow-hidden animate-pulse">
      <div className="h-44 bg-gray-200" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="h-3 bg-gray-200 rounded w-1/3" />
      </div>
    </div>
  );
}

export function CourseGrid({ courses, loading }: CourseGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        Không tìm thấy khóa học phù hợp
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => <CourseCard key={course.id} course={course} />)}
    </div>
  );
}
