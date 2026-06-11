'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { instructorApi } from '@/lib/api/instructor.api';
import { courseApi } from '@/lib/api/course.api';
import {
  moderationApi,
  MODERATION_COLORS,
  MODERATION_LABELS,
  type ModerationStatus,
} from '@/lib/api/ai.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PriceDisplay } from '@/components/ui/PriceDisplay';
import Link from 'next/link';
import { Plus, Search, X } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-700',
  published: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  archived: 'bg-gray-200 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Bản nháp',
  pending: 'Chờ duyệt',
  published: 'Đã xuất bản',
  rejected: 'Bị từ chối',
  archived: 'Đã lưu trữ',
};

type StatusFilter = 'all' | 'published' | 'unpublished';
type SortOrder = 'newest' | 'oldest';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'published', label: 'Đã xuất bản' },
  { key: 'unpublished', label: 'Chưa xuất bản' },
];

function CreateCourseModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => courseApi.getCategories(),
    staleTime: 5 * 60 * 1000,
  });
  const categories: { id: string; name: string }[] = catData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => instructorApi.createCourse({ title: title.trim(), categoryId: categoryId || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] });
      router.push(`/instructor/courses/${res.data.id}/manage/goals`);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi tạo khóa học'),
  });

  const valid = title.trim().length >= 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Tạo khóa học mới</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-500">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Tiêu đề khóa học</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: NestJS từ A đến Z"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-xs text-gray-400">Bạn có thể thay đổi sau. Tối thiểu 5 ký tự.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Lĩnh vực (tùy chọn)</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">-- Chọn lĩnh vực --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Hủy
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!valid || createMutation.isPending}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Đang tạo...' : 'Tạo & tiếp tục'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InstructorCoursesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [showCreate, setShowCreate] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<{ id: string; title: string } | null>(null);
  const [courseToUnpublish, setCourseToUnpublish] = useState<{ id: string; title: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.getCourses(),
  });

  const appealMutation = useMutation({
    mutationFn: (courseId: string) => moderationApi.appealCourse(courseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructor-courses'] }),
    onError: (err: { response?: { data?: { message?: string } } }) =>
      alert(err?.response?.data?.message ?? 'Gửi kiến nghị thất bại'),
  });

  const deleteMutation = useMutation({
    mutationFn: (courseId: string) => instructorApi.deleteCourse(courseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] });
      setCourseToDelete(null);
    },
    onError: (err: any) =>
      alert(err?.response?.data?.message ?? 'Xóa khóa học thất bại'),
  });

  const unpublishMutation = useMutation({
    mutationFn: (courseId: string) => instructorApi.unpublishCourse(courseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] });
      setCourseToUnpublish(null);
    },
    onError: (err: any) =>
      alert(err?.response?.data?.message ?? 'Hủy xuất bản thất bại'),
  });

  const allCourses: any[] = data?.data?.courses ?? data?.data ?? [];

  const courses = useMemo(() => {
    let list = [...allCourses];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => (c.title ?? '').toLowerCase().includes(q));
    if (statusFilter === 'published') list = list.filter((c) => c.status === 'published');
    else if (statusFilter === 'unpublished') list = list.filter((c) => c.status !== 'published');
    list.sort((a, b) => {
      const ta = new Date(a.createdAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? 0).getTime();
      return sort === 'newest' ? tb - ta : ta - tb;
    });
    return list;
  }, [allCourses, search, statusFilter, sort]);

  return (
    <div className="mx-auto max-w-5xl px-2 py-2 sm:px-6 sm:py-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Khóa học của tôi</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          <Plus size={16} />
          Tạo khóa học mới
        </button>
      </div>

      {/* Control bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={1.75} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên khóa học..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400 sm:w-72"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === t.key ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOrder)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
          >
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : allCourses.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <p className="mb-4">Bạn chưa có khóa học nào.</p>
          <button onClick={() => setShowCreate(true)} className="text-purple-600 hover:underline">Tạo khóa học đầu tiên</button>
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">
          Không tìm thấy khóa học phù hợp.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Khóa học</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Kiểm duyệt</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Giá</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {courses.map((course: any) => (
                <tr key={course.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{course.title}</p>
                    <p className="text-xs text-gray-400">{course.totalLessons ?? 0} bài học</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[course.status] ?? 'bg-gray-100'}`}>
                      {STATUS_LABELS[course.status] ?? course.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {course.moderationStatus && course.moderationStatus !== 'approved' ? (
                      <span
                        title={course.moderationReason ?? ''}
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${MODERATION_COLORS[course.moderationStatus as ModerationStatus]}`}
                      >
                        {MODERATION_LABELS[course.moderationStatus as ModerationStatus]}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PriceDisplay price={Number(course.price)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {course.moderationStatus === 'rejected' && (
                      <button
                        onClick={() => {
                          if (confirm(`Gửi kiến nghị duyệt lại khóa học "${course.title}"?`))
                            appealMutation.mutate(course.id);
                        }}
                        disabled={appealMutation.isPending}
                        className="mr-3 text-xs text-amber-600 hover:underline disabled:opacity-50"
                      >
                        Kiến nghị
                      </button>
                    )}
                    <Link href={`/instructor/courses/${course.id}/manage/goals`} className="mr-3 text-xs text-purple-600 hover:underline">Sửa</Link>
                    <Link href={`/courses/${course.slug}`} className="mr-3 text-xs text-gray-500 hover:text-gray-700">Xem</Link>
                    {course.status === 'published' && (
                      <button
                        onClick={() => setCourseToUnpublish({ id: course.id, title: course.title })}
                        className="mr-3 text-xs text-orange-500 hover:underline"
                      >
                        Hủy xuất bản
                      </button>
                    )}
                    {(course.status === 'draft' || course.status === 'rejected') && (
                      <button
                        onClick={() => setCourseToDelete({ id: course.id, title: course.title })}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Xóa
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateCourseModal onClose={() => setShowCreate(false)} />}

      {courseToDelete && (
        <ConfirmDialog
          title={`Xóa khóa học "${courseToDelete.title}"?`}
          message="Toàn bộ bài học, tài liệu, video và dữ liệu liên quan sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác."
          confirmLabel="Xóa vĩnh viễn"
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(courseToDelete.id)}
          onCancel={() => setCourseToDelete(null)}
        />
      )}

      {courseToUnpublish && (
        <ConfirmDialog
          title={`Hủy xuất bản "${courseToUnpublish.title}"?`}
          message="Khóa học sẽ về trạng thái bản nháp. Học viên mới sẽ không thấy khóa học này. Bạn có thể sửa và gửi duyệt lại sau."
          confirmLabel="Hủy xuất bản"
          isPending={unpublishMutation.isPending}
          onConfirm={() => unpublishMutation.mutate(courseToUnpublish.id)}
          onCancel={() => setCourseToUnpublish(null)}
        />
      )}
    </div>
  );
}
