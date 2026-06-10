'use client';

import Link from 'next/link';
import { ProgressBar } from '@/components/ui/ProgressBar';

const TYPE_LABELS: Record<string, string> = { video: 'Video', document: 'Tài liệu', quiz: 'Trắc nghiệm' };

function durationLabel(type: string, durationSec: number): string {
  const min = Math.max(1, Math.round((durationSec || 0) / 60));
  return `${TYPE_LABELS[type] ?? 'Bài học'} • ${min} phút`;
}

interface LearnSidebarProps {
  courseId: string;
  courseTitle?: string;
  currentLessonId: string;
  sections: any[];
  lessonProgress: any[];
  progressPercent: number;
  isOpen: boolean;
  collapsed?: boolean;
  onClose: () => void;
}

export function LearnSidebar({ courseId, courseTitle, currentLessonId, sections, lessonProgress, progressPercent, isOpen, collapsed, onClose }: LearnSidebarProps) {
  const completedIds = new Set(lessonProgress.filter((lp: any) => lp.completed).map((lp: any) => lp.lessonId));

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={onClose} />}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-80 bg-white border-r border-gray-100 flex flex-col overflow-hidden transition-transform ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${collapsed ? 'lg:hidden' : ''}`}>
        {/* Header */}
        <div className="p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-gray-900 leading-snug">{courseTitle || 'Nội dung khóa học'}</h2>
            <button className="text-gray-400 hover:text-gray-600 shrink-0 -mt-0.5" onClick={onClose} aria-label="Đóng">✕</button>
          </div>
          <ProgressBar value={progressPercent} />
          <p className="text-xs text-gray-500 mt-1.5">{Math.round(progressPercent)}% hoàn thành</p>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto">
          {sections.map((section: any, idx: number) => (
            <details key={section.id} open className="group border-b border-gray-100">
              <summary className="px-5 py-3.5 cursor-pointer hover:bg-gray-50 list-none flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Phần {idx + 1}</p>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{section.title}</p>
                </div>
                <span className="text-gray-400 text-xs mt-0.5 shrink-0 transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <ul className="pb-1">
                {section.lessons?.map((lesson: any) => {
                  const isCurrent = lesson.id === currentLessonId;
                  const isCompleted = completedIds.has(lesson.id);
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={`/learn/${courseId}/${lesson.id}`}
                        onClick={onClose}
                        className={`flex items-start gap-3 px-5 py-3 border-l-[3px] transition-colors ${isCurrent ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-gray-50'}`}
                      >
                        {/* Status circle */}
                        {isCompleted ? (
                          <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-green-500 text-white text-[11px] flex items-center justify-center">✓</span>
                        ) : (
                          <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 ${isCurrent ? 'border-blue-500' : 'border-gray-300'}`} />
                        )}
                        <span className="min-w-0">
                          <span className={`block text-sm leading-snug ${isCurrent ? 'text-blue-700 font-semibold' : 'text-gray-800'}`}>{lesson.title}</span>
                          <span className="block text-xs text-gray-400 mt-0.5">{durationLabel(lesson.type, lesson.durationSec)}</span>
                        </span>
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
