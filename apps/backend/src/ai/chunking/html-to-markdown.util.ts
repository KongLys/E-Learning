import TurndownService from 'turndown';

/**
 * Chuyển rich text HTML (đã qua sanitizeRichText — tập thẻ giới hạn) sang markdown
 * GIỮ NGUYÊN heading h1–h4 dạng `#`/`##`… để bước chunk/TOC phân vùng được nội dung
 * theo đề mục thay vì mất cấu trúc như stripHtml.
 */
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return '';
  return turndown.turndown(html).trim();
}
