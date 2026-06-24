'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Award, BadgeCheck, XCircle } from 'lucide-react';
import { certificateApi } from '@/lib/api/certificate.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['verify-certificate', code],
    queryFn: () => certificateApi.verify(code),
    retry: false,
  });

  const result = data?.data;
  const valid = result?.valid === true;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-lg bg-surface-card border border-hairline rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-col items-center gap-2 px-8 py-8 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-700">
          <Award size={40} strokeWidth={1.5} />
          <h1 className="text-lg font-semibold">Xác minh chứng chỉ</h1>
        </div>

        <div className="p-8">
          {isLoading ? (
            <LoadingSpinner />
          ) : isError || !valid || !result ? (
            <div className="flex flex-col items-center text-center gap-3">
              <XCircle size={36} className="text-semantic-danger" />
              <p className="text-ink font-medium">Chứng chỉ không hợp lệ</p>
              <p className="text-sm text-muted">
                Không tìm thấy chứng chỉ với mã{' '}
                <span className="font-mono">{code}</span>.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-semantic-success">
                <BadgeCheck size={20} />
                <span className="font-medium">Chứng chỉ hợp lệ</span>
              </div>

              <dl className="divide-y divide-hairline text-sm">
                <Row label="Học viên" value={result.studentName} />
                <Row label="Khóa học" value={result.courseTitle} />
                {result.instructorName && (
                  <Row label="Giảng viên" value={result.instructorName} />
                )}
                <Row label="Ngày cấp" value={formatDate(result.issuedAt)} />
                <Row label="Mã chứng chỉ" value={result.code} mono />
              </dl>

              <p className="text-xs italic text-muted mt-2 leading-relaxed">
                Chứng chỉ này chỉ mang tính minh chứng kỹ năng, không có giá trị
                học thuật.
              </p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/"
              className="text-sm text-emphasis hover:underline font-medium"
            >
              Về trang chủ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className={`text-ink text-right ${mono ? 'font-mono' : 'font-medium'}`}>
        {value}
      </dd>
    </div>
  );
}
