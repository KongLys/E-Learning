'use client';

import { Award, Eye } from 'lucide-react';
import type { CertificateView } from '@/lib/api/certificate.api';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function CertificateCard({
  cert,
  onView,
}: {
  cert: CertificateView;
  onView: () => void;
}) {
  return (
    <div className="bg-surface-card rounded-2xl border border-hairline overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-shadow">
      <div className="flex items-center justify-center h-28 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600">
        <Award size={40} strokeWidth={1.5} />
      </div>
      <div className="p-4">
        <h3 className="text-[15px] font-semibold text-ink line-clamp-2 mb-1">
          {cert.courseTitle}
        </h3>
        <p className="text-xs text-muted mb-1">
          Cấp ngày {formatDate(cert.issuedAt)}
        </p>
        <p className="text-xs text-muted-soft mb-4">Mã: {cert.code}</p>
        <button
          onClick={onView}
          className="w-full inline-flex h-9 items-center justify-center gap-1.5 rounded-pill bg-emphasis text-white text-sm font-medium hover:bg-ink transition-colors"
        >
          <Eye size={14} />
          Xem chứng chỉ
        </button>
      </div>
    </div>
  );
}
