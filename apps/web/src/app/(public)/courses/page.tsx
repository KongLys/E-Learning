'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { courseApi } from '@/lib/api/course.api';
import { CourseGrid } from '@/components/course/CourseGrid';
import { Pagination } from '@/components/common/Pagination';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

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

export default function CoursesPage() {
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [price, setPrice] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (v: string) => {
    setSearch(v);
    if (searchTimer) clearTimeout(searchTimer);
    setSearchTimer(
      setTimeout(() => {
        setDebouncedSearch(v);
        setPage(1);
      }, 300)
    );
  };

  const { data, isLoading } = useQuery({
    queryKey: ['courses', debouncedSearch, level, price, sort, page],
    queryFn: () =>
      courseApi.getCourses({ search: debouncedSearch, level, price: price as any, sort, page, limit: 12 }),
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center mb-8">
          {/* Search */}
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none">
              <SearchIcon />
            </span>
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Tìm kiếm khóa học..."
              className="w-full rounded-pill border border-hairline-strong bg-surface-card pl-10 pr-4 py-2 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-emphasis transition-colors"
            />
          </div>

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
