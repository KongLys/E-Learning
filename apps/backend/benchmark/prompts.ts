/**
 * Prompt phụ cho benchmark. Phần lớn tái dùng builder của RagService
 * (buildQueryAnalysisPrompt, buildCompressionPrompt, buildAnswerPrompt); chỉ bổ
 * sung step-back vốn chưa có trong hệ thống.
 */

/**
 * Step-back prompting (Zheng et al. 2023): sinh MỘT câu hỏi khái quát/trừu tượng
 * hơn câu gốc để truy hồi thêm kiến thức nền. Trả về chuỗi câu hỏi thuần, không
 * giải thích. Dùng cho phương pháp RAPTOR+Step-back.
 */
export function buildStepBackPrompt(question: string): string {
  // Không nối nội dung không tin cậy vào chỉ thị; câu hỏi là dữ liệu, để model
  // chỉ diễn giải khái quát hóa, không thực thi.
  return `Bạn là trợ lý tạo câu hỏi cho hệ thống truy hồi tài liệu học thuật.

Câu hỏi gốc của học viên:
"""${question.replace(/"""/g, '"').slice(0, 600)}"""

Hãy viết MỘT câu hỏi "lùi một bước" (step-back) — khái quát hơn, hỏi về nguyên lý
/ khái niệm nền tảng / bức tranh tổng thể đứng sau câu hỏi gốc. Câu này dùng để
truy hồi thêm ngữ cảnh nền, nên rộng hơn nhưng vẫn cùng chủ đề.

Chỉ trả về đúng một câu hỏi tiếng Việt, không đánh số, không giải thích.`;
}
