import sanitizeHtml from 'sanitize-html';

/**
 * Làm sạch HTML rich text do giảng viên nhập trước khi lưu/render cho người học.
 * Chỉ giữ các thẻ định dạng an toàn, loại bỏ script/style/sự kiện inline → chống XSS.
 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'blockquote',
      'code',
      'pre',
      'h1',
      'h2',
      'h3',
      'h4',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'hr',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  });
}

/**
 * Bóc toàn bộ thẻ HTML, trả về text thuần — dùng khi cần lấy nội dung text từ
 * rich text để chunk/embed (vd: vector hóa nội dung chương).
 */
export function stripHtml(html: string): string {
  return sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Bóc HTML thành text dùng cho ĐỌC (TTS): chèn xuống dòng ở ranh giới khối
 * (p, li, h1-6, br, blockquote, pre, tr) để mỗi đề mục/đoạn/gạch đầu dòng là một
 * dòng riêng. Tránh các khối dính liền thành một câu dài (Google TTS từ chối câu
 * quá dài) và tránh chữ cuối khối dính vào chữ đầu khối kế tiếp.
 */
export function htmlToReadableText(html: string): string {
  const withBreaks = (html ?? '')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, '$&\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
