'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';
import { courseApi } from '@/lib/api/course.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { VideoPlayer } from '@/components/learn/VideoPlayer';
import { NotesPanel } from '@/components/learn/NotesPanel';
import { QuizUI } from '@/components/learn/QuizUI';
import { LearnSidebar } from '@/components/learn/LearnSidebar';
import { useState, useRef } from 'react';
import Link from 'next/link';

export default function LearnPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<'notes' | 'questions'>('notes');
  const videoTimeRef = useRef(0);

  const { data: lessonData, isLoading: lessonLoading } = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => learnApi.getLessonDetail(lessonId),
  });

  const { data: courseData } = useQuery({
    queryKey: ['course-detail', courseId],
    queryFn: () => courseApi.getCourseBySlug(courseId),
    enabled: false,
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

  const completeMutation = useMutation({
    mutationFn: () => learnApi.markComplete(lessonId),
  });

  const lesson = lessonData?.data;
  const progress = progressData?.data;
  const lessonProgress: any[] = progress?.lessonProgress ?? [];
  const sections = courseData?.data?.sections ?? [];

  if (lessonLoading) return <LoadingSpinner />;
  if (!lesson) return <div className="p-8 text-center text-gray-500">Bài học không tìm thấy</div>;

  const initialPos = lessonProgress.find((lp: any) => lp.lessonId === lessonId)?.lastPositionSec ?? 0;

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header className="border-b px-4 py-3 flex items-center gap-4 bg-white">
        <Link href={`/my-courses`} className="text-sm text-gray-500 hover:text-gray-700">← Khóa học</Link>
        <h1 className="font-semibold text-gray-900 flex-1 truncate">{lesson.title}</h1>
        <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-sm border px-3 py-1.5 rounded">☰ Nội dung</button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
          {lesson.type === 'video' && videoUrlData?.data?.url && (
            <VideoPlayer
              lessonId={lessonId}
              videoUrl={videoUrlData.data.url}
              initialPositionSec={initialPos}
              onTimeUpdate={(t) => { videoTimeRef.current = t; }}
            />
          )}

          {lesson.type === 'document' && (
            <div className="space-y-4">
              {docUrlData?.data?.url ? (
                <>
                  {/* Lazy import PDFReader to avoid SSR issues */}
                  <div className="text-center text-gray-500 py-8 border rounded-xl">
                    <p className="mb-4">PDF: {docUrlData.data.url}</p>
                    <a href={docUrlData.data.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Mở trong tab mới</a>
                  </div>
                  <button
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending}
                    className="w-full border border-green-500 text-green-600 py-2.5 rounded-lg text-sm font-medium hover:bg-green-50 disabled:opacity-50"
                  >
                    {completeMutation.isPending ? 'Đang lưu...' : '✓ Đánh dấu hoàn thành'}
                  </button>
                </>
              ) : (
                <div className="text-center py-8 text-gray-400">Tài liệu chưa được tải lên</div>
              )}
            </div>
          )}

          {lesson.type === 'quiz' && quizData?.data && (
            <QuizUI
              lessonId={lessonId}
              quiz={quizData.data}
              onPassed={() => {}}
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
