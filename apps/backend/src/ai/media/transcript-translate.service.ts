import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GeminiService,
  TranscriptCue,
  TranscriptChapter,
} from '../providers/gemini.service';
import { wrapUntrusted, UNTRUSTED_DATA_RULE } from '../guard/prompt-safety.util';

export type SubtitleLang = 'vi' | 'en';

/**
 * Dịch phụ đề / chương của video bài giảng sang ngôn ngữ đích (Việt hoặc Anh) để
 * hiển thị song ngữ trong trình phát. CHỈ phục vụ hiển thị — bản dịch KHÔNG được
 * dùng cho chunking/embedding (luôn embed bản gốc).
 *
 * LLM chỉ dịch phần `text` (cue) / `title`+`summary` (chương); mốc thời gian
 * (`startSec`/`endSec`) do code gắn lại nguyên vẹn. Best-effort: lỗi/parse hỏng
 * giữ nguyên bản gốc cho phần đó, không làm fail cả job phụ đề.
 */
@Injectable()
export class TranscriptTranslateService {
  private readonly logger = new Logger(TranscriptTranslateService.name);
  private readonly provider: 'gemini' | 'ollama';
  private readonly model: string | undefined;
  private static readonly BATCH = 40;

  constructor(
    config: ConfigService,
    private gemini: GeminiService,
  ) {
    // Mặc định Gemini cho chất lượng dịch (độc lập với CHAT_PROVIDER / chương video).
    this.provider =
      config.get<string>('TRANSCRIPT_TRANSLATE_PROVIDER', 'gemini') === 'ollama'
        ? 'ollama'
        : 'gemini';
    this.model =
      config.get<string>('TRANSCRIPT_TRANSLATE_MODEL', '') || undefined;
  }

  /** Dịch danh sách cue, giữ nguyên thứ tự + mốc thời gian. */
  async translateCues(
    cues: TranscriptCue[],
    target: SubtitleLang,
    sourceLang: string,
  ): Promise<TranscriptCue[]> {
    if (cues.length === 0) return [];
    const translated = await this.translateTexts(
      cues.map((c) => c.text ?? ''),
      target,
      sourceLang,
    );
    return cues.map((c, i) => ({ ...c, text: translated[i] ?? c.text }));
  }

  /** Dịch tiêu đề + tóm tắt chương, giữ nguyên mốc thời gian. */
  async translateChapters(
    chapters: TranscriptChapter[],
    target: SubtitleLang,
    sourceLang: string,
  ): Promise<TranscriptChapter[]> {
    if (chapters.length === 0) return [];
    const [titles, summaries] = await Promise.all([
      this.translateTexts(
        chapters.map((c) => c.title ?? ''),
        target,
        sourceLang,
      ),
      this.translateTexts(
        chapters.map((c) => c.summary ?? ''),
        target,
        sourceLang,
      ),
    ]);
    return chapters.map((c, i) => ({
      ...c,
      title: titles[i] ?? c.title,
      summary: summaries[i] ?? c.summary,
    }));
  }

  // ─── Core ────────────────────────────────────────────────────────────────────

  /**
   * Dịch một mảng chuỗi, trả về mảng cùng độ dài (phần tử rỗng giữ rỗng). Khớp
   * theo trường "i" thay vì vị trí để bền với sai lệch số phần tử của LLM; phần
   * nào không dịch được → giữ nguyên bản gốc.
   */
  private async translateTexts(
    texts: string[],
    target: SubtitleLang,
    sourceLang: string,
  ): Promise<string[]> {
    const out = [...texts];
    // Chỉ gửi các mục có nội dung; giữ index gốc để map lại.
    const items = texts
      .map((text, i) => ({ i, text: (text ?? '').trim() }))
      .filter((it) => it.text.length > 0);
    if (items.length === 0) return out;

    const langName = this.languageName(target);
    const systemInstruction =
      'Bạn là công cụ dịch phụ đề video bài giảng. ' +
      'Luôn trả về JSON hợp lệ đúng định dạng yêu cầu, không kèm bất kỳ chữ nào ngoài JSON. ' +
      UNTRUSTED_DATA_RULE;

    for (let start = 0; start < items.length; start += TranscriptTranslateService.BATCH) {
      const batch = items.slice(start, start + TranscriptTranslateService.BATCH);
      const prompt = `Dịch nội dung các đoạn phụ đề sau sang ${langName} (từ ${this.languageName(sourceLang)}).
Văn phong tự nhiên, sát nghĩa; giữ nguyên thuật ngữ chuyên ngành khi hợp lý.

Đầu vào là mảng JSON, mỗi phần tử { "i": number, "text": string }.
Trả về DUY NHẤT một mảng JSON cùng dạng { "i": number, "text": "<bản dịch sang ${langName}>" }:
- GIỮ NGUYÊN trường "i" của từng phần tử (dùng để khớp lại).
- Dịch trường "text" sang ${langName}; nếu vốn đã là ${langName} thì giữ nguyên.
- KHÔNG thêm/bớt phần tử, KHÔNG kèm bất kỳ chữ nào ngoài mảng JSON.

Dữ liệu:
${wrapUntrusted(JSON.stringify(batch), 'phụ đề')}`;

      try {
        const raw = await this.gemini.generate(prompt, {
          provider: this.provider,
          model: this.model,
          temperature: 0.2,
          maxOutputTokens: 4096,
          systemInstruction,
          format: this.provider === 'ollama' ? 'json' : undefined,
        });
        const map = this.parseTranslations(raw);
        for (const { i } of batch) {
          const t = map.get(i);
          if (typeof t === 'string' && t.trim().length > 0) out[i] = t.trim();
        }
      } catch (err) {
        this.logger.warn(
          `Dịch phụ đề sang ${target} thất bại (giữ bản gốc cho lô này): ${(err as Error).message}`,
        );
      }
    }
    return out;
  }

  /** Bóc mảng JSON { i, text } từ output LLM (bỏ rào ```json, chữ thừa). */
  private parseTranslations(raw: string): Map<number, string> {
    const map = new Map<number, string>();
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
      return map;
    }
    if (!Array.isArray(parsed)) return map;
    for (const item of parsed) {
      const o = item as { i?: unknown; text?: unknown };
      const i = Number(o?.i);
      if (Number.isInteger(i) && typeof o?.text === 'string') {
        map.set(i, o.text);
      }
    }
    return map;
  }

  /** Tên ngôn ngữ (tiếng Việt) từ mã ISO để nêu đích danh trong prompt dịch. */
  private languageName(code: string): string {
    const names: Record<string, string> = {
      vi: 'tiếng Việt',
      en: 'tiếng Anh',
      ja: 'tiếng Nhật',
      ko: 'tiếng Hàn',
      zh: 'tiếng Trung',
      fr: 'tiếng Pháp',
      de: 'tiếng Đức',
      es: 'tiếng Tây Ban Nha',
      ru: 'tiếng Nga',
      th: 'tiếng Thái',
    };
    return names[(code ?? '').toLowerCase().split(/[-_]/)[0]] ?? `ngôn ngữ "${code}"`;
  }
}
