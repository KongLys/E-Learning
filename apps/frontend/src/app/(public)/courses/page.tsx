'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { courseApi } from '@/lib/api/course.api';
import { CourseGrid } from '@/components/course/CourseGrid';
import { Pagination } from '@/components/common/Pagination';

const LEVELS = [
  { value: '', label: 'Tất cả trình độ' },
  { value: 'beginner', label: 'Cơ bản' },
  { value: 'intermediate', label: 'Trung cấp' },
  { value: 'advanced', label: 'Nâng cao' },
];

const PRICES = [
  { value: '', label: 'Tất cả giá' },
  { value: 'free', label: 'Miễn phí' },
  { value: 'paid', label: 'Có phí' },
];

const SORTS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'popular', label: 'Phổ biến' },
  { value: 'rating', label: 'Đánh giá cao' },
];

function CoursesContent() {
  const searchParams = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');
  const [price, setPrice] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  // Reset về trang 1 khi từ khóa tìm kiếm trên navbar đổi
  // (pattern set-state-during-render thay cho useEffect).
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setPage(1);
  }

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => courseApi.getCategories(),
    staleTime: 5 * 60 * 1000,
  });
  const categories: { id: string; name: string; slug: string }[] = catData?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['courses', search, category, level, price, sort, page],
    queryFn: () =>
      courseApi.getCourses({ search, category, level, price: (price || undefined) as 'free' | 'paid' | undefined, sort, page, limit: 12 }),
  });

  const courses = data?.data?.courses ?? [];
  const total = data?.data?.total ?? 0;

  const selectClass =
    'rounded-pill border border-hairline-strong bg-surface-card px-4 py-2 text-sm text-ink appearance-none cursor-pointer hover:border-muted transition-colors focus:outline-none focus:border-emphasis';

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-300 mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-4xl text-ink mb-2">Khóa học</h1>
          {total > 0 && (
            <p className="text-sm text-muted">{total} khóa học</p>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-wrap mb-8">
          {/* Category filter */}
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className={selectClass}
          >
            <option value="">Tất cả lĩnh vực</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>

          {/* Level filter */}
          <select
            value={level}
            onChange={(e) => { setLevel(e.target.value); setPage(1); }}
            className={selectClass}
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          {/* Price filter */}
          <select
            value={price}
            onChange={(e) => { setPrice(e.target.value); setPage(1); }}
            className={selectClass}
          >
            {PRICES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className={selectClass}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Grid */}
        <CourseGrid courses={courses} loading={isLoading} />

        {/* Pagination */}
        <Pagination page={page} total={total} limit={12} onPageChange={setPage} />
      </div>
    </div>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <CoursesContent />
    </Suspense>
  );
}
