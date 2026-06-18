/**
 * Guardrail phát hiện prompt injection / jailbreak ở ĐẦU VÀO (câu hỏi người dùng).
 *
 * Khác với `prompt-safety.util.ts` (trung hòa DỮ LIỆU nhúng vào prompt), file này
 * phân loại Ý ĐỒ của chính câu hỏi và quyết định hành vi:
 *   - 'block': mưu đồ nghiêm trọng (đòi lộ system prompt, jailbreak, đổi vai) → từ chối.
 *   - 'strip': tiền tố ghi đè chỉ thị nhưng kèm câu hỏi hợp lệ → bỏ phần độc, trả lời phần thật.
 *   - 'clean': không phát hiện → xử lý bình thường.
 *
 * Đây là tầng heuristic (regex) — thuần hàm, dễ test. Tầng LLM nằm ở GuardrailService.
 */

import { OPEN_MARKER, CLOSE_MARKER } from '../prompt-safety.util';

export type GuardVerdict = 'clean' | 'strip' | 'block';

export interface GuardResult {
  verdict: GuardVerdict;
  /** Nhãn lý do (để log/điều tra). */
  category?: string;
  /** Câu hỏi đã loại bỏ mệnh đề injection (dùng khi verdict='strip'). */
  sanitizedQuery: string;
}

/** Câu từ chối lịch sự, kéo người dùng về phạm vi khoá học. */
export const REFUSAL_MESSAGE =
  'Xin lỗi, mình chỉ là trợ lý học tập và chỉ hỗ trợ trả lời dựa trên nội dung ' +
  'khoá học. Mình không thể bỏ qua hướng dẫn, tiết lộ cấu hình hệ thống hay đóng ' +
  'vai khác. Bạn cứ đặt câu hỏi liên quan đến bài học nhé!';

// ─── Pattern phát hiện ──────────────────────────────────────────────────────────

/** Đòi lộ prompt / chỉ thị hệ thống. */
const LEAK_PATTERN =
  /(tiết lộ|tiet lo|in ra|cho (tôi |toi |mình |minh )?xem|lộ|lo ra|hiển thị|hien thi|nhắc lại|nhac lai|lặp lại|lap lai|reveal|show|print|repeat|expose|dump)[\s\S]{0,40}?(system\s*prompt|prompt hệ thống|prompt he thong|chỉ thị (hệ thống|của bạn)|chi thi (he thong|cua ban)|hướng dẫn (hệ thống|của bạn|gốc|ban đầu)|huong dan (he thong|cua ban|goc|ban dau)|system (instruction|message)|your (system )?(prompt|instructions?)|initial (prompt|instructions?))/i;

/** Jailbreak / ép đổi vai / gỡ giới hạn. */
const JAILBREAK_PATTERN =
  /(\bDAN\b|jailbreak|developer mode|chế độ nhà phát triển|che do nha phat trien|đóng vai|dong vai|nhập vai|nhap vai|act as|pretend (to be|that)|roleplay|role-play|you are now|bạn (giờ đây|bây giờ|từ giờ) (là|sẽ là|không còn)|ban (gio day|bay gio|tu gio) (la|se la|khong con)|no (restrictions?|rules?|limits?|filter)|không (còn |con )?(bị )?(giới hạn|gioi han|ràng buộc|rang buoc|kiểm duyệt|kiem duyet)|unfiltered|bỏ qua (mọi |moi |tất cả |tat ca )?(quy tắc an toàn|quy tac an toan|nguyên tắc an toàn|bộ lọc|bo loc|kiểm duyệt|safety|guardrails?))/i;

/** Tiền tố ghi đè chỉ thị (mức nhẹ — thường kèm câu hỏi thật phía sau). */
const OVERRIDE_PATTERN =
  /(bỏ qua|bo qua|phớt lờ|phot lo|quên|quen|đừng (theo|tuân)|dung (theo|tuan)|không (cần |can )?(theo|tuân)|khong (can )?(theo|tuan)|ignore|disregard|forget|override|skip)\s+(đi\s+)?(toàn bộ |toan bo |tất cả |tat ca |mọi |moi |hết |het |all |the |any |previous |các |cac )*(hướng dẫn|huong dan|chỉ thị|chi thi|quy tắc|quy tac|hướng dẫn trên|instructions?|rules?|prompts?|guidelines?|directions?)/i;

/** Từ khoá "meta" rộng — dùng để cổng cho lượt phân loại LLM. */
const META_SIGNAL_PATTERN =
  /(prompt|instruction|chỉ thị|chi thi|hướng dẫn|huong dan|quy tắc|quy tac|\brules?\b|\bsystem\b|\brole\b|vai trò|vai tro|ignore|disregard|bỏ qua|bo qua|phớt lờ|phot lo|pretend|đóng vai|dong vai|jailbreak|developer mode|act as)/i;

/** Liên từ nối giữa mệnh đề injection và câu hỏi thật. */
const CONNECTOR_PATTERN = /^\s*(và|va|rồi|roi|and|then|,|;|\.|:|-)\s+/i;
/** Hư từ mở đầu thường gặp (để dọn đầu câu sau khi cắt). */
const LEADING_FILLER_PATTERN =
  /^\s*(hãy|hay|làm ơn|lam on|vui lòng|vui long|please|xin|thì|thi|bạn |ban )+/i;

/**
 * Loại bỏ mệnh đề injection khỏi câu hỏi, trả về phần hợp lệ còn lại (đã dọn).
 */
export function stripInjection(query: string): string {
  let s = (query ?? '').replace(OVERRIDE_PATTERN, ' ');
  // Dọn liên từ / hư từ còn sót ở đầu phần còn lại.
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(CONNECTOR_PATTERN, '');
  // Lặp dọn hư từ mở đầu ("hãy", "vui lòng"...) cho gọn.
  let prev: string;
  do {
    prev = s;
    s = s.replace(LEADING_FILLER_PATTERN, '').trim();
  } while (s !== prev);
  return s.trim();
}

/** Có tín hiệu "meta" đáng để gọi LLM phân loại thêm không. */
export function hasMetaSignal(query: string): boolean {
  return META_SIGNAL_PATTERN.test(query ?? '');
}

/**
 * Phát hiện injection bằng heuristic. Thứ tự ưu tiên: leak/jailbreak (block) →
 * override (strip, hoặc block nếu không còn câu hỏi thật) → clean.
 */
export function detectInjection(query: string): GuardResult {
  const q = query ?? '';

  if (LEAK_PATTERN.test(q)) {
    return {
      verdict: 'block',
      category: 'system-prompt-leak',
      sanitizedQuery: q,
    };
  }
  if (JAILBREAK_PATTERN.test(q)) {
    return { verdict: 'block', category: 'jailbreak', sanitizedQuery: q };
  }
  if (OVERRIDE_PATTERN.test(q)) {
    const remainder = stripInjection(q);
    // Nếu sau khi bỏ mệnh đề injection không còn câu hỏi thực ⇒ thuần injection.
    if (remainder.length < 3) {
      return {
        verdict: 'block',
        category: 'instruction-override',
        sanitizedQuery: q,
      };
    }
    return {
      verdict: 'strip',
      category: 'instruction-override',
      sanitizedQuery: remainder,
    };
  }
  return { verdict: 'clean', sanitizedQuery: q };
}

// ─── Guardrail ĐẦU RA ────────────────────────────────────────────────────────────

const SYSTEM_LEAK_FRAGMENTS = [
  'Bạn là trợ lý AI của một khóa học trực tuyến',
  OPEN_MARKER,
  CLOSE_MARKER,
  'DU_LIEU_NGUOI_DUNG',
];

/**
 * Làm sạch đầu ra của model trước khi trả về người dùng: gỡ marker nội bộ và
 * các đoạn rò rỉ system instruction nếu model lỡ in ra.
 */
export function scrubOutput(text: string): string {
  let s = text ?? '';
  for (const frag of SYSTEM_LEAK_FRAGMENTS) {
    if (!frag) continue;
    s = s.split(frag).join('');
  }
  return s;
}
