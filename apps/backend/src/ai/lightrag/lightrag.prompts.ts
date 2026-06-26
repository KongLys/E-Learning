import {
  wrapUntrusted,
  neutralizeInline,
  UNTRUSTED_DATA_RULE,
} from '../guard/prompt-safety.util';

/** Các loại thực thể cho phép — giữ hẹp ở mức khái niệm để tránh nhiễu danh từ vụn. */
export const ENTITY_TYPES = [
  'concept',
  'algorithm',
  'tool',
  'technology',
  'person',
  'other',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const GRAPH_EXTRACTION_SYSTEM =
  'Bạn là công cụ xây dựng đồ thị tri thức cho tài liệu học tập (lĩnh vực CNTT). ' +
  'Nhiệm vụ: trích các THỰC THỂ quan trọng (khái niệm, thuật toán, công cụ, công nghệ) ' +
  'và các QUAN HỆ giữa chúng từ nội dung được cung cấp. Chỉ trích thông tin CÓ THẬT ' +
  'trong văn bản, KHÔNG bịa thêm. Ưu tiên thuật ngữ chuyên môn cấp khái niệm, BỎ QUA ' +
  'danh từ vụn/không mang tính tri thức. Trả lời bằng JSON hợp lệ duy nhất. ' +
  UNTRUSTED_DATA_RULE;

/**
 * Prompt trích entity + relation từ một đoạn nội dung bài học.
 * - `content`: nội dung chunk (untrusted → bọc marker).
 * - `knownEntities`: tên các entity đã có của khóa, để model TÁI DÙNG đúng tên
 *   (giảm trùng lặp/biến thể chính tả) thay vì đặt tên mới.
 */
export function buildGraphExtractionPrompt(
  content: string,
  knownEntities: string[],
): string {
  const knownBlock =
    knownEntities.length > 0
      ? `Các thực thể đã biết trong khóa học (ưu tiên dùng lại đúng tên nếu trùng khái niệm):\n${knownEntities
          .slice(0, 60)
          .map((e) => `- ${neutralizeInline(e, 100)}`)
          .join('\n')}\n\n`
      : '';

  return `${knownBlock}Nội dung bài học cần phân tích:
${wrapUntrusted(content)}

Hãy trích xuất và trả về JSON đúng cấu trúc sau (không thêm markdown, không giải thích):
{
  "entities": [
    { "name": "<tên thực thể, danh từ ngắn gọn>", "type": "<một trong: ${ENTITY_TYPES.join(
      ' | ',
    )}>", "description": "<mô tả 1-2 câu DỰA TRÊN nội dung trên>" }
  ],
  "relations": [
    { "source": "<tên thực thể nguồn>", "target": "<tên thực thể đích>", "keywords": "<2-5 từ khóa nêu bản chất quan hệ>", "description": "<1 câu giải thích quan hệ dựa trên nội dung>" }
  ]
}

Quy tắc:
- Chỉ trích thực thể mang tính tri thức/chuyên môn (tối đa 12 thực thể cho đoạn này).
- "source" và "target" của mỗi quan hệ PHẢI nằm trong danh sách "entities" vừa trích (hoặc thực thể đã biết).
- Không tạo quan hệ nếu không có căn cứ trong văn bản.
- Nếu đoạn không có tri thức đáng kể, trả {"entities": [], "relations": []}.`;
}

/** Kết quả parse từ LLM (trước khi merge vào DB). */
export interface ExtractedEntity {
  name: string;
  type: EntityType;
  description: string;
}
export interface ExtractedRelation {
  source: string;
  target: string;
  keywords: string;
  description: string;
}
export interface ExtractedGraph {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

/** Parse chịu lỗi JSON do model trả (gỡ code fence, lấy object ngoài cùng). */
export function parseExtractedGraph(raw: string): ExtractedGraph {
  const empty: ExtractedGraph = { entities: [], relations: [] };
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return empty;
  try {
    const obj = JSON.parse(
      raw.slice(start, end + 1),
    ) as Partial<ExtractedGraph>;
    const typeSet = new Set<string>(ENTITY_TYPES);
    const entities: ExtractedEntity[] = Array.isArray(obj.entities)
      ? obj.entities
          .map((e) => ({
            name: String(e?.name ?? '').trim(),
            type: (typeSet.has(String(e?.type))
              ? String(e?.type)
              : 'other') as EntityType,
            description: String(e?.description ?? '').trim(),
          }))
          .filter((e) => e.name.length > 0)
      : [];
    const relations: ExtractedRelation[] = Array.isArray(obj.relations)
      ? obj.relations
          .map((r) => ({
            source: String(r?.source ?? '').trim(),
            target: String(r?.target ?? '').trim(),
            keywords: String(r?.keywords ?? '').trim(),
            description: String(r?.description ?? '').trim(),
          }))
          .filter((r) => r.source.length > 0 && r.target.length > 0)
      : [];
    return { entities, relations };
  } catch {
    return empty;
  }
}
