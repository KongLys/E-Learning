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
    const sections = this.splitByHeadings(markdown);
    const chunks: MarkdownChunk[] = [];
    let index = 0;
    for (const section of sections) {
      const body = section.text.trim();
      if (!body) continue;
      if (body.length <= this.maxChars) {
        chunks.push({
          content: body,
          sectionTitle: section.title,
          chunkIndex: index++,
          tokenCount: estimateTokens(body),
        });
      } else {
        for (const part of recursiveSplit(body, this.maxChars, this.overlap)) {
          chunks.push({
            content: part,
            sectionTitle: section.title,
            chunkIndex: index++,
            tokenCount: estimateTokens(part),
          });
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
      if (m) {
        flush();
        const level = m[1].length;
        while (stack.length > 0 && stack[stack.length - 1].level >= level)
          stack.pop();
        stack.push({ title: m[2], level });
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
  // Hard split
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars - overlap) {
    out.push(text.slice(i, i + maxChars));
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
  // Add overlap by prefixing each chunk (except first) with tail of previous
  return out.map((chunk, i) => {
    if (i === 0 || overlap <= 0) return chunk;
    const prev = out[i - 1];
    const tail = prev.slice(Math.max(0, prev.length - overlap));
    return `${tail}\n${chunk}`;
  });
}

function estimateTokens(text: string): number {
  // Rough heuristic: 1 token ≈ 4 chars for English / ~3 chars for Vietnamese.
  return Math.ceil(text.length / 3.5);
}
