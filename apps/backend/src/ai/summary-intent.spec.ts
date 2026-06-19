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
});
