'use client';

import { useEffect, useState } from 'react';
import { PDFViewer, PDFDownloadLink } from '@react-pdf/renderer';
import { X, Download } from 'lucide-react';
import type { CertificateView } from '@/lib/api/certificate.api';
import { CertificateDocument } from './CertificateDocument';

/** Bỏ dấu + ký tự lạ để đặt tên file tải xuống. */
function safeFileName(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'chung-chi'
  );
}

export interface CertificatePreviewProps {
  data: CertificateView;
  onClose: () => void;
}

/**
 * Modal xem trước + tải chứng chỉ PDF. Render hoàn toàn phía client
 * (nên được nạp qua next/dynamic với ssr:false).
 */
export default function CertificatePreview({
  data,
  onClose,
}: CertificatePreviewProps) {
  // Component này chỉ render phía client (next/dynamic ssr:false) nên window luôn có sẵn.
  const [origin] = useState(() => (typeof window !== 'undefined' ? window.location.origin : ''));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fileName = `Chung-chi-${safeFileName(data.courseSlug || data.courseTitle)}.pdf`;
  const doc = <CertificateDocument data={data} origin={origin} />;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-3 px-5 py-3 bg-white/95 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-ink truncate">
          Chứng chỉ — {data.courseTitle}
        </h2>
        <div className="flex items-center gap-2">
          <PDFDownloadLink
            document={doc}
            fileName={fileName}
            className="inline-flex h-9 items-center gap-1.5 px-4 rounded-pill bg-emphasis text-white text-sm font-medium hover:bg-ink transition-colors"
          >
            {({ loading }) => (
              <>
                <Download size={14} />
                {loading ? 'Đang tạo…' : 'Tải PDF'}
              </>
            )}
          </PDFDownloadLink>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0" onClick={(e) => e.stopPropagation()}>
        <PDFViewer
          width="100%"
          height="100%"
          showToolbar={false}
          style={{ border: 'none' }}
        >
          {doc}
        </PDFViewer>
      </div>
    </div>
  );
}
