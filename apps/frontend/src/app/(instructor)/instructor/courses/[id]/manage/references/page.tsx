'use client';

import { useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Film, FileText, Paperclip, Play } from 'lucide-react';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

type RefType = 'file' | 'youtube' | 'video';

const TYPE_META: Record<RefType, { label: string; icon: ReactNode }> = {
  file: { label: 'Tệp PDF/DOCX', icon: <FileText size={16} /> },
  youtube: { label: 'Link YouTube', icon: <Play size={16} /> },
  video: { label: 'Video tải lên', icon: <Film size={16} /> },
};

export default function ReferencesPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [type, setType] = useState<RefType>('file');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['ref-materials', id],
    queryFn: async () =>
      (await instructorApi.listReferenceMaterials(id)).data as any[],
  });
  const materials = listQuery.data ?? [];

  const reset = () => {
    setTitle('');
    setDescription('');
    setExternalUrl('');
    setFile(null);
    setPct(null);
  };

  const createMut = useMutation({
    mutationFn: () =>
      instructorApi.createReferenceMaterial(
        id,
        {
          type,
          title: title.trim(),
          description: description.trim() || undefined,
          externalUrl: externalUrl.trim() || undefined,
        },
        type === 'youtube' ? undefined : (file ?? undefined),
        setPct,
      ),
    onSuccess: () => {
      setError('');
      reset();
      qc.invalidateQueries({ queryKey: ['ref-materials', id] });
    },
    onError: (e: any) => {
      setPct(null);
      setError(e?.response?.data?.message ?? 'Thêm tài liệu thất bại');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (rid: string) => instructorApi.deleteReferenceMaterial(rid),
    onSuccess: () => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ['ref-materials', id] });
    },
    onError: (e: any) => {
      setDeleteId(null);
      setError(e?.response?.data?.message ?? 'Xóa thất bại');
    },
  });

  const canSubmit =
    !!title.trim() &&
    (type === 'youtube' ? !!externalUrl.trim() : !!file) &&
    !createMut.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Tài liệu tham khảo</h2>
        <p className="text-sm text-gray-500">
          Thêm video, link YouTube hoặc tệp PDF/DOCX cho học viên đọc/xem thêm.
          Hiển thị ở mục &quot;Tài liệu tham khảo&quot; trong khung chương trình.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Form thêm */}
      <div className="space-y-3 rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-2">
          {(['file', 'youtube', 'video'] as RefType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                type === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {TYPE_META[t].icon} {TYPE_META[t].label}
            </button>
          ))}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tiêu đề"
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mô tả (tuỳ chọn)"
          rows={2}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
        />

        {type === 'youtube' ? (
          <input
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
          />
        ) : (
          <input
            type="file"
            accept={
              type === 'video'
                ? 'video/mp4,video/webm'
                : '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
        )}

        {pct !== null && (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-blue-600">Đang tải lên {pct}%</p>
          </div>
        )}

        <button
          onClick={() => createMut.mutate()}
          disabled={!canSubmit}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {createMut.isPending ? 'Đang thêm...' : 'Thêm tài liệu'}
        </button>
      </div>

      {/* Danh sách */}
      {listQuery.isLoading ? (
        <LoadingSpinner />
      ) : materials.length === 0 ? (
        <p className="text-sm text-gray-400">Chưa có tài liệu tham khảo nào.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {materials.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="shrink-0">
                {TYPE_META[m.type as RefType]?.icon ?? <Paperclip size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{m.title}</p>
                <p className="truncate text-xs text-gray-400">
                  {m.type === 'youtube' ? m.externalUrl : m.fileName}
                </p>
              </div>
              <button
                onClick={() => setDeleteId(m.id)}
                className="shrink-0 text-xs text-red-500 hover:text-red-700"
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleteId && (
        <ConfirmDialog
          title="Xóa tài liệu tham khảo?"
          message="Tài liệu này sẽ bị xóa khỏi khóa học."
          confirmLabel="Xóa"
          isPending={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
