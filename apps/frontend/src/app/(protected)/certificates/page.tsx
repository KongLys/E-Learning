'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Award, ArrowRight } from 'lucide-react';
import { certificateApi, type CertificateView } from '@/lib/api/certificate.api';
import { CertificateCard } from '@/components/certificates/CertificateCard';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

// Trình tạo PDF chỉ chạy phía client.
const CertificatePreview = dynamic(
  () => import('@/components/certificates/CertificatePreview'),
  { ssr: false },
);

export default function CertificatesPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CertificatesContent />
    </Suspense>
  );
}

function CertificatesContent() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const [selected, setSelected] = useState<CertificateView | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['my-certificates'],
    queryFn: () => certificateApi.listMine(),
  });
  const certificates: CertificateView[] = data?.data ?? [];

  // Mở sẵn chứng chỉ của khóa được trỏ tới (?courseId=) — lazy-create nếu cần.
  const { data: byCourse } = useQuery({
    queryKey: ['certificate-by-course', courseId],
    queryFn: () => certificateApi.getByCourse(courseId as string),
    enabled: !!courseId,
  });
  useEffect(() => {
    if (byCourse?.data) setSelected(byCourse.data);
  }, [byCourse]);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-300 mx-auto px-6 py-10">
        <h1 className="font-display text-4xl text-ink mb-2">Chứng chỉ của tôi</h1>
        <p className="text-sm text-muted mb-8">
          Chứng chỉ được cấp khi bạn hoàn thành 100% một khóa học. Đây là chứng
          chỉ mang tính minh chứng kỹ năng, không có giá trị học thuật.
        </p>

        {certificates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-strong flex items-center justify-center mb-5 text-muted">
              <Award size={24} strokeWidth={1.5} />
            </div>
            <p className="text-muted mb-5 text-base">
              Bạn chưa có chứng chỉ nào. Hãy hoàn thành một khóa học để nhận
              chứng chỉ.
            </p>
            <Link
              href="/my-courses"
              className="inline-flex h-10 items-center gap-2 px-5 rounded-pill bg-emphasis text-white text-sm font-medium hover:bg-ink transition-colors"
            >
              Khóa học của tôi
              <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {certificates.map((cert) => (
              <CertificateCard
                key={cert.code}
                cert={cert}
                onView={() => setSelected(cert)}
              />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <CertificatePreview data={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
