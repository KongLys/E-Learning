'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { courseApi } from '@/lib/api/course.api';
import { CourseGrid } from '@/components/course/CourseGrid';
import { Pagination } from '@/components/common/Pagination';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const timeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((v: T) => {
    if (timeoutRef[0]) clearTimeout(timeoutRef[0]);
    timeoutRef[1](setTimeout(() => setDebounced(v), delay));
  }, [delay, timeoutRef]);

  // trigger update when value changes
  useState(() => { update(value); });

  return debounced;
}

const LEVELS = ['beginner', 'intermediate', 'advanced'];

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
    setSearchTimer(setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 300));
  };

  const { data, isLoading } = useQuery({
    queryKey: ['courses', debouncedSearch, level, price, sort, page],
    queryFn: () => courseApi.getCourses({ search: debouncedSearch, level, price: price as any, sort, page, limit: 12 }),
  });

  const courses = data?.data?.courses ?? [];
  const total = data?.data?.total ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">Khóa học</h1>

      <div className="flex flex-col gap-4 md:flex-row md:items-center mb-6">
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Tìm kiếm khóa học..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={level}
          onChange={(e) => { setLevel(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Tất cả trình độ</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        <select
          value={price}
          onChange={(e) => { setPrice(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Tất cả giá</option>
          <option value="free">Miễn phí</option>
          <option value="paid">Có phí</option>
        </select>

        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="newest">Mới nhất</option>
          <option value="popular">Phổ biến</option>
          <option value="rating">Rating cao</option>
        </select>
      </div>

      <CourseGrid courses={courses} loading={isLoading} />

      <Pagination page={page} total={total} limit={12} onPageChange={setPage} />
    </div>
  );
}
