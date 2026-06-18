/**
 * Trích mục lục (table of contents) từ markdown TRƯỚC khi chunk — dùng để
 * phân vùng nội dung bài học theo đề mục, lưu vào DocumentAsset.tocJson và
 * làm cơ sở dựng mind map. Cùng quy ước heading H1–H3 với MarkdownChunkerService.
 */
export interface TocNode {
  title: string;
  level: number; // 1..3
  children: TocNode[];
}

/** Tiêu đề dài hơn ngưỡng này gần như chắc chắn là đoạn văn bị gắn nhầm thẻ heading. */
const MAX_HEADING_LEN = 120;

export function buildToc(markdown: string): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (!m || m[2].length > MAX_HEADING_LEN) continue;
    const node: TocNode = { title: m[2], level: m[1].length, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level)
      stack.pop();
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return roots;
}
