'use client';

import { useState, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Play, FileText, PenLine, X } from 'lucide-react';

type Tab = 'pending' | 'published' | 'all';

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

function CoursePreviewModal({ course, onClose }: { course: any; onClose: () => void }) {
  const lessonIcon = (type: string) => {
    if (type === 'video') return <Play size={12} strokeWidth={1.75} />;
    if (type === 'document') return <FileText size={12} strokeWidth={1.75} />;
    return <PenLine size={12} strokeWidth={1.75} />;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{course.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {course.thumbnailUrl && <img src={course.thumbnailUrl} alt="" className="w-full h-48 object-cover rounded-lg" />}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Giảng viên:</span> <span className="font-medium">{course.instructor?.fullName}</span></div>
            <div><span className="text-gray-500">Trình độ:</span> <span className="font-medium">{course.level}</span></div>
            <div><span className="text-gray-500">Giá:</span> <span className="font-medium">{Number(course.price).toLocaleString('vi-VN')}₫</span></div>
            <div><span className="text-gray-500">Ngôn ngữ:</span> <span className="font-medium">{course.language}</span></div>
          </div>
          {course.description && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Mô tả</p>
              <p className="text-sm text-gray-600">{course.description}</p>
            </div>
          )}
          {course.sections?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Giáo trình</p>
              <div className="space-y-2">
                {course.sections.map((s: any, i: number) => (
                  <div key={s.id} className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 text-sm font-medium">{i + 1}. {s.title}</div>
                    <ul className="divide-y text-sm">
                      {s.lessons?.map((l: any) => (
                        <li key={l.id} className="px-3 py-1.5 flex items-center gap-2 text-gray-600">
                          <span className="text-gray-400">{lessonIcon(l.type)}</span>
                          {l.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  published: 'Đã xuất bản',
  pending: 'Chờ duyệt',
  rejected: 'Từ chối',
};

const STATUS_CLASS: Record<string, string> = {
  published: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
};

function AdminCoursesContent() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) ?? 'pending');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<any | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [approveConfirm, setApproveConfirm] = useState<any | null>(null);

  const statusMap: Record<Tab, string | undefined> = { pending: 'pending', published: 'published', all: undefined };

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

  const courses: any[] = data?.data?.courses ?? [];
  const total: number = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pending', label: 'Chờ duyệt' },
    { key: 'published', label: 'Đã xuất bản' },
    { key: 'all', label: 'Tất cả' },
  ];

  return (
    <div className="space-y-5">
      {preview && <CoursePreviewModal course={preview} onClose={() => setPreview(null)} />}
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
            <p className="text-gray-800">Duyệt khóa học <strong>"{approveConfirm.title}"</strong>?</p>
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
              ) : courses.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{c.title}</td>
                  <td className="px-4 py-3 text-gray-500">{c.instructor?.fullName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('vi-VN') : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setPreview(c)} className="text-xs text-gray-500 hover:text-gray-900 font-medium">Xem</button>
                      {c.status === 'pending' && (
                        <>
                          <button onClick={() => setApproveConfirm(c)} className="text-xs text-green-600 hover:text-green-800 font-medium">Duyệt</button>
                          <button onClick={() => setRejectTarget(c)} className="text-xs text-red-500 hover:text-red-700 font-medium">Từ chối</button>
                        </>
                      )}
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
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Trước</button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Sau →</button>
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
