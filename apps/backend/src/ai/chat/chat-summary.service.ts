import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../providers/gemini.service';
import { RaptorService } from '../raptor/raptor.service';
import { ChunkScope } from '../vector/vector-store.service';
import { Citation } from '../rag/rag.service';
import {
  SUMMARY_ANSWER_SYSTEM,
  buildSummaryAnswerPrompt,
} from '../raptor/raptor.prompts';

export type SummaryLevel = 'course' | 'section' | 'lesson';

export interface SummaryResult {
  stream: AsyncIterable<string>;
  citations: Citation[];
}

const BUILDING_MSG =
  'Mình đang chuẩn bị bản tóm tắt nội dung khóa học (dựng cây tóm tắt phân cấp). ' +
  'Việc này chạy nền và chỉ mất một lúc — bạn thử hỏi lại sau ít phút nhé.';
const EMPTY_MSG = 'Tài liệu khóa học chưa có nội dung để tóm tắt.';

/**
 * Luồng tóm tắt riêng: dùng cây RAPTOR đã dựng sẵn thay vì RAG truy xuất theo
 * câu hỏi. Trả về node tóm tắt theo phạm vi (bài/phần/khóa) rồi để LLM tổng hợp
 * thành bản tóm tắt mạch lạc, vẫn trong phạm vi tài liệu khóa học.
 */
@Injectable()
export class ChatSummaryService {
  private readonly logger = new Logger(ChatSummaryService.name);

  constructor(
    private gemini: GeminiService,
    private raptor: RaptorService,
  ) {}

  async summarize(
    courseId: string,
    query: string,
    scope?: ChunkScope,
    level?: SummaryLevel,
  ): Promise<SummaryResult> {
    const readiness = await this.raptor.ensureReady(courseId);
    if (readiness === 'empty') return single(EMPTY_MSG);
    if (readiness === 'building') return single(BUILDING_MSG);

    const effScope = resolveScope(scope, level);
    let picked = await this.raptor.getScopeNodes(courseId, effScope);
    // Phạm vi hẹp chưa có node (vd bài chưa có chunk) → lùi về tổng quan khóa.
    if (picked.nodes.length === 0 && effScope) {
      picked = await this.raptor.getScopeNodes(courseId, undefined);
    }
    if (picked.nodes.length === 0) return single(EMPTY_MSG);

    const citations: Citation[] = picked.nodes.map((n) => ({
      chunkId: n.childChunkIds[0] ?? n.id,
      sectionTitle: n.title,
      pageNumber: null,
      sectionId: n.sectionId,
      lessonId: n.lessonId,
      excerpt: n.content.length > 4000 ? `${n.content.slice(0, 4000)}…` : n.content,
    }));

    const prompt = buildSummaryAnswerPrompt(
      query,
      picked.label,
      picked.nodes.map((n) => ({ title: n.title, content: n.content })),
    );
    const stream = this.gemini.generateStream(prompt, {
      systemInstruction: SUMMARY_ANSWER_SYSTEM,
      temperature: 0.3,
    });
    this.logger.debug(
      `Summary flow: ${picked.nodes.length} node(s), scope=${picked.label}`,
    );
    return { stream, citations };
  }
}

function resolveScope(
  scope: ChunkScope | undefined,
  level: SummaryLevel | undefined,
): ChunkScope | undefined {
  if (level === 'course') return undefined;
  if (level === 'lesson') {
    return scope?.lessonId ? { lessonId: scope.lessonId } : scope;
  }
  if (level === 'section') {
    return scope?.sectionId ? { sectionId: scope.sectionId } : scope;
  }
  return scope;
}

function single(message: string): SummaryResult {
  async function* gen(): AsyncGenerator<string> {
    yield message;
  }
  return { stream: gen(), citations: [] };
}
