import { CourseCard, CourseCardData } from './CourseCard';

interface CourseGridProps {
  courses: CourseCardData[];
  loading?: boolean;
  columns?: 2 | 3 | 4;
}

const GRID_COLS: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

function SkeletonCard() {
  return (
    <div className="bg-surface-card rounded-2xl border border-hairline overflow-hidden animate-pulse">
      <div className="h-48 bg-surface-strong" />
      <div className="p-4 space-y-2.5">
        <div className="h-4 bg-surface-strong rounded-lg w-3/4" />
        <div className="h-3 bg-surface-strong rounded-lg w-1/2" />
        <div className="h-3 bg-surface-strong rounded-lg w-1/3" />
      </div>
    </div>
  );
}

export function CourseGrid({ courses, loading, columns = 3 }: CourseGridProps) {
  const colClass = GRID_COLS[columns] ?? GRID_COLS[3];

  if (loading) {
    return (
      <div className={`grid ${colClass} gap-5`}>
        {Array.from({ length: columns }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="text-center py-16 text-muted">
        Không tìm thấy khóa học phù hợp
      </div>
    );
  }

  return (
    <div className={`grid ${colClass} gap-5`}>
      {courses.map((course) => <CourseCard key={course.id} course={course} />)}
    </div>
  );
}
