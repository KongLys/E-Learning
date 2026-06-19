'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { myReviewQuizApi } from '@/lib/api/ai.api';
import { learnApi } from '@/lib/api/learn.api';
import { youtubeEmbedUrl } from '@/lib/youtube';
import { MaterialViewerModal, type MaterialKind } from './MaterialViewerModal';

const TYPE_LABELS: Record<string, string> = { video: 'Video', document: 'Tài liệu', quiz: 'Trắc nghiệm' };
const REF_ICON: Record<string, string> = { video: '🎬', youtube: '▶️', file: '📄' };

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
  /** Đóng overlay mobile sau khi chọn bài, nhưng GIỮ outline trên desktop. */
  onNavigate?: () => void;
  /** Mở 1 quiz cá nhân (per-user) đã tạo qua chat AI. */
  onOpenMyQuiz?: (quizId: string) => void;
  /** Mở 1 quiz ôn tập (theo bài) đã tạo bằng nút "Tạo quiz ôn tập". */
  onOpenReviewQuiz?: (lessonId: string) => void;
  /** Quiz đang mở ở cột nội dung — để tô sáng trong mục lục ('ai:<id>' | 'review:<lessonId>'). */
  activeQuizKey?: string;
  /** Mở/nghe 1 podcast (theo bài) đã tạo — phát ở cột nội dung. */
  onOpenPodcast?: (lessonId: string, lessonTitle: string) => void;
  /** Podcast đang mở ở cột nội dung — để tô sáng trong mục lục ('podcast:<lessonId>'). */
  activePodcastKey?: string;
}

/** mm:ss từ số giây (podcast ngắn). */
function podcastDuration(durationSec: number): string {
  const total = Math.max(0, Math.round(durationSec || 0));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

type Viewer = { title: string; kind: MaterialKind; url: string };

export function LearnSidebar({ courseId, courseTitle, currentLessonId, sections, lessonProgress, progressPercent, isOpen, collapsed, onClose, onNavigate, onOpenMyQuiz, onOpenReviewQuiz, activeQuizKey, onOpenPodcast, activePodcastKey }: LearnSidebarProps) {
  const completedIds = new Set(lessonProgress.filter((lp: any) => lp.completed).map((lp: any) => lp.lessonId));
  const [viewer, setViewer] = useState<Viewer | null>(null);

  const myQuizzesQuery = useQuery({
    queryKey: ['my-review-quizzes', courseId],
    queryFn: async () => (await myReviewQuizApi.list(courseId)).data,
    enabled: !!onOpenMyQuiz,
  });
  const myQuizzes = myQuizzesQuery.data ?? [];

  // Quiz ôn tập theo bài (tạo bằng nút "Tạo quiz ôn tập") — dùng chung mỗi bài.
  const reviewQuizzesQuery = useQuery({
    queryKey: ['review-quizzes', courseId],
    queryFn: async () => (await learnApi.listReviewQuizzes(courseId)).data,
    enabled: !!onOpenReviewQuiz,
  });
  const reviewQuizzes = reviewQuizzesQuery.data ?? [];

  // Podcast theo bài (tạo bằng nút "Tạo podcast") — dùng chung mỗi bài.
  const podcastsQuery = useQuery({
    queryKey: ['podcasts', courseId],
    queryFn: async () => (await learnApi.listPodcasts(courseId)).data,
    enabled: !!onOpenPodcast,
  });
  const podcasts = podcastsQuery.data ?? [];

  const showQuizSection = !!onOpenMyQuiz || !!onOpenReviewQuiz;
  const quizCount = myQuizzes.length + reviewQuizzes.length;
  const quizzesLoading = myQuizzesQuery.isLoading || reviewQuizzesQuery.isLoading;

  const refQuery = useQuery({
    queryKey: ['reference-materials', courseId],
    queryFn: async () => (await learnApi.getReferenceMaterials(courseId)).data as any[],
  });
  const refMaterials = refQuery.data ?? [];

  const filesQuery = useQuery({
    queryKey: ['lesson-files', courseId],
    queryFn: async () => (await learnApi.getCourseLessonFiles(courseId)).data as any[],
  });
  const fileSections = filesQuery.data ?? [];
  const fileCount = fileSections.reduce((n, s) => n + (s.files?.length ?? 0), 0);

  // Mở tài liệu tham khảo: youtube → embed; video/file → signed URL.
  const openRef = useMutation({
    mutationFn: async (m: any): Promise<Viewer> => {
      if (m.type === 'youtube') {
        const url = youtubeEmbedUrl(m.externalUrl);
        if (!url) throw new Error('Link YouTube không hợp lệ');
        return { title: m.title, kind: 'youtube', url };
      }
      const res = await learnApi.getReferenceMaterialUrl(m.id);
      const kind: MaterialKind =
        m.type === 'video' ? 'video' : m.fileType === 'pdf' ? 'pdf' : 'docx';
      return { title: m.title, kind, url: res.data.url };
    },
    onSuccess: (v) => setViewer(v),
  });

  // Mở file đính kèm của bài (dùng lại endpoint document-url đã ký).
  const openDoc = useMutation({
    mutationFn: async (f: any): Promise<Viewer> => {
      const res = await learnApi.getDocumentUrl(f.lessonId);
      const kind: MaterialKind = f.fileType === 'pdf' ? 'pdf' : 'docx';
      return { title: f.fileName || f.lessonTitle, kind, url: res.data.url };
    },
    onSuccess: (v) => setViewer(v),
  });

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
                  // Đang mở quiz ôn tập ở cột nội dung → không tô sáng bài học,
                  // chỉ tô sáng mục quiz ôn tập (tránh 2 mục cùng active).
                  const isCurrent = lesson.id === currentLessonId && !activeQuizKey;
                  const isCompleted = completedIds.has(lesson.id);
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={`/learn/${courseId}/${lesson.id}`}
                        onClick={onNavigate ?? onClose}
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

          {/* ── Quiz ôn tập của tôi (AI tạo qua chat + tạo theo bài) ── */}
          {showQuizSection && (
            <details className="group border-b border-gray-100" open={quizCount > 0}>
              <summary className="px-5 py-3.5 cursor-pointer hover:bg-gray-50 list-none flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">Quiz ôn tập của tôi{quizCount > 0 ? ` (${quizCount})` : ''}</p>
                <span className="text-gray-400 text-xs transition-transform group-open:rotate-180">⌄</span>
              </summary>
              {quizzesLoading ? (
                <p className="px-5 py-3 text-xs text-gray-400">Đang tải…</p>
              ) : quizCount === 0 ? (
                <p className="px-5 py-3 text-xs text-gray-500 leading-relaxed">
                  Chưa có quiz ôn tập. Nhờ AI tạo quiz trong khung chat (✦ Hỏi AI) hoặc bấm “✦ Tạo quiz ôn tập” ở bài học để luyện tập.
                </p>
              ) : (
                <ul className="pb-1">
                  {onOpenReviewQuiz && reviewQuizzes.map((quiz) => {
                    const active = activeQuizKey === `review:${quiz.lessonId}`;
                    return (
                    <li key={`rq-${quiz.lessonId}`}>
                      <button
                        onClick={() => onOpenReviewQuiz(quiz.lessonId)}
                        className={`w-full text-left flex items-start gap-3 px-5 py-3 border-l-[3px] transition-colors ${active ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-gray-50'}`}
                      >
                        <span className="mt-0.5 shrink-0">📝</span>
                        <span className="min-w-0">
                          <span className={`block text-sm leading-snug truncate ${active ? 'text-blue-700 font-semibold' : 'text-gray-800'}`}>{quiz.lessonTitle}</span>
                          <span className="block text-xs text-gray-400 mt-0.5">Theo bài · {quiz.questionCount} câu · {new Date(quiz.updatedAt).toLocaleDateString('vi-VN')}</span>
                        </span>
                      </button>
                    </li>
                    );
                  })}
                  {onOpenMyQuiz && myQuizzes.map((quiz) => {
                    const active = activeQuizKey === `ai:${quiz.id}`;
                    return (
                    <li key={`my-${quiz.id}`}>
                      <button
                        onClick={() => onOpenMyQuiz(quiz.id)}
                        className={`w-full text-left flex items-start gap-3 px-5 py-3 border-l-[3px] transition-colors ${active ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-gray-50'}`}
                      >
                        <span className="mt-0.5 shrink-0">📝</span>
                        <span className="min-w-0">
                          <span className={`block text-sm leading-snug truncate ${active ? 'text-blue-700 font-semibold' : 'text-gray-800'}`}>{quiz.title || 'Quiz ôn tập'}</span>
                          <span className="block text-xs text-gray-400 mt-0.5">Qua chat · {quiz.questionCount} câu · {new Date(quiz.createdAt).toLocaleDateString('vi-VN')}</span>
                        </span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
            </details>
          )}

          {/* ── Podcast của khóa học (tạo theo bài bằng nút "Tạo podcast") ── */}
          {onOpenPodcast && (
            <details className="group border-b border-gray-100" open={podcasts.length > 0}>
              <summary className="px-5 py-3.5 cursor-pointer hover:bg-gray-50 list-none flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">Podcast{podcasts.length > 0 ? ` (${podcasts.length})` : ''}</p>
                <span className="text-gray-400 text-xs transition-transform group-open:rotate-180">⌄</span>
              </summary>
              {podcastsQuery.isLoading ? (
                <p className="px-5 py-3 text-xs text-gray-400">Đang tải…</p>
              ) : podcasts.length === 0 ? (
                <p className="px-5 py-3 text-xs text-gray-500 leading-relaxed">
                  Chưa có podcast. Mở một bài tài liệu rồi bấm “🎙 Tạo podcast” trong khung chat (✦ Hỏi AI) để tạo.
                </p>
              ) : (
                <ul className="pb-1">
                  {podcasts.map((p) => {
                    const active = activePodcastKey === `podcast:${p.lessonId}`;
                    if (p.status === 'ready') {
                      return (
                        <li key={`pc-${p.lessonId}`}>
                          <button
                            onClick={() => onOpenPodcast(p.lessonId, p.lessonTitle)}
                            className={`w-full text-left flex items-start gap-3 px-5 py-3 border-l-[3px] transition-colors ${active ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-gray-50'}`}
                          >
                            <span className="mt-0.5 shrink-0">🎙</span>
                            <span className="min-w-0">
                              <span className={`block text-sm leading-snug truncate ${active ? 'text-blue-700 font-semibold' : 'text-gray-800'}`}>{p.lessonTitle}</span>
                              <span className="block text-xs text-gray-400 mt-0.5">Theo bài · {podcastDuration(p.durationSec)} · {new Date(p.updatedAt).toLocaleDateString('vi-VN')}</span>
                            </span>
                          </button>
                        </li>
                      );
                    }
                    const isBusy = p.status === 'pending' || p.status === 'processing';
                    return (
                      <li key={`pc-${p.lessonId}`}>
                        <div className="flex items-start gap-3 px-5 py-3 border-l-[3px] border-transparent">
                          <span className="mt-0.5 shrink-0">{isBusy ? '⏳' : '⚠'}</span>
                          <span className="min-w-0">
                            <span className="block text-sm leading-snug truncate text-gray-800">{p.lessonTitle}</span>
                            <span className={`block text-xs mt-0.5 ${isBusy ? 'text-gray-400' : 'text-red-500'}`}>
                              {isBusy ? 'Đang tạo…' : 'Tạo thất bại'}
                            </span>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          )}

          {/* ── Tài liệu tham khảo ── */}
          {refMaterials.length > 0 && (
            <details className="group border-b border-gray-100">
              <summary className="px-5 py-3.5 cursor-pointer hover:bg-gray-50 list-none flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">Tài liệu tham khảo ({refMaterials.length})</p>
                <span className="text-gray-400 text-xs transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <ul className="pb-1">
                {refMaterials.map((m: any) => (
                  <li key={m.id}>
                    <button
                      onClick={() => openRef.mutate(m)}
                      disabled={openRef.isPending}
                      className="w-full text-left flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors disabled:opacity-60"
                    >
                      <span className="mt-0.5 shrink-0">{REF_ICON[m.type] ?? '📎'}</span>
                      <span className="min-w-0">
                        <span className="block text-sm leading-snug text-gray-800 truncate">{m.title}</span>
                        {m.description && <span className="block text-xs text-gray-400 mt-0.5 truncate">{m.description}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* ── Tài liệu toàn khóa học (file đính kèm trong các bài) ── */}
          {fileCount > 0 && (
            <details className="group border-b border-gray-100">
              <summary className="px-5 py-3.5 cursor-pointer hover:bg-gray-50 list-none flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">Tài liệu toàn khóa học ({fileCount})</p>
                <span className="text-gray-400 text-xs transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="pb-1">
                {fileSections.map((s: any) => (
                  <div key={s.id}>
                    <p className="px-5 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{s.title}</p>
                    <ul>
                      {s.files.map((f: any) => (
                        <li key={f.lessonId + f.fileName}>
                          <button
                            onClick={() => openDoc.mutate(f)}
                            disabled={openDoc.isPending}
                            className="w-full text-left flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors disabled:opacity-60"
                          >
                            <span className="mt-0.5 shrink-0">📄</span>
                            <span className="min-w-0">
                              <span className="block text-sm leading-snug text-gray-800 truncate">{f.fileName || f.lessonTitle}</span>
                              <span className="block text-xs text-gray-400 mt-0.5">{(f.fileType ?? '').toUpperCase()}{f.fileType === 'pdf' && f.pageCount ? ` · ${f.pageCount} trang` : ''}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </aside>

      {viewer && (
        <MaterialViewerModal
          title={viewer.title}
          kind={viewer.kind}
          url={viewer.url}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}
