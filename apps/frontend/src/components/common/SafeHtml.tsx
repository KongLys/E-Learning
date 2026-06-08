'use client';

import { useMemo } from 'react';
import DOMPurify from 'dompurify';

/** Render HTML rich text đã được làm sạch (chống XSS) ở phía client. */
export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html ?? ''), [html]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
