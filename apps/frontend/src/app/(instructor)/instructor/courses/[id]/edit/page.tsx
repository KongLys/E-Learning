'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';

type LessonType = 'video' | 'document' | 'quiz';

export default function EditCoursePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonType, setNewLessonType] = useState<LessonType>('video');
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

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
  });

  const addLessonMutation = useMutation({
    mutationFn: (sectionId: string) => instructorApi.addLesson(sectionId, { title: newLessonTitle, type: newLessonType }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-edit', id] }); setAddingSectionId(null); setNewLessonTitle(''); },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi'),
  });

  const deleteLessonMutation = useMutation({
    mutationFn: (lessonId: string) => instructorApi.deleteLesson(lessonId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-edit', id] }),
  });

  const uploadVideoMutation = useMutation({
    mutationFn: ({ lessonId, file }: { lessonId: string; file: File }) =>
      instructorApi.uploadVideo(lessonId, file, (pct) => setUploadProgress((p) => ({ ...p, [lessonId]: pct }))),
    onSuccess: (_, { lessonId }) => setUploadProgress((p) => ({ ...p, [lessonId]: 100 })),
  });

  const submitMutation = useMutation({
    mutationFn: () => instructorApi.submitCourse(id),
    onSuccess: () => alert('Khóa học đã được gửi để duyệt!'),
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi submit'),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chỉnh sửa khóa học</h1>
        <div className="flex gap-2">
          <a
            href={`/instructor/courses/${id}/materials`}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700"
          >
            Tài liệu AI
          </a>
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {submitMutation.isPending ? 'Đang gửi...' : 'Gửi duyệt'}
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {/* Add section */}
      <div className="flex gap-2">
        <input
          value={newSectionTitle}
          onChange={(e) => setNewSectionTitle(e.target.value)}
          placeholder="Tên chương mới..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={() => newSectionTitle.trim() && addSectionMutation.mutate()}
          disabled={!newSectionTitle.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          + Thêm chương
        </button>
      </div>

      {/* Sections */}
      {sections.map((section: any, idx: number) => (
        <div key={section.id} className="border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
            <span className="font-medium text-sm">{idx + 1}. {section.title}</span>
            <button
              onClick={() => deleteSectionMutation.mutate(section.id)}
              className="text-red-400 hover:text-red-600 text-xs"
            >
              Xóa chương
            </button>
          </div>

          {/* Lessons */}
          <ul className="divide-y">
            {section.lessons?.map((lesson: any) => (
              <li key={lesson.id} className="px-4 py-3 flex items-center gap-3">
                <span className="text-xs text-gray-400">{lesson.type === 'video' ? '▶' : lesson.type === 'document' ? '📄' : '✏'}</span>
                <span className="flex-1 text-sm">{lesson.title}</span>

                {lesson.type === 'video' && (
                  <label className="cursor-pointer">
                    <span className="text-xs text-blue-500 hover:underline">
                      {uploadProgress[lesson.id] ? `${uploadProgress[lesson.id]}%` : 'Upload video'}
                    </span>
                    <input
                      type="file"
                      accept="video/mp4,video/webm"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadVideoMutation.mutate({ lessonId: lesson.id, file });
                      }}
                    />
                  </label>
                )}

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
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded disabled:opacity-50"
                >
                  Thêm
                </button>
                <button onClick={() => setAddingSectionId(null)} className="text-xs border px-3 py-1.5 rounded">Hủy</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingSectionId(section.id)}
              className="w-full px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 text-left"
            >
              + Thêm bài học
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
