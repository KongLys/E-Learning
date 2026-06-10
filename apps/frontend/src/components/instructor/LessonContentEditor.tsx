'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { QuizBuilder } from './QuizBuilder';
import { LESSON_TYPE_META, type LessonType } from './lessonTypeMeta';

interface LessonContentEditorProps {
  courseId: string;
  lesson: { id: string; title: string; type: LessonType };
}

/**
 * Trình soạn nội dung của một bài học (tiêu đề, mục tiêu/mô tả, và phần riêng theo
 * loại bài: video / tài liệu / quiz). Dùng chung cho trang builder chi tiết.
 */
export function LessonContentEditor({ courseId, lesson }: LessonContentEditorProps) {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['lesson-edit', lesson.id],
    queryFn: () => instructorApi.getLesson(lesson.id),
  });
  const detail: any = data?.data;

  // ----- Common: title + description -----
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState('');
  // ----- Video -----
  const [completionMode, setCompletionMode] = useState<'percent_90' | 'ended_autonext'>('percent_90');
  // ----- Document -----
  const [contentHtml, setContentHtml] = useState('');
  const [minReadTimeSec, setMinReadTimeSec] = useState(0);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  // Prefill khi detail tải xong, và nạp lại khi đổi sang bài khác
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
    mutationFn: (file: File) => instructorApi.uploadVideo(lesson.id, file, setUploadPct),
    onSuccess: () => { setUploadPct(null); setError(''); invalidate(); },
    onError: (e) => { setUploadPct(null); onErr(e); },
  });

  const uploadDoc = useMutation({
    mutationFn: (file: File) => instructorApi.uploadDocument(lesson.id, file, setUploadPct),
    onSuccess: () => { setUploadPct(null); setError(''); invalidate(); },
    onError: (e) => { setUploadPct(null); onErr(e); },
  });

  if (isLoading) return <div className="py-12"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Thông tin chung */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Thông tin chung</h3>
        <div>
          <label className="text-xs text-gray-500">Tiêu đề</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-sm bg-white rounded-xl px-3 py-2.5 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Mục tiêu học tập</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Học viên có thể làm được gì sau khi hoàn thành bài học này?"
            className="w-full text-sm bg-white rounded-xl px-3 py-2.5 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <button
          onClick={() => saveBasics.mutate()}
          disabled={saveBasics.isPending}
          className="text-xs bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saveBasics.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
        </button>
      </section>

      {/* ===== VIDEO ===== */}
      {lesson.type === 'video' && (
        <section className="space-y-3 border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-700">Video bài giảng</h3>
          {detail?.videoAsset?.videoUrl ? (
            <p className="text-xs text-green-600">✓ Đã tải video lên</p>
          ) : (
            <p className="text-xs text-gray-400">Chưa có video</p>
          )}
          <label className="inline-block cursor-pointer text-sm text-blue-600 hover:underline">
            {uploadPct !== null
              ? `Đang tải ${uploadPct}%`
              : detail?.videoAsset?.videoUrl
                ? 'Thay video khác'
                : 'Tải video lên'}
            <input
              type="file"
              accept="video/mp4,video/webm"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo.mutate(f); }}
            />
          </label>

          <div className="space-y-2">
            <label className="text-xs text-gray-500">Điều kiện hoàn thành</label>
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
              className="block text-xs bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saveVideoConfig.isPending ? 'Đang lưu...' : 'Lưu cấu hình video'}
            </button>
          </div>
        </section>
      )}

      {/* ===== DOCUMENT ===== */}
      {lesson.type === 'document' && (
        <section className="space-y-3 border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-700">Tài liệu</h3>
          {detail?.documentAsset?.fileUrl ? (
            <p className="text-xs text-green-600">✓ Đã tải file ({detail.documentAsset.fileType?.toUpperCase()})</p>
          ) : (
            <p className="text-xs text-gray-400">Chưa có file</p>
          )}
          <label className="inline-block cursor-pointer text-sm text-blue-600 hover:underline">
            {uploadPct !== null ? `Đang tải ${uploadPct}%` : 'Tải file PDF / DOCX'}
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc.mutate(f); }}
            />
          </label>

          <div>
            <label className="text-xs text-gray-500">Nội dung để người học đọc (tuỳ chọn)</label>
            <RichTextEditor value={contentHtml} onChange={setContentHtml} placeholder="Soạn nội dung..." />
          </div>
          <div>
            <label className="text-xs text-gray-500">Thời gian đọc tối thiểu để hoàn thành (giây)</label>
            <input
              type="number"
              min={0}
              value={minReadTimeSec}
              onChange={(e) => setMinReadTimeSec(Math.max(0, Number(e.target.value) || 0))}
              className="w-32 text-sm bg-white rounded-xl px-3 py-2.5 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 block"
            />
          </div>
          <button
            onClick={() => saveDocConfig.mutate()}
            disabled={saveDocConfig.isPending}
            className="text-xs bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saveDocConfig.isPending ? 'Đang lưu...' : 'Lưu nội dung tài liệu'}
          </button>
        </section>
      )}

      {/* ===== QUIZ ===== */}
      {lesson.type === 'quiz' && (
        <section className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {LESSON_TYPE_META.quiz.label}
          </h3>
          <QuizBuilder lessonId={lesson.id} onError={setError} />
        </section>
      )}
    </div>
  );
}
