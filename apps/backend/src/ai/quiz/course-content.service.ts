import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../providers/gemini.service';
import { VectorStoreService, ChunkScope } from '../vector/vector-store.service';
import { RaptorService } from '../raptor/raptor.service';

const RETRIEVE_K = 40;
const MAX_SOURCE_CHARS = 14000;
/** Giới hạn ký tự dành cho phần tóm tắt RAPTOR (nội dung cốt lõi). */
const RAPTOR_SUMMARY_CHARS = 5000;
/** Khoảng cách poll (ms) khi chờ RAPTOR build hoàn thành. */
const RAPTOR_POLL_INTERVAL_MS = 3_000;
/** Tổng thời gian tối đa chờ RAPTOR build (ms). */
const RAPTOR_MAX_WAIT_MS = 120_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Gom nội dung khoá học (theo scope tuỳ chọn) thành một "source" văn bản để đưa
 * vào LLM sinh quiz/tóm tắt. Hai tầng:
 *   Tầng 1 — RAPTOR summary nodes (nội dung cốt lõi / mục tiêu học tập).
 *   Tầng 2 — hybrid search trên raw chunks (chi tiết cụ thể để ra câu hỏi).
 * RAPTOR phải sẵn sàng trước; nếu chưa có sẽ trigger build và chờ.
 *
 * Tách dùng chung cho ChatQuizService (quiz qua chat) và FinalQuizService
 * (quiz cuối khoá).
 */
@Injectable()
export class CourseContentService {
  constructor(
    private prisma: PrismaService,
    private gemini: GeminiService,
    private vector: VectorStoreService,
    private raptor: RaptorService,
  ) {}

  /** Gom nội dung (RAPTOR summary + hybrid search) theo scope; trả về source text. */
  async collect(
    courseId: string,
    query: string,
    scope?: ChunkScope,
  ): Promise<string> {
    // 1. Đảm bảo RAPTOR sẵn sàng (trigger + poll nếu chưa build).
    await this.ensureRaptorReady(courseId);

    // 2. Lấy RAPTOR summaries → phần "nội dung cốt lõi".
    const { label, nodes } = await this.raptor.getScopeNodes(courseId, scope);
    let summarySection = '';
    if (nodes.length > 0) {
      const summaryText = nodes
        .map((n) => (n.title ? `${n.title}\n${n.content}` : n.content))
        .join('\n\n')
        .trim()
        .slice(0, RAPTOR_SUMMARY_CHARS);
      summarySection = `=== NỘI DUNG CỐT LÕI (${label}) ===\n${summaryText}`;
    }

    // 3. Hybrid search trên chunk gốc → phần "nội dung chi tiết".
    let chunks: { content: string }[] = [];
    try {
      const embedding = await this.gemini.embedQuery(query);
      chunks = await this.vector.hybridSearch(
        courseId,
        embedding,
        query,
        RETRIEVE_K,
        scope,
      );
    } catch {
      chunks = [];
    }
    if (chunks.length === 0) {
      chunks = await this.prisma.courseChunk.findMany({
        where: {
          courseId,
          ...(scope?.lessonId ? { lessonId: scope.lessonId } : {}),
          ...(scope?.sectionId ? { sectionId: scope.sectionId } : {}),
        },
        orderBy: { chunkIndex: 'asc' },
        take: RETRIEVE_K,
        select: { content: true },
      });
    }

    // Phân bổ ký tự còn lại cho phần chi tiết sau khi đã có summary.
    const chunkLimit = summarySection
      ? Math.max(2000, MAX_SOURCE_CHARS - summarySection.length - 50)
      : MAX_SOURCE_CHARS;

    const seen = new Set<string>();
    const parts: string[] = [];
    let total = 0;
    for (const c of chunks) {
      const t = (c.content ?? '').trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      parts.push(t);
      total += t.length;
      if (total >= chunkLimit) break;
    }
    const chunkSection = parts.join('\n\n');

    if (summarySection && chunkSection) {
      return `${summarySection}\n\n=== NỘI DUNG CHI TIẾT ===\n${chunkSection}`.slice(
        0,
        MAX_SOURCE_CHARS,
      );
    }
    return (summarySection || chunkSection).slice(0, MAX_SOURCE_CHARS);
  }

  /**
   * Trigger build RAPTOR nếu chưa có / cũ, sau đó poll cho đến khi cây sẵn sàng
   * hoặc hết timeout. Ném lỗi phù hợp thay vì fallback về flow cũ.
   */
  async ensureRaptorReady(courseId: string): Promise<void> {
    const readiness = await this.raptor.ensureReady(courseId);
    if (readiness === 'empty') {
      throw new UnprocessableEntityException(
        'Khoá học chưa có đủ nội dung để tạo quiz',
      );
    }
    if (readiness === 'ready') return;

    // 'building' → đã enqueue, poll cho đến khi hoàn thành.
    const deadline = Date.now() + RAPTOR_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(RAPTOR_POLL_INTERVAL_MS);
      const tree = await this.prisma.courseRaptorTree.findUnique({
        where: { courseId },
        select: { status: true },
      });
      if (tree?.status === 'ready') return;
      if (tree?.status === 'failed') {
        throw new ServiceUnavailableException(
          'Không thể xây dựng cấu trúc nội dung khoá học, vui lòng thử lại',
        );
      }
    }
    throw new ServiceUnavailableException(
      'Đang xây dựng cấu trúc nội dung khoá học, vui lòng thử lại sau ít phút',
    );
  }
}
