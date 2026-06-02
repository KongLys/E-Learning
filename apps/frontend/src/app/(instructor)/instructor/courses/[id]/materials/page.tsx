'use client';

import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  materialsApi,
  type CourseMaterial,
} from '@/lib/api/ai.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';

const STATUS_LABEL: Record<CourseMaterial['status'], string> = {
  uploaded: 'Đã upload — chờ xử lý',
  parsing: 'Đang parse (LlamaParse)…',
  parsed: 'Đã có markdown — đang chunk & embed…',
  ready: 'Sẵn sàng',
  failed: 'Lỗi',
};

const STATUS_COLOR: Record<CourseMaterial['status'], string> = {
  uploaded: 'bg-gray-100 text-gray-700',
  parsing: 'bg-blue-100 text-blue-700 animate-pulse',
  parsed: 'bg-yellow-100 text-yellow-800 animate-pulse',
  ready: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function CourseMaterialsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['course-materials', id],
    queryFn: async () => (await materialsApi.list(id)).data,
    refetchInterval: (q) => {
      const items = q.state.data as CourseMaterial[] | undefined;
      const hasProcessing = items?.some(
        (m) => m.status === 'uploaded' || m.status === 'parsing' || m.status === 'parsed',
      );
      return hasProcessing ? 4000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => materialsApi.upload(id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-materials', id] });
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      setError(err?.response?.data?.message ?? 'Upload thất bại'),
  });

  const deleteMutation = useMutation({
    mutationFn: (materialId: string) => materialsApi.remove(id, materialId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-materials', id] }),
  });

  const retryMutation = useMutation({
    mutationFn: (materialId: string) => materialsApi.retry(id, materialId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-materials', id] }),
  });

  if (isLoading) return <LoadingSpinner />;

  const items = data ?? [];

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tài liệu AI của khóa học</h1>
        <p className="text-sm text-gray-600 mt-1">
          Upload các file PDF / DOCX. Hệ thống sẽ tự convert sang markdown,
          chunking và embed để học viên có thể hỏi AI dựa trên nội dung khóa học.
        </p>
      </div>

      {error && <ErrorMessage message={error} />}

      <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadMutation.mutate(f);
          }}
          className="block mx-auto text-sm"
          disabled={uploadMutation.isPending}
        />
        <p className="text-xs text-gray-500 mt-2">PDF hoặc DOCX, tối đa 100MB</p>
        {uploadMutation.isPending && (
          <p className="text-sm text-blue-600 mt-2">Đang upload…</p>
        )}
      </div>

      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-gray-500 italic text-center py-8">
            Chưa có tài liệu nào. Khóa học phải có ít nhất 1 tài liệu trước khi gửi duyệt.
          </p>
        )}
        {items.map((m) => (
          <div key={m.id} className="border rounded-xl p-4 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium truncate">{m.fileName}</span>
                <span className="text-xs uppercase bg-gray-100 px-2 py-0.5 rounded">
                  {m.fileType}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
                <span>{(Number(m.fileSize) / 1024 / 1024).toFixed(2)} MB</span>
                {m.chunkCount > 0 && <span>{m.chunkCount} chunks</span>}
                <span className={`px-2 py-0.5 rounded ${STATUS_COLOR[m.status]}`}>
                  {STATUS_LABEL[m.status]}
                </span>
              </div>
              {m.errorMsg && (
                <p className="text-xs text-red-600 mt-1">Lỗi: {m.errorMsg}</p>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {m.status === 'failed' && (
                <button
                  onClick={() => retryMutation.mutate(m.id)}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
                >
                  Thử lại
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm(`Xóa tài liệu "${m.fileName}"?`)) deleteMutation.mutate(m.id);
                }}
                className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded hover:bg-red-200"
              >
                Xóa
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
