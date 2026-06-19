'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFReaderProps {
  url: string;
  onPageChange?: (page: number) => void;
}

export function PDFReader({ url, onPageChange }: PDFReaderProps) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.0);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    onPageChange?.(newPage);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3 text-sm">
        <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)} className="inline-flex items-center gap-1 px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={14} /> Trước</button>
        <span>Trang {page} / {numPages}</span>
        <button disabled={page >= numPages} onClick={() => handlePageChange(page + 1)} className="inline-flex items-center gap-1 px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Sau <ChevronRight size={14} /></button>
        <button onClick={() => setScale((s) => Math.max(0.5, s - 0.25))} className="inline-flex items-center px-2 py-1 border rounded" aria-label="Thu nhỏ"><Minus size={14} /></button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(2, s + 0.25))} className="inline-flex items-center px-2 py-1 border rounded" aria-label="Phóng to"><Plus size={14} /></button>
      </div>

      <div className="border rounded overflow-auto max-h-[600px] bg-gray-100">
        <Document
          file={url}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          loading={<div className="p-8 text-gray-400">Đang tải PDF...</div>}
        >
          <Page pageNumber={page} scale={scale} />
        </Document>
      </div>
    </div>
  );
}
