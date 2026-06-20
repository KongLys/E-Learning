'use client';

import { useState } from 'react';
import { FileText, Video, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { learnApi } from '@/lib/api/learn.api';
import {
  moderationApi,
  MODERATION_COLORS,
  MODERATION_LABELS,
  type DocumentParseStatus,
  type ModerationStatus,
} from '@/lib/api/ai.api';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { showPrompt } from '@/store/dialog.store';
import { QuizBuilder } from './QuizBuilder';
import { ReviewQuizUI } from '@/components/learn/ReviewQuizUI';
import { LESSON_TYPE_META, type LessonType } from './lessonTypeMeta';

const PARSE_LABEL: Record<DocumentParseStatus, string> = {
  uploaded: 'Chờ xử lý AI',
  parsing: 'Đang chuyển đổi tài liệu…',
  parsed: 'Đã chuyển đổi — đang index…',
  ready: 'AI đã sẵn sàng',
  failed: 'Lỗi xử lý tài liệu',
};

const PARSE_COLOR: Record<DocumentParseStatus, string> = {
  uploaded: 'bg-surface-strong text-ink-mute',
  parsing: 'bg-sky-soft text-sky animate-pulse',
  parsed: 'bg-sun-soft text-sun-deep animate-pulse',
  ready: 'bg-leaf-soft text-leaf-deep',
  failed: 'bg-coral-soft text-coral',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface LessonContentEditorProps {
  courseId: string;
  lesson: { id: string; title: string; type: LessonType };
  courseStatus?: string;
}

export function LessonContentEditor({ courseId, lesson, courseStatus }: LessonContentEditorProps) {
  const readOnly = courseStatus === 'published' || courseStatus === 'pending';
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [videoPct, setVideoPct] = useState<number | null>(null);
  const [docPct, setDocPct] = useState<number | null>(null);
  const [deleteVideoConfirm, setDeleteVideoConfirm] = useState(false);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState(false);
  const [reviewPreviewOpen, setReviewPreviewOpen] = useState(false);

  const isMediaLesson = lesson.type === 'video' || lesson.type === 'document';

  const { data, isLoading } = useQuery({
    queryKey: ['lesson-edit', lesson.id],
    queryFn: () => instructorApi.getLesson(lesson.id),
  });
  const detail: any = data?.data;

  const { data: videoUrlData } = useQuery({
    queryKey: ['instructor-video-url', lesson.id],
    queryFn: () => instructorApi.getVideoUrl(lesson.id),
    enabled: lesson.type === 'video' && !!detail?.videoAsset?.videoUrl,
  });

  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState('');
  const [completionMode, setCompletionMode] = useState<'percent_90' | 'ended_autonext'>('percent_90');
  const [contentHtml, setContentHtml] = useState('');
  const [minReadTimeSec, setMinReadTimeSec] = useState(0);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  if (detail && hydratedId !== lesson.id) {
    setTitle(detail.title ?? lesson.title);
    setDescription(detail.description ?? '');
    setCompletionMode(detail.videoAsset?.completionMode ?? 'percent_90');
    setContentHtml(detail.documentAsset?.contentHtml ?? '');
    setMinReadTimeSec(detail.documentAsset?.minReadTimeSec ?? 0);
    setHydratedId(lesson.id);
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lesson-edit', lesson.id] });
    qc.invalidateQueries({ queryKey: ['course-edit', courseId] });
    qc.invalidateQueries({ queryKey: ['instructor-video-url', lesson.id] });
  };
  const onErr = (e: any) => setError(e?.response?.data?.message ?? 'Có lỗi xảy ra');

  const saveBasics = useMutation({
    mutationFn: () => instructorApi.updateLesson(lesson.id, { title, description }),
    onSuccess: () => { setError(''); invalidate(); },
    onError: onErr,
  });

  const saveVideoConfig = useMutation({
    mutationFn: () => instructorApi.configVideo(lesson.id, { completionMode }),
    onSuccess: () => { setError(''); invalidate(); },
    onError: onErr,
  });

  const saveDocConfig = useMutation({
    mutationFn: () => instructorApi.configDocument(lesson.id, { contentHtml, minReadTimeSec }),
    onSuccess: () => { setError(''); invalidate(); },
    onError: onErr,
  });

  const uploadVideo = useMutation({
    mutationFn: (file: File) => instructorApi.uploadVideo(lesson.id, file, setVideoPct),
    onSuccess: () => { setVideoPct(null); setError(''); invalidate(); },
    onError: (e) => { setVideoPct(null); onErr(e); },
  });

  const uploadDoc = useMutation({
    mutationFn: (file: File) => instructorApi.uploadDocument(lesson.id, file, setDocPct),
    onSuccess: () => { setDocPct(null); setError(''); invalidate(); },
    onError: (e) => { setDocPct(null); onErr(e); },
  });

  const deleteVideoMut = useMutation({
    mutationFn: () => instructorApi.deleteVideo(lesson.id),
    onSuccess: () => { setDeleteVideoConfirm(false); setError(''); invalidate(); },
    onError: (e) => { setDeleteVideoConfirm(false); onErr(e); },
  });

  const deleteDocMut = useMutation({
    mutationFn: () => instructorApi.deleteDocument(lesson.id),
    onSuccess: () => { setDeleteDocConfirm(false); setError(''); invalidate(); },
    onError: (e) => { setDeleteDocConfirm(false); onErr(e); },
  });

  const appeal = useMutation({
    mutationFn: (reason?: string) => moderationApi.appealLesson(lesson.id, reason),
    onSuccess: () => { setError(''); invalidate(); },
    onError: onErr,
  });

  const { data: reviewQuizResp } = useQuery({
    queryKey: ['review-quiz-edit', lesson.id],
    queryFn: () => instructorApi.getReviewQuiz(lesson.id),
    enabled: isMediaLesson,
  });
  const reviewQuiz: any = reviewQuizResp?.data ?? null;

  const genReviewQuiz = useMutation({
    mutationFn: () => instructorApi.generateReviewQuiz(lesson.id),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['review-quiz-edit', lesson.id] }); },
    onError: onErr,
  });

  if (isLoading) return <div className="py-12"><LoadingSpinner /></div>;

  const videoAsset = detail?.videoAsset;
  const docAsset = detail?.documentAsset;
  const previewVideoUrl: string | undefined = videoUrlData?.data?.url;

  return (
    <div className="space-y-6">
      {/* Read-only banner */}
      {readOnly && (
        <div className="flex items-center gap-2 text-sm text-sun-deep bg-sun-soft border border-sun-deep rounded-lg px-3 py-2">
          <span>🔒</span>
          <span>Khóa học đang {courseStatus === 'published' ? 'xuất bản' : 'chờ duyệt'} — nội dung chỉ đọc. Hủy xuất bản để chỉnh sửa.</span>
        </div>
      )}

      {error && (
        <div className="text-sm text-semantic-error bg-coral-soft border border-coral rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Thông tin chung */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-mute">Thông tin chung</h3>
        <div>
          <label className="text-xs text-muted">Tiêu đề</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={readOnly}
            className="w-full text-sm bg-surface-card rounded-xl px-3 py-2.5 outline-none ring-1 ring-hairline-strong focus:ring-2 focus:ring-sky disabled:bg-surface-strong disabled:text-ink-faint disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label className="text-xs text-muted">Mục tiêu học tập</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly}
            rows={3}
            placeholder="Học viên có thể làm được gì sau khi hoàn thành bài học này?"
            className="w-full text-sm bg-surface-card rounded-xl px-3 py-2.5 outline-none ring-1 ring-hairline-strong focus:ring-2 focus:ring-sky disabled:bg-surface-strong disabled:text-ink-faint disabled:cursor-not-allowed"
          />
        </div>
        {!readOnly && (
          <button
            onClick={() => saveBasics.mutate()}
            disabled={saveBasics.isPending}
            className="text-xs bg-sky text-white px-4 py-2 rounded-pill hover:bg-sky-deep transition-colors disabled:opacity-50"
          >
            {saveBasics.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
          </button>
        )}
      </section>

      {/* ===== VIDEO ===== */}
      {lesson.type === 'video' && (
        <section className="space-y-3 border-t border-hairline pt-5">
          <h3 className="text-sm font-semibold text-ink-mute">Video bài giảng</h3>

          {videoAsset?.videoUrl ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-leaf-soft px-3 py-2">
              <span className="inline-flex items-center gap-1 text-xs text-leaf-deep truncate">
                <Video size={14} className="shrink-0" /> {videoAsset.fileName ?? 'video'}
              </span>
              {!readOnly && (
                <button
                  onClick={() => setDeleteVideoConfirm(true)}
                  className="shrink-0 text-xs text-coral hover:opacity-80"
                >
                  Xóa
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-subtle">Chưa có video</p>
          )}

          {videoPct !== null && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-surface-strong overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky transition-all duration-200"
                  style={{ width: `${videoPct}%` }}
                />
              </div>
              <p className="text-xs text-sky">Đang tải lên {videoPct}%</p>
            </div>
          )}

          {!readOnly && (
            <label className="inline-block cursor-pointer text-sm text-sky hover:underline">
              {videoAsset?.videoUrl ? 'Thay video khác' : 'Tải video lên'}
              <input
                type="file"
                accept="video/mp4,video/webm"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo.mutate(f); }}
              />
            </label>
          )}

          {previewVideoUrl && (
            <div className="space-y-1">
              <p className="text-xs text-muted">Xem trước</p>
              <video
                src={`${previewVideoUrl}#t=1`}
                controls
                preload="metadata"
                className="w-full max-h-72 rounded-xl bg-black"
              />
            </div>
          )}

          {!readOnly && (
            <div className="space-y-2">
              <label className="text-xs text-muted">Điều kiện hoàn thành</label>
              {([
                ['percent_90', 'Xem đủ 90% thời lượng video'],
                ['ended_autonext', 'Xem hết video, tự động chuyển bài kế tiếp'],
              ] as const).map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="completionMode"
                    checked={completionMode === val}
                    onChange={() => setCompletionMode(val)}
                  />
                  {label}
                </label>
              ))}
              <button
                onClick={() => saveVideoConfig.mutate()}
                disabled={saveVideoConfig.isPending}
                className="block text-xs bg-sky text-white px-4 py-2 rounded-pill hover:bg-sky-deep transition-colors disabled:opacity-50"
              >
                {saveVideoConfig.isPending ? 'Đang lưu...' : 'Lưu cấu hình video'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ===== DOCUMENT ===== */}
      {lesson.type === 'document' && (
        <section className="space-y-3 border-t border-hairline pt-5">
          <h3 className="text-sm font-semibold text-ink-mute">Tài liệu</h3>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {docAsset?.fileUrl && docAsset?.parseStatus && (
              <span className={`px-2 py-1 rounded-full font-medium ${PARSE_COLOR[docAsset.parseStatus as DocumentParseStatus]}`}>
                {PARSE_LABEL[docAsset.parseStatus as DocumentParseStatus]}
              </span>
            )}
            {detail?.moderationStatus && (
              <span className={`px-2 py-1 rounded-full font-medium ${MODERATION_COLORS[detail.moderationStatus as ModerationStatus]}`}>
                Kiểm duyệt: {MODERATION_LABELS[detail.moderationStatus as ModerationStatus]}
              </span>
            )}
            {detail?.moderationStatus === 'rejected' && (
              <button
                onClick={async () => {
                  const reason = (await showPrompt({ title: 'Lý do kiến nghị duyệt lại (tuỳ chọn):' })) ?? undefined;
                  appeal.mutate(reason || undefined);
                }}
                disabled={appeal.isPending}
                className="px-2 py-1 rounded-full border border-sun-deep text-sun-deep hover:bg-sun-soft disabled:opacity-50"
              >
                {appeal.isPending ? 'Đang gửi…' : 'Kiến nghị duyệt lại'}
              </button>
            )}
          </div>
          {detail?.moderationReason && detail?.moderationStatus !== 'approved' && (
            <p className="text-xs text-semantic-error">{detail.moderationReason}</p>
          )}
          {docAsset?.errorMsg && docAsset?.parseStatus === 'failed' && (
            <p className="text-xs text-semantic-error">{docAsset.errorMsg}</p>
          )}

          {docAsset?.fileUrl ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-leaf-soft px-3 py-2">
              <span className="inline-flex items-center gap-1 text-xs text-leaf-deep truncate">
                <FileText size={14} className="shrink-0" /> {docAsset.fileName ?? 'tài liệu'}
                {' · '}{docAsset.fileType?.toUpperCase()}
                {docAsset.fileSize ? ` · ${formatFileSize(Number(docAsset.fileSize))}` : ''}
              </span>
              {!readOnly && (
                <button
                  onClick={() => setDeleteDocConfirm(true)}
                  className="shrink-0 text-xs text-coral hover:opacity-80"
                >
                  Xóa
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-subtle">Chưa có file</p>
          )}

          {docPct !== null && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-surface-strong overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky transition-all duration-200"
                  style={{ width: `${docPct}%` }}
                />
              </div>
              <p className="text-xs text-sky">Đang tải lên {docPct}%</p>
            </div>
          )}

          {!readOnly && (
            <label className="inline-block cursor-pointer text-sm text-sky hover:underline">
              Tải file PDF / DOCX
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc.mutate(f); }}
              />
            </label>
          )}

          <div>
            <label className="text-xs text-muted">Nội dung để người học đọc (tuỳ chọn)</label>
            <RichTextEditor value={contentHtml} onChange={setContentHtml} readOnly={readOnly} placeholder="Soạn nội dung..." />
          </div>
          {!readOnly && (
          <div>
            <label className="text-xs text-muted">Thời gian đọc tối thiểu để hoàn thành (giây)</label>
            <input
              type="number"
              min={0}
              value={minReadTimeSec}
              onChange={(e) => setMinReadTimeSec(Math.max(0, Number(e.target.value) || 0))}
              className="w-32 text-sm bg-surface-card rounded-xl px-3 py-2.5 outline-none ring-1 ring-hairline-strong focus:ring-2 focus:ring-sky block"
            />
          </div>
          )}
          {!readOnly && (
            <button
              onClick={() => saveDocConfig.mutate()}
              disabled={saveDocConfig.isPending}
              className="text-xs bg-sky text-white px-4 py-2 rounded-pill hover:bg-sky-deep transition-colors disabled:opacity-50"
            >
              {saveDocConfig.isPending ? 'Đang lưu...' : 'Lưu nội dung tài liệu'}
            </button>
          )}
        </section>
      )}

      {/* ===== QUIZ ===== */}
      {lesson.type === 'quiz' && !readOnly && (
        <section className="border-t border-hairline pt-5">
          <h3 className="text-sm font-semibold text-ink-mute mb-3">
            {LESSON_TYPE_META.quiz.label}
          </h3>
          <QuizBuilder lessonId={lesson.id} onError={setError} />
        </section>
      )}

      {/* ===== QUIZ ÔN TẬP (AI) ===== */}
      {isMediaLesson && (
        <section className="space-y-3 border-t border-hairline pt-5">
          <h3 className="text-sm font-semibold text-ink-mute">Quiz ôn tập (AI)</h3>
          <p className="text-xs text-muted">
            Sinh câu hỏi trắc nghiệm ôn tập tự động từ nội dung bài học để học viên luyện tập.
            Không tính vào tiến độ khoá học.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => genReviewQuiz.mutate()}
              disabled={genReviewQuiz.isPending}
              className="text-xs bg-berry text-white px-4 py-2 rounded-pill hover:opacity-90 transition-colors disabled:opacity-50"
            >
              {genReviewQuiz.isPending
                ? 'Đang tạo...'
                : reviewQuiz
                  ? 'Tạo lại quiz ôn tập'
                  : 'Tạo quiz ôn tập'}
            </button>
            {reviewQuiz && (
              <button
                onClick={() => setReviewPreviewOpen(true)}
                className="text-xs border border-hairline px-4 py-2 rounded-pill hover:bg-canvas-soft"
              >
                Làm thử ({reviewQuiz.questions?.length ?? 0} câu)
              </button>
            )}
          </div>
        </section>
      )}

      {deleteVideoConfirm && (
        <ConfirmDialog
          title="Xóa video?"
          message={`File "${videoAsset?.fileName ?? 'video'}" sẽ bị xóa khỏi hệ thống. Bạn có thể upload lại sau.`}
          confirmLabel="Xóa video"
          isPending={deleteVideoMut.isPending}
          onConfirm={() => deleteVideoMut.mutate()}
          onCancel={() => setDeleteVideoConfirm(false)}
        />
      )}

      {deleteDocConfirm && (
        <ConfirmDialog
          title="Xóa tài liệu?"
          message={`File "${docAsset?.fileName ?? 'tài liệu'}" sẽ bị xóa khỏi hệ thống. Bạn có thể upload lại sau.`}
          confirmLabel="Xóa tài liệu"
          isPending={deleteDocMut.isPending}
          onConfirm={() => deleteDocMut.mutate()}
          onCancel={() => setDeleteDocConfirm(false)}
        />
      )}

      {reviewPreviewOpen && reviewQuiz && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setReviewPreviewOpen(false)}
        >
          <div
            className="my-8 w-full max-w-lg rounded-modal bg-surface-card shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-bold text-ink">Quiz ôn tập — làm thử</h2>
              <button
                onClick={() => setReviewPreviewOpen(false)}
                className="text-ink-subtle hover:text-ink"
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5">
              <ReviewQuizUI
                quiz={reviewQuiz}
                submit={(ans) => learnApi.submitReviewQuiz(lesson.id, ans)}
                onClose={() => setReviewPreviewOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
