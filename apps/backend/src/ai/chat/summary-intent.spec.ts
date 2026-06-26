import { detectSummaryIntent } from './ai-chat.service';

describe('detectSummaryIntent', () => {
  it('nhận diện yêu cầu tóm tắt cơ bản', () => {
    expect(detectSummaryIntent('Tóm tắt nội dung bài học này').isSummary).toBe(
      true,
    );
    expect(detectSummaryIntent('cho mình tổng quan khóa học').isSummary).toBe(
      true,
    );
    expect(detectSummaryIntent('nội dung chính của chương là gì nhỉ').isSummary).toBe(
      true,
    );
    expect(detectSummaryIntent('summary of this lesson please').isSummary).toBe(
      true,
    );
  });

  it('bỏ qua câu hỏi định nghĩa "tóm tắt là gì"', () => {
    expect(detectSummaryIntent('tóm tắt là gì').isSummary).toBe(false);
    expect(detectSummaryIntent('tổng quan nghĩa là sao').isSummary).toBe(false);
  });

  it('bỏ qua câu hỏi thường', () => {
    expect(detectSummaryIntent('thuật toán Dijkstra hoạt động thế nào').isSummary).toBe(
      false,
    );
    expect(detectSummaryIntent('cho ví dụ về con trỏ trong C').isSummary).toBe(
      false,
    );
  });

  it('suy ra phạm vi từ từ khóa', () => {
    expect(detectSummaryIntent('tóm tắt toàn bộ khóa học').level).toBe('course');
    expect(detectSummaryIntent('tóm tắt bài học này').level).toBe('lesson');
    expect(detectSummaryIntent('tóm tắt cả phần này').level).toBe('section');
    expect(detectSummaryIntent('tóm tắt giúp mình').level).toBeUndefined();
  });

  it('tóm tắt theo phạm vi (không nêu chủ đề) → hasTopic=false (đi RAPTOR)', () => {
    expect(detectSummaryIntent('tóm tắt bài học này').hasTopic).toBe(false);
    expect(detectSummaryIntent('cho mình tổng quan khóa học').hasTopic).toBe(
      false,
    );
    expect(
      detectSummaryIntent('nội dung chính của chương là gì nhỉ').hasTopic,
    ).toBe(false);
    expect(detectSummaryIntent('tóm tắt giúp mình').hasTopic).toBe(false);
    expect(detectSummaryIntent('tóm tắt toàn bộ khóa học').hasTopic).toBe(false);
  });

  it('tóm tắt một chủ đề cụ thể → isSummary && hasTopic (đi RAG/LightRAG)', () => {
    const a = detectSummaryIntent('tóm tắt về con trỏ');
    expect(a.isSummary).toBe(true);
    expect(a.hasTopic).toBe(true);

    const b = detectSummaryIntent('tổng hợp lại kiến thức đệ quy toàn khóa');
    expect(b.isSummary).toBe(true);
    expect(b.hasTopic).toBe(true);
    expect(b.level).toBe('course');

    const c = detectSummaryIntent('tóm tắt khái niệm vòng lặp trong cả khóa');
    expect(c.isSummary).toBe(true);
    expect(c.hasTopic).toBe(true);
  });
});
