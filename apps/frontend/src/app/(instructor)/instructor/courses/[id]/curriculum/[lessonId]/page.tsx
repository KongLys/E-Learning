'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { LessonContentEditor } from '@/components/instructor/LessonContentEditor';
import { LessonTypeIcon, type LessonType } from '@/components/instructor/lessonTypeMeta';

export default function CurriculumDetailPage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['course-edit', id],
    queryFn: () => instructorApi.getSections(id),
  });

  const { data: courseData } = useQuery({
    queryKey: ['course-thumbnail', id],
    queryFn: () => instructorApi.getCourseById(id).then((r) => r.data),
  });

  const sections: any[] = data?.data ?? [];

  const currentLesson = sections
    .flatMap((s: any) => s.lessons ?? [])
    .find((l: any) => l.id === lessonId) as { id: string; title: string; type: LessonType } | undefined;

  return (
    <div className="-m-4 sm:-m-6 lg:-m-7 flex h-[calc(100vh-3rem)] flex-col lg:flex-row">
      {/* Sidebar khung chương trình */}
      <aside className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r bg-white flex flex-col overflow-hidden">
        <div className="p-4 border-b shrink-0">
          <Link
            href={`/instructor/courses/${id}/manage/curriculum`}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-purple-600"
          >
            <ArrowLeft size={14} />
            Quay lại khung chương trình
          </Link>
          <h2 className="mt-2 text-base font-bold text-gray-900 leading-snug">
            {courseData?.title || 'Khung chương trình'}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-12"><LoadingSpinner /></div>
          ) : (
            sections.map((section: any, idx: number) => (
              <details key={section.id} open className="group border-b">
                <summary className="px-4 py-3 cursor-pointer hover:bg-gray-50 list-none flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Phần {idx + 1}</p>
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{section.title}</p>
                  </div>
                  <span className="text-gray-400 text-xs mt-0.5 shrink-0 transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <ul className="pb-1">
                  {section.lessons?.map((lesson: any) => {
                    const isCurrent = lesson.id === lessonId;
                    return (
                      <li key={lesson.id}>
                        <Link
                          href={`/instructor/courses/${id}/curriculum/${lesson.id}`}
                          className={`flex items-center gap-3 px-4 py-3 hover:bg-purple-50/60 ${isCurrent ? 'bg-purple-50' : ''}`}
                        >
                          <LessonTypeIcon
                            type={lesson.type}
                            size={15}
                            className={isCurrent ? 'text-purple-600' : 'text-gray-400'}
                          />
                          <span
                            className={`min-w-0 text-sm leading-snug ${isCurrent ? 'text-purple-700 font-semibold' : 'text-gray-800'}`}
                          >
                            {lesson.title}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))
          )}
        </div>
      </aside>

      {/* Nội dung bài học */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl">
          {isLoading ? (
            <div className="py-12"><LoadingSpinner /></div>
          ) : currentLesson ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
              <LessonContentEditor courseId={id} lesson={currentLesson} />
            </div>
          ) : (
            <p className="text-sm text-gray-500">Không tìm thấy bài học. Chọn một bài học ở thanh bên.</p>
          )}
        </div>
      </main>
    </div>
  );
}
