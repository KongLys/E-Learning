'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { LessonEditorModal } from '@/components/instructor/LessonEditorModal';
import Link from 'next/link';
import { FileText } from 'lucide-react';

type LessonType = 'video' | 'document' | 'quiz';

export default function CourseCurriculumPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonType, setNewLessonType] = useState<LessonType>('video');
  const [editingLesson, setEditingLesson] = useState<{ id: string; title: string; type: LessonType } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['course-edit', id],
    queryFn: () => instructorApi.getSections(id),
  });

  const sections: any[] = data?.data ?? [];

  const addSectionMutation = useMutation({
    mutationFn: () => instructorApi.addSection(id, { title: newSectionTitle, description: '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-edit', id] }); setNewSectionTitle(''); },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi'),
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: string) => instructorApi.deleteSection(id, sectionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-edit', id] }),
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi'),
  });

  const addLessonMutation = useMutation({
    mutationFn: (sectionId: string) => instructorApi.addLesson(sectionId, { title: newLessonTitle, type: newLessonType }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-edit', id] }); setAddingSectionId(null); setNewLessonTitle(''); },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi'),
  });

  const deleteLessonMutation = useMutation({
    mutationFn: (lessonId: string) => instructorApi.deleteLesson(lessonId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-edit', id] }),
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi'),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Khung chương trình</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tạo khóa học theo từng chương, mỗi chương tập trung vào một mục tiêu học tập. Sau đó thêm nội dung, hoạt động thực hành và bài kiểm tra.
          </p>
        </div>
        <Link
          href={`/instructor/courses/${id}/materials`}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-purple-200 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50"
        >
          <FileText size={15} />
          Tài liệu khóa học
        </Link>
      </header>

      {error && <ErrorMessage message={error} />}

      {/* Sections */}
      {sections.map((section: any, idx: number) => (
        <div key={section.id} className="border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
            <span className="font-medium text-sm">Phần {idx + 1}: {section.title}</span>
            <button
              onClick={() => deleteSectionMutation.mutate(section.id)}
              className="text-red-400 hover:text-red-600 text-xs"
            >
              Xóa phần
            </button>
          </div>

          {/* Lessons */}
          <ul className="divide-y">
            {section.lessons?.map((lesson: any) => (
              <li key={lesson.id} className="px-4 py-3 flex items-center gap-3">
                <span className="text-xs text-gray-400">{lesson.type === 'video' ? '▶' : lesson.type === 'document' ? '📄' : '✏'}</span>
                <button
                  onClick={() => setEditingLesson({ id: lesson.id, title: lesson.title, type: lesson.type })}
                  className="flex-1 text-left text-sm hover:text-purple-600"
                >
                  {lesson.title}
                </button>
                <button
                  onClick={() => setEditingLesson({ id: lesson.id, title: lesson.title, type: lesson.type })}
                  className="text-xs text-purple-500 hover:underline"
                >
                  Chi tiết
                </button>
                <button onClick={() => deleteLessonMutation.mutate(lesson.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
              </li>
            ))}
          </ul>

          {/* Add lesson */}
          {addingSectionId === section.id ? (
            <div className="px-4 py-3 border-t space-y-2">
              <input
                autoFocus
                value={newLessonTitle}
                onChange={(e) => setNewLessonTitle(e.target.value)}
                placeholder="Tên bài học..."
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
              <div className="flex items-center gap-3">
                {(['video', 'document', 'quiz'] as LessonType[]).map((t) => (
                  <label key={t} className="flex items-center gap-1 text-sm cursor-pointer">
                    <input type="radio" name="lessonType" value={t} checked={newLessonType === t} onChange={() => setNewLessonType(t)} />
                    {t === 'video' ? 'Video' : t === 'document' ? 'Tài liệu' : 'Quiz'}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => addLessonMutation.mutate(section.id)}
                  disabled={!newLessonTitle.trim()}
                  className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded disabled:opacity-50"
                >
                  Thêm
                </button>
                <button onClick={() => setAddingSectionId(null)} className="text-xs border px-3 py-1.5 rounded">Hủy</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingSectionId(section.id)}
              className="w-full px-4 py-2 text-xs text-purple-600 hover:bg-purple-50 text-left"
            >
              + Thêm bài học
            </button>
          )}
        </div>
      ))}

      {/* Add section */}
      <div className="flex gap-2">
        <input
          value={newSectionTitle}
          onChange={(e) => setNewSectionTitle(e.target.value)}
          placeholder="Tên phần mới..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={() => newSectionTitle.trim() && addSectionMutation.mutate()}
          disabled={!newSectionTitle.trim() || addSectionMutation.isPending}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          + Thêm phần
        </button>
      </div>

      {editingLesson && (
        <LessonEditorModal
          courseId={id}
          lesson={editingLesson}
          onClose={() => setEditingLesson(null)}
        />
      )}
    </div>
  );
}
