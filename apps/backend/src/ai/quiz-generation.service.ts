import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from './gemini.service';
import { wrapUntrusted, UNTRUSTED_DATA_RULE } from './prompt-safety.util';

export interface GeneratedQuestion {
  content: string;
  options: { content: string; isCorrect: boolean }[];
  explanation?: string;
}

export interface QuizGenerateOpts {
  /** Số câu hỏi cần sinh. */
  count: number;
}

/**
 * Lõi sinh quiz trắc nghiệm bằng AI dùng chung cho cả "quiz ôn tập" (theo bài)
 * và "quiz cá nhân tạo qua chat" (theo khoá học).
 * Provider/model lấy từ REVIEW_QUIZ_PROVIDER / REVIEW_QUIZ_MODEL (mặc định ollama).
 */
@Injectable()
export class QuizGenerationService {
  private readonly logger = new Logger(QuizGenerationService.name);
  private readonly provider: 'gemini' | 'ollama';
  private readonly model: string | undefined;

  constructor(
    private gemini: GeminiService,
    config: ConfigService,
  ) {
    this.provider =
      config.get<string>('REVIEW_QUIZ_PROVIDER', 'ollama') === 'gemini'
        ? 'gemini'
        : 'ollama';
    this.model = config.get<string>('REVIEW_QUIZ_MODEL', '') || undefined;
  }

  /** Model AI đang dùng (để lưu lại cho debug). */
  get usedModel(): string {
    return this.model ?? this.provider;
  }

  async generate(
    source: string,
    opts: QuizGenerateOpts,
  ): Promise<GeneratedQuestion[]> {
    const systemInstruction =
      'Bạn là trợ giảng tạo câu hỏi trắc nghiệm ôn tập bằng tiếng Việt. ' +
      'Chỉ dựa vào nội dung được cung cấp. ' +
      'Luôn trả về JSON hợp lệ đúng định dạng yêu cầu, không kèm bất kỳ chữ nào ngoài JSON. ' +
      UNTRUSTED_DATA_RULE;

    const prompt = `Dựa vào nội dung dưới đây, hãy tạo ${opts.count} câu hỏi trắc nghiệm ôn tập (mỗi câu có đúng 1 đáp án đúng và 4 lựa chọn).

Trả về DUY NHẤT một mảng JSON, mỗi phần tử có dạng:
{
  "content": "nội dung câu hỏi",
  "options": [
    { "content": "lựa chọn A", "isCorrect": true },
    { "content": "lựa chọn B", "isCorrect": false },
    { "content": "lựa chọn C", "isCorrect": false },
    { "content": "lựa chọn D", "isCorrect": false }
  ],
  "explanation": "giải thích ngắn gọn vì sao đáp án đúng"
}

Quy tắc: mỗi câu đúng 4 lựa chọn và đúng 1 lựa chọn isCorrect=true; câu hỏi không trùng nhau; chỉ hỏi nội dung có trong tài liệu.

Nội dung:
${wrapUntrusted(source, 'tài liệu')}`;

    let raw: string;
    try {
      raw = await this.gemini.generate(prompt, {
        provider: this.provider,
        model: this.model,
        temperature: 0.4,
        maxOutputTokens: 4096,
        systemInstruction,
      });
    } catch (err) {
      this.logger.error(`Quiz generation failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Không tạo được quiz, vui lòng thử lại',
      );
    }

    const questions = this.parseQuestions(raw);
    if (questions.length === 0) {
      this.logger.warn('Quiz: could not parse any valid question from output');
      throw new ServiceUnavailableException(
        'Không tạo được quiz, vui lòng thử lại',
      );
    }
    return questions;
  }

  /** Bóc JSON từ output model (bỏ rào ```json, chữ thừa) và validate từng câu. */
  parseQuestions(raw: string): GeneratedQuestion[] {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) text = text.slice(start, end + 1);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const valid: GeneratedQuestion[] = [];
    for (const item of parsed) {
      const q = item as Partial<GeneratedQuestion>;
      if (!q || typeof q.content !== 'string' || !Array.isArray(q.options)) {
        continue;
      }
      const options = q.options
        .filter(
          (o): o is { content: string; isCorrect: boolean } =>
            !!o && typeof o.content === 'string',
        )
        .map((o) => ({ content: o.content, isCorrect: o.isCorrect === true }));
      const correctCount = options.filter((o) => o.isCorrect).length;
      // Chỉ nhận câu 1-đáp-án hợp lệ (>=2 lựa chọn, đúng 1 đáp án đúng).
      if (options.length < 2 || correctCount !== 1) continue;
      valid.push({
        content: q.content,
        options,
        explanation:
          typeof q.explanation === 'string' ? q.explanation : undefined,
      });
    }
    return valid;
  }
}
