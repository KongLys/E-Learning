export const SYSTEM_INSTRUCTION = `Bạn là trợ lý AI của một khóa học trực tuyến. Nhiệm vụ của bạn là trả lời câu hỏi của học viên dựa CHỈ trên tài liệu khóa học được cung cấp.

Quy tắc:
1. Chỉ trả lời dựa trên thông tin trong CONTEXT bên dưới. Không bịa thông tin.
2. Nếu CONTEXT không đủ để trả lời, hãy nói rõ "Tài liệu khóa học chưa đề cập đến nội dung này".
3. Khi trích dẫn, ghi rõ phần / mục trong tài liệu (ví dụ: [Chương 2 > 2.1]).
4. Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng, đúng trọng tâm câu hỏi.
5. Khi cần thiết, có thể trình bày bằng danh sách hoặc bảng để dễ đọc.`;

export function buildQueryRewritePrompt(
  query: string,
  history: string[],
): string {
  const historyBlock =
    history.length > 0
      ? `Lịch sử hội thoại gần đây:\n${history.slice(-4).join('\n')}\n\n`
      : '';
  return `${historyBlock}Câu hỏi của học viên: "${query}"

Hãy sinh ra 3 biến thể của câu hỏi này để cải thiện kết quả truy xuất tài liệu khóa học. Mỗi biến thể là một câu hỏi/cụm từ tìm kiếm khác nhau nhưng cùng ý nghĩa. Trả về DUY NHẤT 3 dòng, mỗi dòng là 1 biến thể, không thêm số thứ tự, không thêm giải thích.`;
}

export function buildCompressionPrompt(
  query: string,
  chunks: string[],
): string {
  const ctxBlock = chunks
    .map((c, i) => `--- Đoạn ${i + 1} ---\n${c}`)
    .join('\n\n');
  return `Câu hỏi: "${query}"

Bên dưới là các đoạn tài liệu được trích xuất:
${ctxBlock}

Hãy trích xuất CHỈ những câu / đoạn ngắn THỰC SỰ liên quan đến câu hỏi. Loại bỏ phần không liên quan. Giữ nguyên văn (không tóm tắt lại). Nếu không có gì liên quan, trả về chuỗi rỗng.

Định dạng output:
[Đoạn N] <nội dung trích nguyên văn>
[Đoạn M] <nội dung trích nguyên văn>`;
}

export interface CitationInput {
  index: number;
  sectionTitle: string | null;
  pageNumber: number | null;
}

export function buildAnswerPrompt(
  query: string,
  compressedContext: string,
  citations: CitationInput[],
  history: string[],
): string {
  const historyBlock =
    history.length > 0
      ? `Lịch sử hội thoại:\n${history.slice(-6).join('\n')}\n\n`
      : '';
  const citationLegend = citations
    .map(
      (c) =>
        `[Đoạn ${c.index + 1}] = ${c.sectionTitle ?? 'Không rõ phần'}${c.pageNumber ? `, trang ${c.pageNumber}` : ''}`,
    )
    .join('\n');
  return `${historyBlock}CONTEXT (trích từ tài liệu khóa học):
${compressedContext || '(không tìm thấy đoạn liên quan)'}

Chú thích nguồn:
${citationLegend}

Câu hỏi học viên: ${query}

Hãy trả lời học viên dựa trên CONTEXT bên trên. Khi tham chiếu, dùng cú pháp [Đoạn N] để chỉ rõ nguồn.`;
}
