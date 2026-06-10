'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { AddLessonModal } from '@/components/instructor/AddLessonModal';
import { AddSectionModal } from '@/components/instructor/AddSectionModal';
import { LessonTypeIcon, type LessonType } from '@/components/instructor/lessonTypeMeta';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';

export default function CourseCurriculumPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [addSectionAt, setAddSectionAt] = useState<'top' | 'bottom' | null>(null);
  const [addLessonForSection, setAddLessonForSection] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['course-edit', id],
    queryFn: () => instructorApi.getSections(id),
  });

  const sections: any[] = data?.data ?? [];

  const addSectionMutation = useMutation({
    mutationFn: async ({ title, position }: { title: string; position: 'top' | 'bottom' }) => {
      const res = await instructorApi.addSection(id, { title });
      if (position === 'top') {
        const newId = res?.data?.id;
        const ids = [newId, ...sections.map((s: any) => s.id)].filter(Boolean);
        await instructorApi.reorderSections(id, ids);
      }
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-edit', id] });
      setAddSectionAt(null);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi'),
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: string) => instructorApi.deleteSection(id, sectionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-edit', id] }),
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi'),
  });

  const addLessonMutation = useMutation({
    mutationFn: ({ sectionId, ...dto }: { sectionId: string; title: string; type: LessonType; description: string }) =>
      instructorApi.addLesson(sectionId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-edit', id] });
      setAddLessonForSection(null);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi'),
  });

  const deleteLessonMutation = useMutation({
    mutationFn: (lessonId: string) => instructorApi.deleteLesson(lessonId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-edit', id] }),
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi'),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Khung chương trình</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tạo khóa học theo từng chương, mỗi chương tập trung vào một mục tiêu học tập. Sau đó thêm nội dung, hoạt động thực hành và bài kiểm tra.
          </p>
        </div>
        <Link
          href={`/instructor/courses/${id}/materials`}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          <FileText size={15} />
          Tài liệu khóa học
        </Link>
      </header>

      {error && <ErrorMessage message={error} />}

      {/* Thêm phần ở trên cùng (khung nét đứt) */}
      <button
        onClick={() => setAddSectionAt('top')}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-3 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-600"
      >
        <Plus size={16} />
        Thêm phần lên đầu
      </button>

      {/* Sections */}
      {sections.map((section: any, idx: number) => (
        <div key={section.id} className="rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
            <span className="font-medium text-sm">Phần {idx + 1}: {section.title}</span>
            <button
              onClick={() => deleteSectionMutation.mutate(section.id)}
              className="text-red-400 hover:text-red-600 text-xs"
            >
              Xóa phần
            </button>
          </div>

          {/* Lessons */}
          <ul className="divide-y divide-gray-100">
            {section.lessons?.map((lesson: any) => (
              <li key={lesson.id} className="px-4 py-3 flex items-center gap-3">
                <LessonTypeIcon type={lesson.type} size={15} className="text-gray-400 shrink-0" />
                <Link
                  href={`/instructor/courses/${id}/curriculum/${lesson.id}`}
                  className="flex-1 text-left text-sm hover:text-blue-600"
                >
                  {lesson.title}
                </Link>
                <Link
                  href={`/instructor/courses/${id}/curriculum/${lesson.id}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Chi tiết
                </Link>
                <button onClick={() => deleteLessonMutation.mutate(lesson.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
              </li>
            ))}
          </ul>

          {/* Add lesson */}
          <button
            onClick={() => setAddLessonForSection(section.id)}
            className="w-full px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 text-left"
          >
            + Thêm bài học
          </button>
        </div>
      ))}

      {/* Thêm phần ở cuối */}
      <button
        onClick={() => setAddSectionAt('bottom')}
        className="w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        + Thêm phần mới
      </button>

      {addSectionAt && (
        <AddSectionModal
          position={addSectionAt}
          isPending={addSectionMutation.isPending}
          onClose={() => setAddSectionAt(null)}
          onSubmit={(title) => addSectionMutation.mutate({ title, position: addSectionAt })}
        />
      )}

      {addLessonForSection && (
        <AddLessonModal
          isPending={addLessonMutation.isPending}
          onClose={() => setAddLessonForSection(null)}
          onSubmit={(dto) => addLessonMutation.mutate({ sectionId: addLessonForSection, ...dto })}
        />
      )}
    </div>
  );
}
