'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { VideoPlayer } from '@/components/learn/VideoPlayer';
import { NotesPanel } from '@/components/learn/NotesPanel';
import { QuizUI } from '@/components/learn/QuizUI';
import { LearnSidebar } from '@/components/learn/LearnSidebar';
import { SafeHtml } from '@/components/common/SafeHtml';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export default function LearnPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<'notes' | 'questions'>('notes');
  const videoTimeRef = useRef(0);
  const completedRef = useRef(false);

  const { data: lessonData, isLoading: lessonLoading } = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => learnApi.getLessonDetail(lessonId),
  });

  const { data: sectionsData } = useQuery({
    queryKey: ['course-sections', courseId],
    queryFn: () => learnApi.getCourseSections(courseId),
  });

  const { data: progressData } = useQuery({
    queryKey: ['progress', courseId],
    queryFn: () => learnApi.getCourseProgress(courseId),
  });

  const { data: videoUrlData } = useQuery({
    queryKey: ['video-url', lessonId],
    queryFn: () => learnApi.getVideoUrl(lessonId),
    enabled: lessonData?.data?.type === 'video',
  });

  const { data: docUrlData } = useQuery({
    queryKey: ['doc-url', lessonId],
    queryFn: () => learnApi.getDocumentUrl(lessonId),
    enabled: lessonData?.data?.type === 'document',
  });

  const { data: quizData } = useQuery({
    queryKey: ['quiz', lessonId],
    queryFn: () => learnApi.getQuiz(lessonId),
    enabled: lessonData?.data?.type === 'quiz',
  });

  const lesson = lessonData?.data;
  const progress = progressData?.data;
  const lessonProgress: any[] = progress?.lessonProgress ?? [];
  const sections: any[] = sectionsData?.data ?? [];

  // Danh sách bài học phẳng (theo thứ tự) để xác định bài kế tiếp
  const flatLessons: { id: string }[] = sections.flatMap((s: any) => s.lessons ?? []);
  const currentIdx = flatLessons.findIndex((l) => l.id === lessonId);
  const nextLessonId = currentIdx >= 0 && currentIdx < flatLessons.length - 1 ? flatLessons[currentIdx + 1].id : null;

  const completeMutation = useMutation({
    mutationFn: () => learnApi.markComplete(lessonId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress', courseId] });
    },
  });

  // ----- Đếm thời gian ở trang cho bài tài liệu -----
  const [readSec, setReadSec] = useState(0);
  const minReadTime: number = lesson?.documentAsset?.minReadTimeSec ?? 0;
  useEffect(() => {
    if (lesson?.type !== 'document') return;
    const start = Date.now();
    const t = setInterval(() => setReadSec(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [lesson?.type, lessonId]);

  // Reset cờ hoàn thành khi đổi bài
  useEffect(() => { completedRef.current = false; }, [lessonId]);

  const goNext = () => { if (nextLessonId) router.push(`/learn/${courseId}/${nextLessonId}`); };

  const markCompleteOnce = (then?: () => void) => {
    if (completedRef.current) { then?.(); return; }
    completedRef.current = true;
    completeMutation.mutate(undefined, { onSuccess: () => then?.() });
  };

  // ----- Hoàn thành tài liệu (gửi watchTime rồi mark complete) -----
  const completeDocument = async () => {
    try {
      await learnApi.updateProgress(lessonId, 0, Math.max(readSec, minReadTime));
      completeMutation.mutate();
    } catch { /* ignore */ }
  };

  if (lessonLoading) return <LoadingSpinner />;
  if (!lesson) return <div className="p-8 text-center text-gray-500">Bài học không tìm thấy</div>;

  const initialPos = lessonProgress.find((lp: any) => lp.lessonId === lessonId)?.lastPositionSec ?? 0;
  const videoCompletionMode: 'percent_90' | 'ended_autonext' = lesson.videoAsset?.completionMode ?? 'percent_90';
  const docReadEnough = readSec >= minReadTime;

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header className="border-b px-4 py-3 flex items-center gap-4 bg-white">
        <Link href={`/my-courses`} className="text-sm text-gray-500 hover:text-gray-700">← Khóa học</Link>
        <h1 className="font-semibold text-gray-900 flex-1 truncate">{lesson.title}</h1>
        <Link
          href={`/learn/${courseId}/ai`}
          className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700"
        >
          Hỏi AI
        </Link>
        <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-sm border px-3 py-1.5 rounded">☰ Nội dung</button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
          {lesson.description && <p className="text-sm text-gray-600">{lesson.description}</p>}

          {lesson.type === 'video' && videoUrlData?.data?.url && (
            <VideoPlayer
              lessonId={lessonId}
              videoUrl={videoUrlData.data.url}
              initialPositionSec={initialPos}
              onTimeUpdate={(t) => { videoTimeRef.current = t; }}
              onProgress={(cur, dur) => {
                if (videoCompletionMode === 'percent_90' && dur > 0 && cur / dur >= 0.9) {
                  markCompleteOnce();
                }
              }}
              onEnded={() => {
                markCompleteOnce(videoCompletionMode === 'ended_autonext' ? goNext : undefined);
              }}
            />
          )}

          {lesson.type === 'document' && (
            <div className="space-y-4">
              {/* Nội dung rich text */}
              {lesson.documentAsset?.contentHtml && (
                <SafeHtml html={lesson.documentAsset.contentHtml} className="prose prose-sm max-w-none border rounded-xl p-4" />
              )}

              {/* File đính kèm */}
              {docUrlData?.data?.url ? (
                lesson.documentAsset?.fileType === 'pdf' ? (
                  <iframe src={docUrlData.data.url} className="w-full h-150 border rounded-xl" title="PDF" />
                ) : (
                  <div className="text-center text-gray-600 py-8 border rounded-xl">
                    <p className="mb-3">Tài liệu Word (.docx)</p>
                    <a href={docUrlData.data.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Tải về để đọc</a>
                  </div>
                )
              ) : (
                !lesson.documentAsset?.contentHtml && <div className="text-center py-8 text-gray-400">Tài liệu chưa được tải lên</div>
              )}

              <button
                onClick={completeDocument}
                disabled={!docReadEnough || completeMutation.isPending}
                className="w-full border border-green-500 text-green-600 py-2.5 rounded-lg text-sm font-medium hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {completeMutation.isPending
                  ? 'Đang lưu...'
                  : docReadEnough
                    ? '✓ Đánh dấu hoàn thành'
                    : `Cần đọc thêm ${minReadTime - readSec}s để hoàn thành`}
              </button>
            </div>
          )}

          {lesson.type === 'quiz' && quizData?.data && (
            <QuizUI
              lessonId={lessonId}
              quiz={quizData.data}
              onPassed={() => qc.invalidateQueries({ queryKey: ['progress', courseId] })}
            />
          )}

          {/* Tabs: notes / questions */}
          <div className="border rounded-xl overflow-hidden">
            <div className="flex border-b">
              {(['notes', 'questions'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {t === 'notes' ? 'Ghi chú' : 'Câu hỏi nhanh'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === 'notes' && (
                <NotesPanel
                  lessonId={lessonId}
                  positionType={lesson.type === 'video' ? 'video_timestamp' : lesson.type === 'document' ? 'document_page' : 'none'}
                  getCurrentPosition={() => videoTimeRef.current}
                  onJumpTo={(pos) => {
                    const video = document.querySelector('video');
                    if (video) video.currentTime = pos;
                  }}
                />
              )}
              {tab === 'questions' && (
                <div className="text-sm text-gray-500 text-center py-4">
                  Tính năng câu hỏi nhanh (Phase 12)
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Sidebar */}
        <LearnSidebar
          courseId={courseId}
          currentLessonId={lessonId}
          sections={sections}
          lessonProgress={lessonProgress}
          progressPercent={progress?.progressPercent ?? 0}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
    </div>
  );
}
