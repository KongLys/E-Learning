'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';
import { myReviewQuizApi, type AskScope } from '@/lib/api/ai.api';
import { useAiChatBridge } from '@/store/ai-chat-bridge.store';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { VideoPlayer, formatSeconds } from '@/components/learn/VideoPlayer';
import { NotesPanel } from '@/components/learn/NotesPanel';
import { QuestionsPanel } from '@/components/learn/QuestionsPanel';
import { QuizUI } from '@/components/learn/QuizUI';
import { ReviewQuizUI } from '@/components/learn/ReviewQuizUI';
import { LearnSidebar } from '@/components/learn/LearnSidebar';
import { AiChatPanel } from '@/components/learn/AiChatPanel';
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
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(400);
  const [noteAddSignal, setNoteAddSignal] = useState(0);
  // Đã cuộn khỏi đầu trang → đẩy widget thời gian/hoàn thành trượt sang phải.
  const [docScrolled, setDocScrolled] = useState(false);
  const videoTimeRef = useRef(0);
  const completedRef = useRef(false);
  const aiResizingRef = useRef(false);

  const { data: lessonData, isLoading: lessonLoading } = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => learnApi.getLessonDetail(lessonId),
    // Giữ dữ liệu bài cũ khi chuyển bài → trang không sập về spinner toàn màn
    // hình, sidebar không bị unmount/remount (tránh "mất" click phải bấm 2-3 lần).
    placeholderData: keepPreviousData,
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

  // Quiz đang làm — hiển thị ngay trong cột nội dung (không dùng modal).
  // 'review' = quiz ôn tập theo bài; 'ai' = quiz cá nhân ("Quiz của tôi").
  const [activeQuiz, setActiveQuiz] = useState<{
    quiz: any;
    kind: 'review' | 'ai';
    scope?: AskScope;
  } | null>(null);
  const openMyQuiz = useMutation({
    mutationFn: (id: string) => myReviewQuizApi.get(id),
    onSuccess: (res) => openQuiz(res.data, 'ai'),
  });
  // Mở quiz ôn tập theo bài (từ sidebar) — có thể là bài khác bài đang xem.
  const openReviewQuiz = useMutation({
    mutationFn: (lid: string) => learnApi.getReviewQuiz(lid),
    onSuccess: (res) => openQuiz(res.data, 'review'),
  });

  // Podcast đang nghe — phát ở cột nội dung (giống quiz ôn tập), có thể là bài khác bài đang xem.
  const [activePodcast, setActivePodcast] = useState<{
    lessonId: string;
    lessonTitle: string;
    audioUrl: string;
    durationSec: number;
  } | null>(null);
  const openPodcast = useMutation({
    mutationFn: async ({ lid, title }: { lid: string; title: string }) => {
      const res = await learnApi.getPodcast(lid);
      return { lessonId: lid, lessonTitle: title, data: res.data };
    },
    onSuccess: ({ lessonId: lid, lessonTitle, data }) => {
      if (data?.status !== 'ready' || !data?.audioUrl) return;
      setActiveQuiz(null); // hai chế độ loại trừ nhau
      setActivePodcast({ lessonId: lid, lessonTitle, audioUrl: data.audioUrl, durationSec: data.durationSec ?? 0 });
      setSidebarOpen(false);
    },
  });

  // Mở quiz ở cột nội dung, GIỮ mục lục khung chương trình để điều hướng dễ.
  // Quiz ôn tập gắn với bài của chính nó (quiz.lessonId), không nhất thiết là bài đang xem.
  const openQuiz = (quiz: any, kind: 'review' | 'ai') => {
    const scope = kind === 'review' ? { lessonId: quiz.lessonId ?? lessonId } : undefined;
    setActivePodcast(null); // hai chế độ loại trừ nhau
    setActiveQuiz({ quiz, kind, scope });
    setSidebarOpen(false); // đóng overlay mục lục trên mobile; mục lục desktop vẫn hiện
  };

  const activePodcastKey = activePodcast ? `podcast:${activePodcast.lessonId}` : undefined;

  // Khoá quiz đang mở (để tô sáng trong mục lục): 'ai:<id>' hoặc 'review:<lessonId>'.
  const activeQuizKey = activeQuiz
    ? activeQuiz.kind === 'ai'
      ? `ai:${activeQuiz.quiz.id}`
      : `review:${activeQuiz.quiz.lessonId}`
    : undefined;

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

  // Đổi bài học thì thoát quiz đang mở để hiện nội dung bài (điều hướng qua lại mượt).
  useEffect(() => { setActiveQuiz(null); setActivePodcast(null); setDocScrolled(false); }, [lessonId]);

  // Kéo để mở rộng/thu nhỏ khung chat AI (cột phải)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!aiResizingRef.current) return;
      const w = window.innerWidth - e.clientX;
      const max = Math.round(window.innerWidth * 0.7);
      setAiPanelWidth(Math.min(Math.max(w, 320), max));
    };
    const onUp = () => {
      if (!aiResizingRef.current) return;
      aiResizingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startAiResize = (e: React.MouseEvent) => {
    e.preventDefault();
    aiResizingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  const goNext = () => { if (nextLessonId) router.push(`/learn/${courseId}/${nextLessonId}`); };

  // Mở khung chat AI bên phải, đồng thời thu gọn mục lục chương trình để lấy chỗ.
  const openAiPanel = () => { setAiPanelOpen(true); setOutlineCollapsed(true); setSidebarOpen(false); };

  // Khi có prompt được bơm vào panel (vd: nút "Vì sao đúng/sai?"), đảm bảo panel mở.
  const pendingAsk = useAiChatBridge((s) => s.pending);
  useEffect(() => {
    if (pendingAsk && !aiPanelOpen) openAiPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk]);

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
    <div className="flex flex-col h-[calc(100vh-4rem)]">
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
          <button
            onClick={() => (aiPanelOpen ? setAiPanelOpen(false) : openAiPanel())}
            className={`text-sm px-3 py-1.5 rounded ${
              aiPanelOpen
                ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            ✦ Hỏi AI
          </button>
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
          onNavigate={() => setSidebarOpen(false)}
          onOpenMyQuiz={(id) => openMyQuiz.mutate(id)}
          onOpenReviewQuiz={(lid) => openReviewQuiz.mutate(lid)}
          activeQuizKey={activeQuizKey}
          onOpenPodcast={(lid, title) => openPodcast.mutate({ lid, title })}
          activePodcastKey={activePodcastKey}
        />

        {/* Main content */}
        <main
          className="flex-1 overflow-y-auto p-4 lg:p-6"
          onScroll={(e) => {
            const next = e.currentTarget.scrollTop > 24;
            setDocScrolled((prev) => (prev === next ? prev : next));
          }}
        >
          <div className="max-w-4xl mx-auto space-y-5">
          {activeQuiz ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold truncate">
                  {activeQuiz.quiz.title || 'Quiz ôn tập'}
                </h2>
                <button
                  onClick={() => setActiveQuiz(null)}
                  className="shrink-0 text-sm font-medium text-gray-500 hover:text-gray-800"
                >
                  ← Quay lại bài học
                </button>
              </div>
              <ReviewQuizUI
                quiz={activeQuiz.quiz}
                askScope={activeQuiz.scope}
                submit={(ans) =>
                  activeQuiz.kind === 'review'
                    ? learnApi.submitReviewQuiz(activeQuiz.quiz.lessonId ?? lessonId, ans)
                    : myReviewQuizApi.submit(activeQuiz.quiz.id, ans)
                }
                onClose={() => setActiveQuiz(null)}
              />
            </div>
          ) : activePodcast ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold truncate">🎙 {activePodcast.lessonTitle}</h2>
                <button
                  onClick={() => setActivePodcast(null)}
                  className="shrink-0 text-sm font-medium text-gray-500 hover:text-gray-800"
                >
                  ← Quay lại bài học
                </button>
              </div>
              <div className="rounded-2xl bg-slate-50 p-5">
                <audio controls autoPlay preload="auto" src={activePodcast.audioUrl} className="w-full">
                  Trình duyệt của bạn không hỗ trợ phát audio.
                </audio>
              </div>
            </div>
          ) : (
          <>
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
              {/* Thanh tiêu đề + hành động — dính trên cùng, nội dung cuộn bên dưới.
                  Nút/đồng hồ canh phải thẳng mép phải nội dung; cuộn xuống trượt sang phải (motion). */}
              <div className="sticky top-0 z-10 -mt-2 flex items-start justify-between gap-4 bg-canvas pt-2 pb-2">
                <div className="min-w-0">
                  <h2 className="text-xl lg:text-2xl font-bold text-gray-900 leading-snug">{lesson.title}</h2>
                  {lesson.description && <p className="mt-1 text-sm text-gray-600">{lesson.description}</p>}
                </div>
                <div
                  className={`shrink-0 transition-transform duration-300 ease-out will-change-transform ${
                    docScrolled ? 'lg:translate-x-6' : 'lg:translate-x-0'
                  }`}
                >
                  {minReadTime > 0 && !docReadEnough ? (
                    <div className="flex flex-col items-center gap-1" title="Thời gian đọc còn lại">
                      <ReadTimerRing remaining={Math.max(minReadTime - readSec, 0)} progress={readSec / minReadTime} />
                      <span className="text-[11px] text-gray-400">Thời gian đọc</span>
                    </div>
                  ) : (
                    <button
                      onClick={completeDocument}
                      disabled={completeMutation.isPending}
                      className="rounded-full bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
                    >
                      {completeMutation.isPending ? 'Đang lưu...' : '✓ Đánh dấu hoàn thành'}
                    </button>
                  )}
                </div>
              </div>

              {/* Chỉ tên file + nút tải về — KHÔNG hiển thị nội dung tài liệu */}
              {docUrlData?.data?.url ? (
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 text-2xl">📄</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-800">{lesson.documentAsset?.fileName ?? 'Tài liệu'}</span>
                      {lesson.documentAsset?.fileType && (
                        <span className="mt-0.5 block text-xs text-gray-400">{lesson.documentAsset.fileType.toUpperCase()}</span>
                      )}
                    </span>
                  </div>
                  <a
                    href={docUrlData.data.url}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Tải về để đọc
                  </a>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 py-10 text-center text-gray-400">Tài liệu chưa được tải lên</div>
              )}

              {/* Hỏi đáp (mặc định đóng) */}
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
                    <QuestionsPanel lessonId={lessonId} positionType="none" getCurrentPosition={() => 0} />
                  </div>
                )}
              </div>
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

          {/* Tiêu đề bài học + hành động (video: hiện dưới video) */}
          {lesson.type === 'video' && (
            <>
              <div className="flex items-start justify-between gap-4 pt-1">
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900 leading-snug">{lesson.title}</h2>
                <button
                  onClick={saveNote}
                  className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  🗒 Lưu ghi chú
                </button>
              </div>
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

          </>
          )}
          </div>
        </main>

        {/* Khung chat AI (cột phải) — đẩy nội dung sang trái; overlay trên màn hình hẹp */}
        {aiPanelOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/30 lg:hidden"
              onClick={() => setAiPanelOpen(false)}
            />
            <aside
              style={{ width: aiPanelWidth }}
              className="fixed inset-y-0 right-0 z-40 max-w-full border-l bg-white shadow-xl lg:relative lg:z-auto lg:shrink-0 lg:shadow-none"
            >
              {/* Tay kéo để mở rộng/thu nhỏ (chỉ trên màn hình lớn) */}
              <div
                onMouseDown={startAiResize}
                onDoubleClick={() => setAiPanelWidth(400)}
                title="Kéo để thay đổi độ rộng · nhấp đúp để đặt lại"
                className="absolute left-0 top-0 hidden h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-purple-300 lg:block"
              />
              <AiChatPanel
                courseId={courseId}
                currentLessonId={lessonId}
                currentLessonType={lesson.type}
                currentLessonTitle={lesson.title}
                onClose={() => setAiPanelOpen(false)}
                onOpenQuiz={openQuiz}
                onOpenPodcast={(lid, title) => openPodcast.mutate({ lid, title })}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

/** Vòng tròn tiến trình thời gian đọc tài liệu, đếm ngược mm:ss ở giữa. */
function ReadTimerRing({ remaining, progress }: { remaining: number; progress: number }) {
  const R = 26;
  const CIRC = 2 * Math.PI * R;
  const pct = Math.min(Math.max(progress, 0), 1);
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={R} fill="none" stroke="#e5e7eb" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          stroke="#2563eb"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - pct)}
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-gray-700">
        {mm}:{String(ss).padStart(2, '0')}
      </span>
    </div>
  );
}
