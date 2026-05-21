'use client';

import Link from 'next/link';
import { ProgressBar } from '@/components/ui/ProgressBar';

const TYPE_ICONS: Record<string, string> = { video: '▶', document: '📄', quiz: '✏' };

interface LearnSidebarProps {
  courseId: string;
  currentLessonId: string;
  sections: any[];
  lessonProgress: any[];
  progressPercent: number;
  isOpen: boolean;
  onClose: () => void;
}

export function LearnSidebar({ courseId, currentLessonId, sections, lessonProgress, progressPercent, isOpen, onClose }: LearnSidebarProps) {
  const completedIds = new Set(lessonProgress.filter((lp: any) => lp.completed).map((lp: any) => lp.lessonId));

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={onClose} />}
      <aside className={`fixed lg:static inset-y-0 right-0 z-30 w-72 bg-white border-l overflow-y-auto transition-transform ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Tiến độ khóa học</span>
            <button className="lg:hidden text-gray-400 hover:text-gray-600" onClick={onClose}>✕</button>
          </div>
          <ProgressBar value={progressPercent} />
          <p className="text-xs text-gray-500 mt-1">{Math.round(progressPercent)}% hoàn thành</p>
        </div>

        <div className="divide-y">
          {sections.map((section: any) => (
            <details key={section.id} open className="group">
              <summary className="px-4 py-3 text-sm font-medium cursor-pointer hover:bg-gray-50 list-none flex justify-between">
                {section.title}
                <span className="text-gray-400 text-xs">{section.lessons?.length} bài</span>
              </summary>
              <ul className="border-t">
                {section.lessons?.map((lesson: any) => {
                  const isCurrent = lesson.id === currentLessonId;
                  const isCompleted = completedIds.has(lesson.id);
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={`/learn/${courseId}/${lesson.id}`}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-blue-50 ${isCurrent ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                      >
                        <span className="text-xs shrink-0">{TYPE_ICONS[lesson.type] ?? '•'}</span>
                        <span className="flex-1 line-clamp-1">{lesson.title}</span>
                        {isCompleted && <span className="text-green-500 text-xs shrink-0">✓</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      </aside>
    </>
  );
}
