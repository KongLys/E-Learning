/**
 * Kiểu dữ liệu dùng chung cho bộ benchmark RAG.
 * Pipeline production (RagService) là một khối cứng; ở đây ta tách nó thành các
 * "kỹ thuật" bật/tắt được (RagConfig) để chạy A/B/ablation và so sánh có tên.
 */

/** Loại bộ truy hồi nền cho một cấu hình. */
export type RetrieverKind = 'vector' | 'hybrid' | 'graph' | 'raptor';

/** Cấu hình một phương pháp RAG: chọn retriever + bật/tắt từng tầng xử lý. */
export interface RagConfig {
  /** Tên hiển thị trong bảng kết quả. */
  name: string;
  /** Bộ truy hồi nền. */
  retriever: RetrieverKind;
  /** Sinh biến thể truy vấn (multi-query) từ query analysis. */
  multiQuery: boolean;
  /** Step-back prompting: thêm một câu hỏi khái quát hơn để mở rộng pool. */
  stepBack: boolean;
  /** Rerank pool ứng viên bằng Cohere. */
  rerank: boolean;
  /** Nén ngữ cảnh (contextual compression) bằng LLM trước khi sinh. */
  compress: boolean;
}

/**
 * Loại câu hỏi golden — để phân tích kết quả theo độ khó/kiểu suy luận.
 *  - single/multi-concrete/multi-abstract: factoid → suy luận đa bước (xem
 *    generate-golden-mixed.ts).
 *  - lesson/section/course-summary: tóm tắt nội dung theo bài/phần/khóa
 *    (ground-truth = toàn bộ chunk của bài/phần/khóa).
 *  - topic-single/topic-multi: tóm tắt một CHỦ ĐỀ (GraphEntity) gói trong 1 bài,
 *    hoặc trải nhiều bài (ground-truth = chunk nguồn của entity).
 */
export type QuestionType =
  | 'single'
  | 'multi-concrete'
  | 'multi-abstract'
  | 'lesson-summary'
  | 'section-summary'
  | 'course-summary'
  | 'topic-single'
  | 'topic-multi';

/** Một mục trong bộ dữ liệu vàng (golden set). */
export interface GoldenItem {
  id: string;
  courseId: string;
  /** Kiểu câu hỏi (đơn bước / đa bước cụ thể / đa bước trừu tượng). */
  type?: QuestionType;
  question: string;
  /** Câu trả lời tham chiếu (dùng cho answer_correctness của RAGAS, tùy chọn). */
  groundTruthAnswer: string;
  /** ID các CourseChunk được coi là liên quan — chuẩn vàng cho metric retrieval. */
  relevantChunkIds: string[];
  /** Phạm vi tùy chọn (giới hạn theo phần/bài). */
  scope?: { sectionId?: string; lessonId?: string };
}

/** Ứng viên truy hồi đã chuẩn hóa, dùng chung cho mọi retriever. */
export interface Candidate {
  /** Khóa dedup/RRF: chunkId (vector/hybrid/graph) hoặc nodeId (raptor). */
  id: string;
  /** Văn bản đưa vào sinh câu trả lời + chấm RAGAS. */
  content: string;
  /** Tiêu đề mục/đoạn (để dựng citation legend). */
  title: string | null;
  /** Số trang nếu có. */
  pageNumber: number | null;
  /** Leaf chunk id(s) để chấm recall so với ground-truth (raptor map nhiều leaf). */
  leafChunkIds: string[];
  /** Điểm của retriever (debug). */
  score: number;
}

/** Bản ghi kết quả một câu hỏi qua một phương pháp — ghi ra JSONL để Python chấm. */
export interface RunRecord {
  method: string;
  questionId: string;
  /** Kiểu câu hỏi (để tách metric theo độ khó). */
  type?: QuestionType;
  courseId: string;
  question: string;
  groundTruthAnswer: string;
  relevantChunkIds: string[];
  /** Leaf chunk id đã truy hồi, theo thứ tự xếp hạng (sau rerank/cắt topK). */
  retrievedChunkIds: string[];
  /** Các passage (chunk/summary) đưa vào prompt — RAGAS chấm context/faithfulness. */
  contexts: string[];
  /** Câu trả lời sinh ra. */
  answer: string;
  /** Độ trễ end-to-end (ms). */
  latencyMs: number;
  /** Số lần gọi LLM generate (ước lượng chi phí). */
  llmCalls: number;
}

/** Metric retrieval tổng hợp cho một phương pháp. */
export interface RetrievalSummary {
  method: string;
  n: number;
  recallAtK: number;
  mrr: number;
  ndcgAtK: number;
  precisionAtK: number;
  hitRate: number;
  avgLatencyMs: number;
  avgLlmCalls: number;
}
