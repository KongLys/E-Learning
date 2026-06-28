'use client';

import { useState, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { SafeHtml } from '@/components/common/SafeHtml';
import { notify, showPrompt } from '@/store/dialog.store';
import { getApiErrorMessage } from '@/lib/api/error';
import type { CourseSummary, AdminCourseDetail, SectionSummary, LessonSummary } from '@/types/course';
import {
  FileText, PenLine, X, ChevronDown, ChevronLeft, ChevronRight,
  Video, File as FileIcon, CheckCircle, Clock, AlertCircle, XCircle,
} from 'lucide-react';

type Tab = 'pending' | 'all';

// ─── Reject dialog ─────────────────────────────────────────────────────────────

function RejectDialog({ courseName, onConfirm, onCancel }: { courseName: string; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full space-y-4">
        <h2 className="font-semibold text-gray-900">Từ chối khóa học</h2>
        <p className="text-sm text-gray-600">Khóa học: <strong>{courseName}</strong></p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Lý do từ chối..."
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
        />
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Hủy</button>
          <button onClick={() => reason.trim() && onConfirm(reason.trim())} disabled={!reason.trim()} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Từ chối</button>
        </div>
      </div>
    </div>
  );
}

// ─── Moderation badge ─────────────────────────────────────────────────────────

const MOD_ICON: Record<string, React.ReactNode> = {
  approved: <CheckCircle size={13} className="text-green-500" />,
  pending: <Clock size={13} className="text-amber-500" />,
  appealing: <Clock size={13} className="text-blue-500" />,
  rejected: <XCircle size={13} className="text-red-500" />,
  locked: <XCircle size={13} className="text-red-700" />,
};
const MOD_LABEL: Record<string, string> = {
  approved: 'Đã duyệt', pending: 'Chờ duyệt', appealing: 'Kiến nghị', rejected: 'Từ chối', locked: 'Khóa',
};

// ─── Lesson video player (no progress tracking) ──────────────────────────────

function AdminVideoPlayer({ lessonId }: { lessonId: string }) {
  const { data: urlData, isLoading: urlLoading } = useQuery({
    queryKey: ['admin-lesson-video-url', lessonId],
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api/axios');
      const res = await apiClient.get(`/lessons/${lessonId}/video-url`);
      return res.data as { url: string };
    },
  });

  if (urlLoading) return <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-400">Đang tải video…</div>;
  if (!urlData?.url) return <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-400">Chưa có video</div>;

  return (
    <video
      src={urlData.url}
      controls
      className="w-full rounded-lg bg-black aspect-video"
    />
  );
}

// ─── Document viewer (contentHtml or file link) ───────────────────────────────

function AdminDocViewer({ lesson }: { lesson: LessonSummary }) {
  const doc = lesson.documentAsset;
  if (!doc) return <p className="text-sm text-gray-400">Chưa có tài liệu</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <FileIcon size={14} />
        <span className="font-medium">{doc.fileName ?? 'Tài liệu'}</span>
        <span className="text-gray-400 text-xs">{doc.fileType?.toUpperCase()}</span>
        {doc.fileSize && <span className="text-gray-400 text-xs">{(Number(doc.fileSize) / 1024 / 1024).toFixed(1)} MB</span>}
        {(doc.pageCount ?? 0) > 0 && <span className="text-gray-400 text-xs">{doc.pageCount} trang</span>}
        {doc.fileUrl && (
          <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="ml-auto text-blue-600 hover:underline text-xs">Mở file</a>
        )}
      </div>
      {doc.contentHtml ? (
        <div
          className="prose prose-sm max-w-none border rounded-lg p-3 max-h-64 overflow-y-auto text-sm text-gray-700"
          dangerouslySetInnerHTML={{ __html: doc.contentHtml }}
        />
      ) : (
        <p className="text-xs text-gray-400 italic">Chưa có nội dung bài đọc đã xử lý</p>
      )}
    </div>
  );
}

// ─── Lesson row (expandable) ─────────────────────────────────────────────────

function LessonRow({
  lesson,
  onApprove,
  onReject,
  isMutating,
}: {
  lesson: LessonSummary;
  onApprove?: () => void;
  onReject?: (reason?: string) => void;
  isMutating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const typeIcon = lesson.type === 'video' ? <Video size={14} className="text-blue-500" /> : lesson.type === 'document' ? <FileText size={14} className="text-amber-500" /> : <PenLine size={14} className="text-purple-500" />;
  const needsAction = lesson.moderationStatus && lesson.moderationStatus !== 'approved';

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-white hover:bg-gray-50 text-left"
      >
        {open ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
        {typeIcon}
        <span className="flex-1 font-medium text-gray-700">{lesson.title}</span>
        {lesson.moderationStatus && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            {MOD_ICON[lesson.moderationStatus]}
            {MOD_LABEL[lesson.moderationStatus]}
          </span>
        )}
        {(lesson.durationSec ?? 0) > 0 && (
          <span className="text-xs text-gray-400 ml-2">{Math.floor((lesson.durationSec ?? 0) / 60)}:{String((lesson.durationSec ?? 0) % 60).padStart(2, '0')}</span>
        )}
      </button>
      {open && (
        <div className="px-4 py-3 border-t bg-gray-50 space-y-3">
          {lesson.description && <p className="text-sm text-gray-600">{lesson.description}</p>}
          {lesson.moderationReason && (
            <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded p-2">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{lesson.moderationReason}</span>
            </div>
          )}
          {lesson.appealReason && (
            <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded p-2">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              <span>Kiến nghị: {lesson.appealReason}</span>
            </div>
          )}
          {lesson.type === 'video' && <AdminVideoPlayer lessonId={lesson.id} />}
          {lesson.type === 'document' && <AdminDocViewer lesson={lesson} />}
          {needsAction && onApprove && (
            <div className="flex gap-2 pt-1 border-t border-gray-200">
              <button
                onClick={onApprove}
                disabled={isMutating}
                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Duyệt nội dung
              </button>
              <button
                onClick={async () => {
                  const r = (await showPrompt({ title: 'Lý do từ chối (để trống = mặc định):' })) ?? undefined;
                  onReject?.(r || undefined);
                }}
                disabled={isMutating}
                className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200 disabled:opacity-50"
              >
                Từ chối (khóa)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Course detail modal ──────────────────────────────────────────────────────

function CourseDetailModal({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<AdminCourseDetail>({
    queryKey: ['admin-course-detail', courseId],
    queryFn: () => adminApi.getCourseDetail(courseId).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-course-detail', courseId] });
    qc.invalidateQueries({ queryKey: ['admin-moderation'] });
    qc.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  const approveMod = useMutation({
    mutationFn: ({ type, id }: { type: 'course' | 'lesson'; id: string }) =>
      adminApi.approveModeration(type, id),
    onSuccess: invalidate,
    onError: (err) => notify.error(getApiErrorMessage(err, 'Duyệt thất bại')),
  });

  const rejectMod = useMutation({
    mutationFn: ({ type, id, reason }: { type: 'course' | 'lesson'; id: string; reason?: string }) =>
      adminApi.rejectModeration(type, id, reason),
    onSuccess: invalidate,
    onError: (err) => notify.error(getApiErrorMessage(err, 'Từ chối thất bại')),
  });

  const isMutating = approveMod.isPending || rejectMod.isPending;
  const course = data;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="font-semibold text-gray-900 truncate pr-4">{course?.title ?? 'Chi tiết khóa học'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {isLoading && <LoadingSpinner />}
          {course && (
            <>
              {/* Thumbnail + meta */}
              <div className="flex gap-4">
                {course.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={course.thumbnailUrl} alt="" className="w-40 h-28 object-cover rounded-lg flex-shrink-0" />
                )}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm flex-1">
                  <div><span className="text-gray-500">Giảng viên:</span> <span className="font-medium">{course.instructor?.fullName}</span></div>
                  <div><span className="text-gray-500">Trình độ:</span> <span className="font-medium">{course.level}</span></div>
                  <div><span className="text-gray-500">Giá:</span> <span className="font-medium">{Number(course.price).toLocaleString('vi-VN')}₫</span></div>
                  <div><span className="text-gray-500">Ngôn ngữ:</span> <span className="font-medium">{course.language}</span></div>
                  <div><span className="text-gray-500">Trạng thái:</span> <span className="font-medium">{STATUS_LABEL[course.status ?? ''] ?? course.status}</span></div>
                  <div><span className="text-gray-500">Kiểm duyệt:</span> <span className="flex items-center gap-1 font-medium">{MOD_ICON[course.moderationStatus ?? ''] ?? null}{MOD_LABEL[course.moderationStatus ?? ''] ?? course.moderationStatus}</span></div>
                </div>
              </div>

              {/* Description */}
              {course.description && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Mô tả</p>
                  <SafeHtml html={course.description} className="prose prose-sm max-w-none text-sm text-gray-600" />
                </div>
              )}

              {/* Course moderation status + manual review actions */}
              {course.moderationStatus && course.moderationStatus !== 'approved' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                    {MOD_ICON[course.moderationStatus]}
                    <span>Kiểm duyệt khóa học: {MOD_LABEL[course.moderationStatus] ?? course.moderationStatus}</span>
                  </div>
                  {course.moderationReason && (
                    <p className="text-xs text-red-600">{course.moderationReason}</p>
                  )}
                  {course.appealReason && (
                    <p className="text-xs text-amber-700">Kiến nghị: {course.appealReason}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => approveMod.mutate({ type: 'course', id: courseId })}
                      disabled={isMutating}
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Duyệt nội dung
                    </button>
                    <button
                      onClick={async () => {
                        const r = (await showPrompt({ title: 'Lý do từ chối (để trống = mặc định):' })) ?? undefined;
                        rejectMod.mutate({ type: 'course', id: courseId, reason: r || undefined });
                      }}
                      disabled={isMutating}
                      className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200 disabled:opacity-50"
                    >
                      Từ chối (khóa)
                    </button>
                  </div>
                </div>
              )}

              {/* Rejection reason */}
              {course.rejectionReason && (
                <div className="flex items-start gap-1.5 text-sm text-orange-700 bg-orange-50 rounded-lg p-3">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span><strong>Lý do từ chối:</strong> {course.rejectionReason}</span>
                </div>
              )}

              {/* Curriculum with full lesson content */}
              {(course.sections?.length ?? 0) > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Giáo trình ({course.sections?.length ?? 0} chương)</p>
                  <div className="space-y-3">
                    {course.sections?.map((s: SectionSummary, i: number) => (
                      <div key={s.id} className="border rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2.5 text-sm font-medium flex items-center justify-between">
                          <span>{i + 1}. {s.title}</span>
                          <span className="text-gray-400 text-xs">{s.lessons?.length ?? 0} bài</span>
                        </div>
                        <div className="divide-y px-2 py-1.5 space-y-1">
                          {s.lessons?.map((l: LessonSummary) => (
                            <LessonRow
                              key={l.id}
                              lesson={l}
                              isMutating={isMutating}
                              onApprove={() => approveMod.mutate({ type: 'lesson', id: l.id })}
                              onReject={(reason) => rejectMod.mutate({ type: 'lesson', id: l.id, reason })}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Status labels ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  published: 'Đã xuất bản',
  pending: 'Chờ duyệt',
  rejected: 'Từ chối',
  draft: 'Nháp',
  archived: 'Lưu trữ',
};

const STATUS_CLASS: Record<string, string> = {
  published: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-600',
  archived: 'bg-purple-100 text-purple-700',
};

// ─── Main content ─────────────────────────────────────────────────────────────

function AdminCoursesContent() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) ?? 'pending');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<CourseSummary | null>(null);
  const [approveConfirm, setApproveConfirm] = useState<CourseSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const statusMap: Record<Tab, string | undefined> = { pending: 'pending', all: undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['admin-courses', tab, page],
    queryFn: () => adminApi.getCourses({ status: statusMap[tab], page, limit: 20 }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApi.approveCourse(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-courses'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] }); setApproveConfirm(null); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi.rejectCourse(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-courses'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] }); setRejectTarget(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCourse(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-courses'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      setDeleteTarget(null);
    },
    onError: (err) =>
      notify.error(getApiErrorMessage(err, 'Xóa khóa học thất bại')),
  });

  const courses: CourseSummary[] = data?.data?.courses ?? [];
  const total: number = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pending', label: 'Chờ cấp phép' },
    { key: 'all', label: 'Toàn bộ khóa học' },
  ];

  return (
    <div className="space-y-5">
      {detailId && <CourseDetailModal courseId={detailId} onClose={() => setDetailId(null)} />}
      {deleteTarget && (
        <ConfirmDialog
          title={`Xóa khóa học "${deleteTarget.title}"?`}
          message="Toàn bộ bài học, tài liệu, video, lịch sử học viên và đơn hàng liên quan sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác."
          confirmLabel="Xóa vĩnh viễn"
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {rejectTarget && (
        <RejectDialog
          courseName={rejectTarget.title}
          onConfirm={(reason) => rejectMutation.mutate({ id: rejectTarget.id, reason })}
          onCancel={() => setRejectTarget(null)}
        />
      )}
      {approveConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <p className="text-gray-800">Duyệt khóa học <strong>&quot;{approveConfirm.title}&quot;</strong>?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setApproveConfirm(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Hủy</button>
              <button onClick={() => approveMutation.mutate(approveConfirm.id)} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Duyệt</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Khóa học</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} kết quả</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setPage(1); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Khóa học</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Giảng viên</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Trạng thái</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Ngày submit</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {courses.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">Không có dữ liệu</td></tr>
              ) : courses.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{c.title}</td>
                  <td className="px-4 py-3 text-gray-500">{c.instructor?.fullName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[c.status ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[c.status ?? ''] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('vi-VN') : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setDetailId(c.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Xem</button>
                      {c.status === 'pending' && (
                        <>
                          <button onClick={() => setApproveConfirm(c)} className="text-xs text-green-600 hover:text-green-800 font-medium">Duyệt</button>
                          <button onClick={() => setRejectTarget(c)} className="text-xs text-red-500 hover:text-red-700 font-medium">Từ chối</button>
                        </>
                      )}
                      <button
                        onClick={() => setDeleteTarget({ id: c.id, title: c.title })}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={14} /> Trước</button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Sau <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

export default function AdminCoursesPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AdminCoursesContent />
    </Suspense>
  );
}
