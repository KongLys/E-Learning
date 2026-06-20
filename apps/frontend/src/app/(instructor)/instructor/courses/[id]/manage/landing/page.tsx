'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { courseApi } from '@/lib/api/course.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { CourseThumbnailUpload } from '@/components/instructor/CourseThumbnailUpload';
import { notify } from '@/store/dialog.store';

const LEVELS = [
  { value: 'beginner', label: 'Sơ cấp' },
  { value: 'intermediate', label: 'Trung cấp' },
  { value: 'advanced', label: 'Nâng cao' },
];

const inputClass = 'w-full border border-hairline-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky';

export default function CourseLandingPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    shortDescription: '',
    description: '',
    language: 'vi',
    level: 'beginner',
    categoryId: '',
  });
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['course-manage', id],
    queryFn: () => instructorApi.getCourseById(id).then((r) => r.data),
  });

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => courseApi.getCategories(),
    staleTime: 5 * 60 * 1000,
  });
  const categories: { id: string; name: string }[] = catData?.data ?? [];

  useEffect(() => {
    if (data) {
      setForm({
        title: data.title ?? '',
        shortDescription: data.shortDescription ?? '',
        description: data.description ?? '',
        language: data.language ?? 'vi',
        level: data.level ?? 'beginner',
        categoryId: data.categoryId ?? '',
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      instructorApi.updateCourse(id, {
        title: form.title,
        shortDescription: form.shortDescription,
        description: form.description,
        language: form.language,
        level: form.level,
        categoryId: form.categoryId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-manage', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: any) => notify.error(err?.response?.data?.message ?? 'Lưu thất bại'),
  });

  if (isLoading) return <LoadingSpinner />;

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <header className="border-b border-hairline pb-4">
        <h1 className="text-2xl font-bold text-ink">Trang tổng quan khóa học</h1>
        <p className="mt-1 text-sm text-muted">
          Trang tổng quan thể hiện lý do học viên nên ghi danh khóa học của bạn và giúp khóa học hiển thị tốt hơn trên công cụ tìm kiếm.
        </p>
      </header>

      <div>
        <label className="block text-sm font-medium mb-1">Tiêu đề khóa học</label>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} maxLength={120} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Phụ đề khóa học</label>
        <input
          value={form.shortDescription}
          onChange={(e) => set('shortDescription', e.target.value)}
          className={inputClass}
          maxLength={150}
          placeholder="Mô tả ngắn gọn, hấp dẫn về khóa học"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Mô tả khóa học</label>
        <RichTextEditor value={form.description} onChange={(html) => set('description', html)} placeholder="Mô tả chi tiết về khóa học của bạn..." />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium mb-1">Ngôn ngữ</label>
          <select value={form.language} onChange={(e) => set('language', e.target.value)} className={inputClass}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">Tiếng Anh</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Trình độ</label>
          <select value={form.level} onChange={(e) => set('level', e.target.value)} className={inputClass}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Lĩnh vực</label>
          <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={inputClass}>
            <option value="">-- Chọn lĩnh vực --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <CourseThumbnailUpload courseId={id} />

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="rounded-md bg-sky px-5 py-2 text-sm font-semibold text-white hover:bg-sky-deep disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
        </button>
        {saved && <span className="text-sm text-leaf">Đã lưu</span>}
      </div>
    </div>
  );
}
