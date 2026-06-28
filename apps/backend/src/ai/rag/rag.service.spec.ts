import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RagService } from './rag.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../providers/gemini.service';
import { CohereService } from '../providers/cohere.service';
import { VectorStoreService } from '../vector/vector-store.service';
import { RaptorService } from '../raptor/raptor.service';
import { NO_CONTEXT_MESSAGE } from './prompts';

const mockGemini = {
  embedBatch: jest.fn(),
  generate: jest.fn(),
  generateStream: jest.fn(),
};
const mockCohere = { rerank: jest.fn() };
const mockVector = { hybridSearch: jest.fn() };
// Retriever chính: RAPTOR collapsed-tree. Mặc định trả 2 leaf chunk thật.
const mockRaptor = { collapsedTreeRetrieve: jest.fn() };
const mockConfig = { get: jest.fn((_k: string, d?: unknown) => d) };

// Query analysis trả JSON hợp lệ với 3 biến thể (variants[2] = step-back).
const ANALYSIS_JSON = JSON.stringify({
  intent: 'definition',
  subject: 'redis',
  resolvedQuery: 'khái niệm redis',
  variants: [
    'khái niệm redis',
    'redis definition',
    'nguyên lý lưu trữ key-value hoạt động thế nào',
  ],
  lowLevelKeywords: ['redis'],
  highLevelKeywords: ['lưu trữ key-value'],
});

/** Một RAPTOR leaf item (chunk thật) — có metadata citation. */
const raptorLeaf = (id: string) => ({
  id,
  title: 'Phần 1',
  content: `nội dung ${id}`,
  leafChunkIds: [id],
  score: 0.5,
  kind: 'leaf' as const,
  sectionId: 's1',
  lessonId: 'l1',
  pageNumber: 1,
});

/** Một RetrievedChunk (cho nhánh fallback hybrid). */
const chunk = (id: string) => ({
  id,
  content: `nội dung ${id}`,
  sectionTitle: 'Phần 1',
  pageNumber: 1,
  sectionId: 's1',
  lessonId: 'l1',
  sourceType: 'document',
  score: 0.5,
});

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const piece of stream) out += piece;
  return out;
}

function* fakeAnswer(): Generator<string> {
  yield 'Đáp ';
  yield 'án từ tài liệu.';
}

describe('RagService - relevance gate', () => {
  let service: RagService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: PrismaService, useValue: {} },
        { provide: GeminiService, useValue: mockGemini },
        { provide: CohereService, useValue: mockCohere },
        { provide: VectorStoreService, useValue: mockVector },
        { provide: RaptorService, useValue: mockRaptor },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<RagService>(RagService);
    jest.clearAllMocks();

    // analyze (maxOutputTokens 640) → JSON 3 biến thể; compress (1024) → có nội dung.
    mockGemini.generate.mockImplementation(
      (_prompt: string, opts: { maxOutputTokens?: number }) =>
        Promise.resolve(
          opts?.maxOutputTokens === 640 ? ANALYSIS_JSON : 'đoạn trích liên quan',
        ),
    );
    mockGemini.embedBatch.mockImplementation((arr: string[]) =>
      Promise.resolve(arr.map(() => [0.1, 0.2, 0.3])),
    );
    mockRaptor.collapsedTreeRetrieve.mockResolvedValue([
      raptorLeaf('c1'),
      raptorLeaf('c2'),
    ]);
    mockVector.hybridSearch.mockResolvedValue([chunk('c1'), chunk('c2')]);
    mockGemini.generateStream.mockReturnValue(fakeAnswer());
  });

  it('điểm rerank thấp nhưng compression có nội dung ⇒ vẫn trả lời (ngưỡng rerank đã bỏ)', async () => {
    // Cổng lọc theo điểm rerank đã được gỡ ('threshold tạm bỏ' trong rag.service);
    // gate còn lại chỉ là compression rỗng. Điểm thấp KHÔNG còn chặn câu trả lời.
    mockCohere.rerank.mockResolvedValue([
      { index: 0, relevanceScore: 0.05 },
      { index: 1, relevanceScore: 0.02 },
    ]);

    const res = await service.ask('course1', 'cách cài đặt redis');

    expect(await collect(res.stream)).toContain('Đáp');
    expect(mockGemini.generateStream).toHaveBeenCalledTimes(1);
    expect(mockRaptor.collapsedTreeRetrieve).toHaveBeenCalled();
    expect(res.citations).toHaveLength(2);
  });

  it('điểm cao + compression có nội dung ⇒ trả lời bình thường, citation từ chunk RAPTOR', async () => {
    mockCohere.rerank.mockResolvedValue([
      { index: 0, relevanceScore: 0.91 },
      { index: 1, relevanceScore: 0.2 },
    ]);

    const res = await service.ask('course1', 'câu hỏi trong phạm vi');

    expect(await collect(res.stream)).toContain('Đáp');
    expect(mockGemini.generateStream).toHaveBeenCalledTimes(1);
    expect(res.citations).toHaveLength(2);
    expect(res.citations[0].chunkId).toBe('c1');
  });

  it('compression rỗng dù có chunk đạt ngưỡng ⇒ "chưa đề cập"', async () => {
    mockCohere.rerank.mockResolvedValue([{ index: 0, relevanceScore: 0.9 }]);
    mockGemini.generate.mockImplementation(() => Promise.resolve('')); // cả analyze lẫn compress rỗng

    const res = await service.ask('course1', 'câu hỏi');

    expect(await collect(res.stream)).toBe(NO_CONTEXT_MESSAGE);
    expect(res.citations).toEqual([]);
    expect(mockGemini.generateStream).not.toHaveBeenCalled();
  });

  it('Cohere fallback (mọi điểm = 0) ⇒ bỏ qua cổng điểm, vẫn chạy', async () => {
    mockCohere.rerank.mockResolvedValue([
      { index: 0, relevanceScore: 0 },
      { index: 1, relevanceScore: 0 },
    ]);

    const res = await service.ask('course1', 'câu hỏi');

    expect(mockGemini.generateStream).toHaveBeenCalledTimes(1);
    expect(res.citations.length).toBeGreaterThan(0);
  });

  it('khóa chưa có cây RAPTOR ⇒ fallback hybrid (không LightRAG)', async () => {
    mockRaptor.collapsedTreeRetrieve.mockResolvedValue([]); // chưa build cây
    mockCohere.rerank.mockResolvedValue([
      { index: 0, relevanceScore: 0.8 },
      { index: 1, relevanceScore: 0.7 },
    ]);

    const res = await service.ask('course1', 'câu hỏi');

    expect(mockVector.hybridSearch).toHaveBeenCalled();
    expect(mockGemini.generateStream).toHaveBeenCalledTimes(1);
    expect(res.citations).toHaveLength(2);
  });
});
