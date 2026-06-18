import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MarkdownChunk {
  content: string;
  sectionTitle: string | null;
  chunkIndex: number;
  tokenCount: number;
}

interface Section {
  title: string | null;
  level: number;
  text: string;
}

@Injectable()
export class MarkdownChunkerService {
  private readonly maxChars: number;
  private readonly overlap: number;

  constructor(config: ConfigService) {
    this.maxChars = config.get<number>('RAG_CHUNK_SIZE', 1000);
    this.overlap = config.get<number>('RAG_CHUNK_OVERLAP', 200);
  }

  chunk(markdown: string): MarkdownChunk[] {
    const sections = this.splitByHeadings(normalizeMarkdown(markdown));
    const chunks: MarkdownChunk[] = [];
    let index = 0;
    // Chỉ nhận chunk có nội dung thực, trim sạch trước khi lưu.
    const push = (raw: string, title: string | null) => {
      const content = raw.trim();
      if (!hasMeaningfulContent(content)) return;
      chunks.push({
        content,
        sectionTitle: title,
        chunkIndex: index++,
        tokenCount: estimateTokens(content),
      });
    };
    for (const section of sections) {
      const body = normalizeMarkdown(section.text);
      if (!body) continue;
      if (body.length <= this.maxChars) {
        push(body, section.title);
      } else {
        for (const part of recursiveSplit(body, this.maxChars, this.overlap)) {
          push(part, section.title);
        }
      }
    }
    return chunks;
  }

  private splitByHeadings(markdown: string): Section[] {
    const lines = markdown.split(/\r?\n/);
    const sections: Section[] = [];
    const stack: { title: string; level: number }[] = [];
    let buffer: string[] = [];

    const flush = () => {
      if (buffer.length === 0) return;
      const path = stack.map((s) => s.title).join(' > ');
      sections.push({
        title: path || null,
        level: stack.length,
        text: buffer.join('\n'),
      });
      buffer = [];
    };

    for (const line of lines) {
      const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
      if (m && m[2].length <= MAX_HEADING_LEN) {
        flush();
        const level = m[1].length;
        while (stack.length > 0 && stack[stack.length - 1].level >= level)
          stack.pop();
        stack.push({ title: m[2], level });
      } else if (m) {
        // "Heading" quá dài → thực chất là đoạn văn bị gắn nhầm thẻ heading:
        // giữ lại làm nội dung (bỏ dấu #) thay vì biến thành tiêu đề phần.
        buffer.push(m[2]);
      } else {
        buffer.push(line);
      }
    }
    flush();
    if (sections.length === 0) {
      sections.push({ title: null, level: 0, text: markdown });
    }
    return sections;
  }
}

function recursiveSplit(
  text: string,
  maxChars: number,
  overlap: number,
): string[] {
  if (text.length <= maxChars) return [text];
  const separators = ['\n\n', '\n', '. ', ' '];
  for (const sep of separators) {
    if (text.includes(sep)) {
      return splitBySeparator(text, sep, maxChars, overlap);
    }
  }
  // Hard split (text gần như không có dấu tách) — vẫn cố snap điểm cắt/bắt đầu
  // tới khoảng trắng gần nhất để tránh cắt giữa từ; giữ overlap như cũ.
  const out: string[] = [];
  const step = Math.max(1, maxChars - overlap);
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const sp = text.lastIndexOf(' ', end);
      if (sp > start) end = sp;
    }
    out.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    let next = Math.max(start + step, end - overlap);
    const sp = text.indexOf(' ', next);
    if (sp >= 0 && sp < end) next = sp + 1;
    start = next <= start ? end : next;
  }
  return out;
}

function splitBySeparator(
  text: string,
  sep: string,
  maxChars: number,
  overlap: number,
): string[] {
  const parts = text.split(sep);
  const out: string[] = [];
  let current = '';
  for (const part of parts) {
    const piece = current ? current + sep + part : part;
    if (piece.length > maxChars) {
      if (current) out.push(current);
      if (part.length > maxChars) {
        out.push(...recursiveSplit(part, maxChars, overlap));
        current = '';
      } else {
        current = part;
      }
    } else {
      current = piece;
    }
  }
  if (current) out.push(current);
  // Thêm overlap bằng cách prefix phần đuôi của chunk trước — nhưng cắt theo
  // ranh giới câu/từ để chunk không mở đầu bằng một từ bị đứt.
  return out.map((chunk, i) => {
    if (i === 0 || overlap <= 0) return chunk;
    const tail = cleanOverlapTail(out[i - 1], overlap);
    return tail ? `${tail}\n${chunk}` : chunk;
  });
}

/**
 * Lấy phần đuôi (~overlap ký tự) của chunk trước làm ngữ cảnh chồng lấn, nhưng
 * snap điểm bắt đầu tới ranh giới sạch: ưu tiên ngay sau dấu kết câu (". "),
 * không có thì sau khoảng trắng đầu tiên — tránh mở đầu bằng từ đứt.
 */
function cleanOverlapTail(prev: string, overlap: number): string {
  let tail = prev.slice(Math.max(0, prev.length - overlap));
  if (tail.length === prev.length) return tail.trimStart();
  const sentence = tail.search(/[.!?]\s/);
  if (sentence >= 0) {
    tail = tail.slice(sentence + 1);
  } else {
    const sp = tail.indexOf(' ');
    if (sp >= 0) tail = tail.slice(sp + 1);
  }
  return tail.trimStart();
}

function estimateTokens(text: string): number {
  // Rough heuristic: 1 token ≈ 4 chars for English / ~3 chars for Vietnamese.
  return Math.ceil(text.length / 3.5);
}

/** Tiêu đề dài hơn ngưỡng này gần như chắc chắn là đoạn văn bị gắn nhầm thẻ heading. */
export const MAX_HEADING_LEN = 120;

/**
 * Chuẩn hoá markdown trước khi chunk: bỏ khoảng trắng cuối dòng, gộp space/tab
 * thừa, gộp dòng trống liên tiếp, BỎ dòng kẻ ngang/gạch chân đứng riêng (---, ***,
 * ___, ===) và KHỬ TRÙNG các đoạn lặp lại — xử lý output nhiễu của Turndown/
 * LlamaParse và dữ liệu nội dung bị nhân bản.
 */
function normalizeMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const cleaned: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/[ \t]+$/, '').replace(/[ \t]{2,}/g, ' ');
    // Dòng chỉ gồm ký tự kẻ ngang/gạch chân (≥3) → bỏ, coi như ngắt đoạn.
    if (/^\s*([-*_=])\1{2,}\s*$/.test(line)) {
      cleaned.push('');
      continue;
    }
    cleaned.push(line);
  }
  const text = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return dedupeParagraphs(text);
}

/** Khử các đoạn (paragraph) trùng lặp nguyên văn, giữ lần xuất hiện đầu tiên. */
function dedupeParagraphs(text: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const key = para.trim().replace(/\s+/g, ' ');
    // Chỉ khử đoạn đủ dài để tránh xoá nhầm tiêu đề/nhãn ngắn trùng nhau.
    if (key.length > 40) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(para);
  }
  return out.join('\n\n');
}

/** Chunk có ý nghĩa khi chứa ít nhất một chữ cái hoặc chữ số (loại bỏ rác bảng/đường kẻ). */
function hasMeaningfulContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}
