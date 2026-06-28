'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { LessonContentEditor } from '@/components/instructor/LessonContentEditor';
import { LessonTypeIcon, type LessonType } from '@/components/instructor/lessonTypeMeta';

interface CurriculumLesson {
  id: string;
  title: string;
  type: LessonType;
}
interface CurriculumSection {
  id: string;
  title: string;
  lessons?: CurriculumLesson[];
}

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

  const sections: CurriculumSection[] = data?.data ?? [];

  const currentLesson = sections
    .flatMap((s) => s.lessons ?? [])
    .find((l) => l.id === lessonId);

  return (
    <div className="-m-4 sm:-m-6 lg:-m-7 flex h-[calc(100vh-3rem)] flex-col lg:flex-row">
      {/* Sidebar khung chương trình */}
      <aside className="w-full lg:w-80 shrink-0 border-b border-hairline lg:border-b-0 lg:border-r bg-surface-card flex flex-col overflow-hidden">
        <div className="p-4 border-b border-hairline shrink-0">
          <Link
            href={`/instructor/courses/${id}/manage/curriculum`}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-sky"
          >
            <ArrowLeft size={14} />
            Quay lại khung chương trình
          </Link>
          <h2 className="mt-2 text-base font-bold text-ink leading-snug">
            {courseData?.title || 'Khung chương trình'}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-12"><LoadingSpinner /></div>
          ) : (
            sections.map((section, idx) => (
              <details key={section.id} open className="group border-b border-hairline">
                <summary className="px-4 py-3 cursor-pointer hover:bg-canvas-soft list-none flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">Phần {idx + 1}</p>
                    <p className="text-sm font-semibold text-ink leading-snug">{section.title}</p>
                  </div>
                  <ChevronDown size={16} className="text-ink-subtle mt-0.5 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="pb-1">
                  {section.lessons?.map((lesson) => {
                    const isCurrent = lesson.id === lessonId;
                    return (
                      <li key={lesson.id}>
                        <Link
                          href={`/instructor/courses/${id}/curriculum/${lesson.id}`}
                          className={`flex items-center gap-3 px-4 py-3 border-l-[3px] transition-colors ${isCurrent ? 'bg-sky-soft border-sky' : 'border-transparent hover:bg-canvas-soft'}`}
                        >
                          <LessonTypeIcon
                            type={lesson.type}
                            size={15}
                            className={isCurrent ? 'text-sky' : 'text-ink-subtle'}
                          />
                          <span
                            className={`min-w-0 text-sm leading-snug ${isCurrent ? 'text-sky font-semibold' : 'text-ink'}`}
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
      <main className="flex-1 min-w-0 overflow-y-auto bg-canvas-soft p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl">
          {isLoading ? (
            <div className="py-12"><LoadingSpinner /></div>
          ) : currentLesson ? (
            <div className="rounded-card border border-hairline bg-surface-card p-6 sm:p-8">
              <LessonContentEditor courseId={id} lesson={currentLesson} courseStatus={courseData?.status} />
            </div>
          ) : (
            <p className="text-sm text-muted">Không tìm thấy bài học. Chọn một bài học ở thanh bên.</p>
          )}
        </div>
      </main>
    </div>
  );
}
