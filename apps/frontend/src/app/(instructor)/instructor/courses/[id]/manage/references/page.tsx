'use client';

import { useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Film, FileText, Paperclip, Play } from 'lucide-react';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { getApiErrorMessage } from '@/lib/api/error';

type RefType = 'file' | 'youtube' | 'video';

interface ReferenceMaterial {
  id: string;
  title: string;
  type: RefType | string;
  externalUrl?: string | null;
  fileName?: string | null;
  description?: string;
}

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
      (await instructorApi.listReferenceMaterials(id)).data as ReferenceMaterial[],
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
    onError: (e) => {
      setPct(null);
      setError(getApiErrorMessage(e, 'Thêm tài liệu thất bại'));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (rid: string) => instructorApi.deleteReferenceMaterial(rid),
    onSuccess: () => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ['ref-materials', id] });
    },
    onError: (e) => {
      setDeleteId(null);
      setError(getApiErrorMessage(e, 'Xóa thất bại'));
    },
  });

  const canSubmit =
    !!title.trim() &&
    (type === 'youtube' ? !!externalUrl.trim() : !!file) &&
    !createMut.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Tài liệu tham khảo</h2>
        <p className="text-sm text-muted">
          Thêm video, link YouTube hoặc tệp PDF/DOCX cho học viên đọc/xem thêm.
          Hiển thị ở mục &quot;Tài liệu tham khảo&quot; trong khung chương trình.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-coral bg-coral-soft px-3 py-2 text-sm text-semantic-error">
          {error}
        </div>
      )}

      {/* Form thêm */}
      <div className="space-y-3 rounded-card border border-hairline p-4">
        <div className="flex flex-wrap gap-2">
          {(['file', 'youtube', 'video'] as RefType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                type === t
                  ? 'bg-sky text-white'
                  : 'bg-surface-strong text-ink-mute hover:bg-hairline'
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
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-hairline-strong focus:ring-2 focus:ring-sky"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mô tả (tuỳ chọn)"
          rows={2}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-hairline-strong focus:ring-2 focus:ring-sky"
        />

        {type === 'youtube' ? (
          <input
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-hairline-strong focus:ring-2 focus:ring-sky"
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
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-strong">
              <div
                className="h-full rounded-full bg-sky transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-sky">Đang tải lên {pct}%</p>
          </div>
        )}

        <button
          onClick={() => createMut.mutate()}
          disabled={!canSubmit}
          className="rounded-full bg-sky px-4 py-2 text-sm font-medium text-white hover:bg-sky-deep disabled:opacity-50"
        >
          {createMut.isPending ? 'Đang thêm...' : 'Thêm tài liệu'}
        </button>
      </div>

      {/* Danh sách */}
      {listQuery.isLoading ? (
        <LoadingSpinner />
      ) : materials.length === 0 ? (
        <p className="text-sm text-muted">Chưa có tài liệu tham khảo nào.</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-card border border-hairline">
          {materials.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="shrink-0">
                {TYPE_META[m.type as RefType]?.icon ?? <Paperclip size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{m.title}</p>
                <p className="truncate text-xs text-ink-subtle">
                  {m.type === 'youtube' ? m.externalUrl : m.fileName}
                </p>
              </div>
              <button
                onClick={() => setDeleteId(m.id)}
                className="shrink-0 text-xs text-coral hover:opacity-80"
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
