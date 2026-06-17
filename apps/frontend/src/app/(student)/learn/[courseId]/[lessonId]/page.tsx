'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { VideoPlayer, formatSeconds } from '@/components/learn/VideoPlayer';
import { NotesPanel } from '@/components/learn/NotesPanel';
import { QuestionsPanel } from '@/components/learn/QuestionsPanel';
import { QuizUI } from '@/components/learn/QuizUI';
import { ReviewQuizUI } from '@/components/learn/ReviewQuizUI';
import { LearnSidebar } from '@/components/learn/LearnSidebar';
import { SafeHtml } from '@/components/common/SafeHtml';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export default function LearnPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const [tab, setTab] = useState<'content' | 'notes' | 'questions'>('content');
  const [qaOpen, setQaOpen] = useState(false);
  const [reviewQuizOpen, setReviewQuizOpen] = useState(false);
  const [noteAddSignal, setNoteAddSignal] = useState(0);
  const videoTimeRef = useRef(0);
  const completedRef = useRef(false);

  const { data: lessonData, isLoading: lessonLoading } = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => learnApi.getLessonDetail(lessonId),
  });

  const { data: sectionsData } = useQuery({
    queryKey: ['course-sections', courseId],
    // Return the array body (not the full axios response) so this cache entry
    // has the same shape everywhere it's read — the AI chat page shares this
    // query key and calls .map() on the cached value.
    queryFn: async () => (await learnApi.getCourseSections(courseId)).data,
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

  // Phụ đề + phân tích nội dung theo khung thời gian (tự sinh bằng AI).
  // Poll lại khi đang xử lý để hiển thị ngay khi job hoàn tất.
  const { data: transcriptData } = useQuery({
    queryKey: ['transcript', lessonId],
    queryFn: () => learnApi.getTranscript(lessonId),
    enabled: lessonData?.data?.type === 'video',
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.data?.status;
      return s === 'pending' || s === 'processing' ? 8000 : false;
    },
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

  // Quiz ôn tập (AI) — chỉ cho bài video/tài liệu
  const reviewQuizEnabled =
    lessonData?.data?.type === 'video' || lessonData?.data?.type === 'document';
  const { data: reviewQuizData } = useQuery({
    queryKey: ['review-quiz', lessonId],
    queryFn: () => learnApi.getReviewQuiz(lessonId),
    enabled: reviewQuizEnabled,
  });
  const reviewQuiz = reviewQuizData?.data ?? null;

  const generateReviewQuiz = useMutation({
    mutationFn: () => learnApi.generateReviewQuiz(lessonId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-quiz', lessonId] }),
  });

  // Podcast (AI) — chỉ cho bài đọc (tài liệu). Poll lại khi đang xử lý.
  const podcastEnabled = lessonData?.data?.type === 'document';
  const { data: podcastData } = useQuery({
    queryKey: ['podcast', lessonId],
    queryFn: () => learnApi.getPodcast(lessonId),
    enabled: podcastEnabled,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.data?.status;
      return s === 'pending' || s === 'processing' ? 5000 : false;
    },
  });
  const podcast = podcastData?.data ?? null;
  const generatePodcast = useMutation({
    mutationFn: () => learnApi.generatePodcast(lessonId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['podcast', lessonId] }),
  });

  const lesson = lessonData?.data;
  const progress = progressData?.data;
  const lessonProgress: any[] = progress?.lessonProgress ?? [];
  const sections: any[] = sectionsData ?? [];

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

  const jumpToVideo = (pos: number) => {
    const video = document.querySelector('video');
    if (video) { video.currentTime = pos; video.play().catch(() => {}); }
  };

  const notePositionType = lesson.type === 'video' ? 'video_timestamp' : lesson.type === 'document' ? 'document_page' : 'none';
  const courseTitle: string | undefined = lesson?.section?.course?.title;
  const saveNote = () => { setTab('notes'); setNoteAddSignal((n) => n + 1); };
  const transcript = transcriptData?.data;
  const cues = transcript?.cues ?? [];
  const chapters = transcript?.segments ?? [];
  const transcriptStatus: string = transcript?.status ?? 'none';
  const TABS: [typeof tab, string][] = [['content', 'Nội dung'], ['notes', 'Ghi chú'], ['questions', 'Hỏi đáp']];

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header className="border-b border-gray-100 px-4 py-3 flex items-center gap-3 bg-white shrink-0">
        <button
          onClick={() => { setOutlineCollapsed((v) => !v); setSidebarOpen(true); }}
          className="text-gray-600 hover:text-gray-900 text-xl leading-none px-1"
          aria-label="Mở/đóng nội dung khóa học"
        >
          ☰
        </button>
        <Link href={`/my-courses`} className="font-medium text-gray-700 hover:text-gray-900 flex-1 truncate" title="Quay lại khóa học của tôi">
          {courseTitle ?? '← Khóa học của tôi'}
        </Link>
        {lesson.type !== 'quiz' && (
          <Link
            href={`/learn/${courseId}/ai`}
            className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700"
          >
            ✦ Hỏi AI
          </Link>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Course outline (left) */}
        <LearnSidebar
          courseId={courseId}
          courseTitle={courseTitle}
          currentLessonId={lessonId}
          sections={sections}
          lessonProgress={lessonProgress}
          progressPercent={progress?.progressPercent ?? 0}
          isOpen={sidebarOpen}
          collapsed={outlineCollapsed}
          onClose={() => { setSidebarOpen(false); setOutlineCollapsed(true); }}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-4xl mx-auto space-y-5">
          {lesson.type === 'video' && videoUrlData?.data?.url && (
            <VideoPlayer
              lessonId={lessonId}
              videoUrl={videoUrlData.data.url}
              initialPositionSec={initialPos}
              cues={cues}
              chapters={chapters}
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
                <SafeHtml html={lesson.documentAsset.contentHtml} className="prose prose-sm max-w-none rounded-2xl bg-slate-50 p-6" />
              )}

              {/* File đính kèm */}
              {docUrlData?.data?.url ? (
                lesson.documentAsset?.fileType === 'pdf' ? (
                  <div className="space-y-2">
                    {lesson.documentAsset?.fileName && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        📄 <span className="font-medium text-gray-700">{lesson.documentAsset.fileName}</span>
                      </p>
                    )}
                    <iframe src={docUrlData.data.url} className="w-full h-150 rounded-2xl ring-1 ring-gray-100" title={lesson.documentAsset?.fileName ?? 'PDF'} />
                  </div>
                ) : (
                  <div className="text-center text-gray-600 py-10 rounded-2xl bg-slate-50">
                    <p className="mb-1 text-sm font-medium text-gray-800">
                      📄 {lesson.documentAsset?.fileName ?? 'Tài liệu Word (.docx)'}
                    </p>
                    {lesson.documentAsset?.fileName && (
                      <p className="mb-3 text-xs text-gray-400">DOCX</p>
                    )}
                    <a href={docUrlData.data.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">Tải về để đọc</a>
                  </div>
                )
              ) : (
                !lesson.documentAsset?.contentHtml && <div className="text-center py-10 text-gray-400">Tài liệu chưa được tải lên</div>
              )}

              {/* Podcast (AI) — nghe bản đọc nội dung bài học */}
              <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    🎙 <span>Podcast bài học</span>
                  </div>
                  {podcast?.status === 'ready' ? (
                    <button
                      onClick={() => generatePodcast.mutate()}
                      disabled={generatePodcast.isPending}
                      title="Tạo lại podcast mới"
                      className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    >
                      {generatePodcast.isPending ? 'Đang tạo...' : 'Tạo lại'}
                    </button>
                  ) : podcast?.status === 'pending' || podcast?.status === 'processing' ? (
                    <span className="text-xs text-gray-500">⏳ Đang tạo podcast…</span>
                  ) : (
                    <button
                      onClick={() => generatePodcast.mutate()}
                      disabled={generatePodcast.isPending}
                      className="inline-flex items-center gap-1.5 text-sm font-medium bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-60"
                    >
                      {generatePodcast.isPending ? '⏳ Đang tạo...' : '✦ Tạo podcast'}
                    </button>
                  )}
                </div>
                {podcast?.status === 'ready' && podcast.audioUrl && (
                  <audio controls preload="none" src={podcast.audioUrl} className="w-full">
                    Trình duyệt của bạn không hỗ trợ phát audio.
                  </audio>
                )}
                {podcast?.status === 'failed' && (
                  <p className="text-sm text-red-600">
                    {podcast.errorMsg ?? 'Không tạo được podcast, vui lòng thử lại.'}
                  </p>
                )}
                {generatePodcast.isError && (
                  <p className="text-sm text-red-600">
                    {(generatePodcast.error as any)?.response?.data?.message ??
                      'Không tạo được podcast, vui lòng thử lại.'}
                  </p>
                )}
              </div>

              <button
                onClick={completeDocument}
                disabled={!docReadEnough || completeMutation.isPending}
                className={`w-full py-3 rounded-full text-sm font-semibold transition-colors disabled:cursor-not-allowed ${docReadEnough ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-100 text-gray-400'}`}
              >
                {completeMutation.isPending
                  ? 'Đang lưu...'
                  : docReadEnough
                    ? '✓ Đánh dấu hoàn thành'
                    : `Cần đọc thêm ${minReadTime - readSec}s để hoàn thành`}
              </button>
            </div>
          )}

          {/* Tiêu đề bài học + hành động (quiz: hiện trên đầu) */}
          {lesson.type === 'quiz' && (
            <>
              <h2 className="text-xl lg:text-2xl font-bold text-gray-900 leading-snug">{lesson.title}</h2>
              {lesson.description && <p className="text-sm text-gray-600 -mt-3">{lesson.description}</p>}
            </>
          )}

          {lesson.type === 'quiz' && quizData?.data && (
            <QuizUI
              lessonId={lessonId}
              quiz={quizData.data}
              onPassed={() => qc.invalidateQueries({ queryKey: ['progress', courseId] })}
            />
          )}

          {/* Tiêu đề bài học + hành động (video/document: hiện dưới nội dung) */}
          {lesson.type !== 'quiz' && (
            <>
              <div className="flex items-start justify-between gap-4 pt-1">
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900 leading-snug">{lesson.title}</h2>
                <div className="shrink-0 flex items-center gap-3">
                  {lesson.type === 'video' && (
                    <button
                      onClick={saveNote}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      🗒 Lưu ghi chú
                    </button>
                  )}
                  {reviewQuiz ? (
                    <>
                      <button
                        onClick={() => setReviewQuizOpen(true)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700"
                      >
                        📝 Làm bài ôn tập
                      </button>
                      <button
                        onClick={() => generateReviewQuiz.mutate()}
                        disabled={generateReviewQuiz.isPending}
                        title="Tạo lại bộ câu hỏi ôn tập mới"
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      >
                        {generateReviewQuiz.isPending ? 'Đang tạo...' : 'Tạo lại'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => generateReviewQuiz.mutate()}
                      disabled={generateReviewQuiz.isPending}
                      className="inline-flex items-center gap-1.5 text-sm font-medium bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-60"
                    >
                      {generateReviewQuiz.isPending ? '⏳ Đang tạo quiz...' : '✦ Tạo quiz ôn tập'}
                    </button>
                  )}
                </div>
              </div>
              {generateReviewQuiz.isError && (
                <p className="text-sm text-red-600 -mt-2">
                  {(generateReviewQuiz.error as any)?.response?.data?.message ??
                    'Không tạo được quiz ôn tập, vui lòng thử lại.'}
                </p>
              )}
              {lesson.description && <p className="text-sm text-gray-600 -mt-3">{lesson.description}</p>}
            </>
          )}

          {/* Video: tabs Nội dung / Ghi chú / Hỏi đáp */}
          {lesson.type === 'video' && (
            <div>
              <div className="flex gap-6 border-b">
                {TABS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="pt-4">
                {tab === 'content' && (
                  <div className="space-y-3">
                    {(transcriptStatus === 'pending' || transcriptStatus === 'processing') && (
                      <p className="text-sm text-gray-500">⏳ Đang tạo phụ đề & phân tích nội dung video…</p>
                    )}
                    {transcriptStatus === 'failed' && (
                      <p className="text-sm text-gray-500">Không tạo được phụ đề cho video này.</p>
                    )}
                    {transcriptStatus === 'ready' && chapters.length === 0 && (
                      <p className="text-sm text-gray-500">Chưa có phân tích nội dung cho video này.</p>
                    )}
                    {chapters.map((c: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => jumpToVideo(c.startSec)}
                        className="block w-full text-left rounded-xl border border-gray-100 p-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-blue-600">⏱ {formatSeconds(c.startSec)}</span>
                          <span className="text-sm font-semibold text-gray-900">{c.title}</span>
                        </div>
                        {c.summary && <p className="mt-1 text-sm text-gray-600">{c.summary}</p>}
                      </button>
                    ))}
                  </div>
                )}
                {tab === 'notes' && (
                  <NotesPanel
                    lessonId={lessonId}
                    lessonTitle={lesson.title}
                    positionType={notePositionType}
                    getCurrentPosition={() => videoTimeRef.current}
                    onJumpTo={jumpToVideo}
                    addSignal={noteAddSignal}
                  />
                )}
                {tab === 'questions' && (
                  <QuestionsPanel
                    lessonId={lessonId}
                    positionType="video_timestamp"
                    getCurrentPosition={() => videoTimeRef.current}
                    onJumpTo={jumpToVideo}
                  />
                )}
              </div>
            </div>
          )}

          {/* Document: nút mở Hỏi đáp (mặc định đóng) */}
          {lesson.type === 'document' && (
            <div className="rounded-2xl bg-slate-50 overflow-hidden">
              <button
                onClick={() => setQaOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-slate-100/70 transition-colors"
              >
                <span>💬 Hỏi đáp</span>
                <span className={`text-gray-400 transition-transform ${qaOpen ? 'rotate-180' : ''}`}>⌄</span>
              </button>
              {qaOpen && (
                <div className="px-4 pb-4">
                  <QuestionsPanel
                    lessonId={lessonId}
                    positionType="none"
                    getCurrentPosition={() => 0}
                  />
                </div>
              )}
            </div>
          )}
          </div>
        </main>
      </div>

      {/* Modal làm bài ôn tập */}
      {reviewQuizOpen && reviewQuiz && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setReviewQuizOpen(false)}
        >
          <div
            className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold">Quiz ôn tập</h2>
              <button
                onClick={() => setReviewQuizOpen(false)}
                className="text-xl text-gray-400 hover:text-gray-700"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-5">
              <ReviewQuizUI
                lessonId={lessonId}
                quiz={reviewQuiz}
                onClose={() => setReviewQuizOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
