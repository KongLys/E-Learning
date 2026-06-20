import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GeminiService,
  MediaTranscript,
  TranscriptChapter,
  TranscriptCue,
} from './gemini.service';
import { wrapUntrusted, UNTRUSTED_DATA_RULE } from './prompt-safety.util';

interface AaiWord {
  text: string;
  start: number; // ms
  end: number; // ms
}

interface AaiTranscript {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  language_code?: string;
  audio_duration?: number; // seconds
  words?: AaiWord[];
  error?: string;
}

/**
 * Tạo phụ đề + phân chương cho video bài giảng bằng AssemblyAI (thay Gemini File API).
 *  - AssemblyAI lo phần nhận dạng giọng nói: trả về `words` có timestamp (ms) +
 *    tự nhận diện ngôn ngữ (hỗ trợ tiếng Việt). Ta nhóm words thành cue 3–8 giây.
 *  - "Chapters" (auto_chapters) của AssemblyAI là tính năng thiên về tiếng Anh,
 *    không đảm bảo cho tiếng Việt → ta tự sinh chương từ phụ đề bằng LLM cục bộ
 *    (Ollama, miễn phí, không phụ thuộc ngôn ngữ).
 *
 * Nhận thẳng URL (presigned) của file media — AssemblyAI tự tải về, nên không cần
 * download/upload thủ công.
 */
@Injectable()
export class AssemblyAiService {
  private readonly logger = new Logger(AssemblyAiService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly speechModels: string[];
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly chapterProvider: 'gemini' | 'ollama';
  private readonly chapterModel: string | undefined;

  constructor(
    config: ConfigService,
    private gemini: GeminiService,
  ) {
    this.apiKey = config.get<string>('ASSEMBLYAI_API_KEY', '');
    this.baseUrl = config
      .get<string>('ASSEMBLYAI_BASE_URL', 'https://api.assemblyai.com')
      .replace(/\/$/, '');
    // Danh sách model (ưu tiên đầu, fallback dần) — AssemblyAI bỏ `speech_model` số ít.
    this.speechModels = config
      .get<string>('ASSEMBLYAI_SPEECH_MODELS', 'universal-2')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    this.pollIntervalMs = Number(
      config.get<string>('ASSEMBLYAI_POLL_INTERVAL_MS', '5000'),
    );
    this.pollTimeoutMs = Number(
      config.get<string>('ASSEMBLYAI_POLL_TIMEOUT_MS', '600000'),
    );
    // Chương được sinh bằng LLM riêng (mặc định Ollama cục bộ, không tốn quota).
    this.chapterProvider =
      config.get<string>('VIDEO_CHAPTER_PROVIDER', 'ollama') === 'gemini'
        ? 'gemini'
        : 'ollama';
    this.chapterModel =
      config.get<string>('VIDEO_CHAPTER_MODEL', '') || undefined;
    if (!this.apiKey) {
      this.logger.warn(
        'ASSEMBLYAI_API_KEY chưa cấu hình — tính năng phụ đề video sẽ lỗi khi chạy',
      );
    }
  }

  /**
   * Phụ đề hoá + phân chương một file media từ URL công khai/presigned.
   * Trả về MediaTranscript (language, durationSec, cues, chapters).
   */
  async transcribeMedia(mediaUrl: string): Promise<MediaTranscript> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'ASSEMBLYAI_API_KEY chưa cấu hình — không thể tạo phụ đề',
      );
    }

    const created = await this.request<AaiTranscript>(
      'POST',
      '/v2/transcript',
      {
        audio_url: mediaUrl,
        speech_models: this.speechModels,
        language_detection: true,
        punctuate: true,
        format_text: true,
      },
    );
    const done = await this.poll(created.id);

    const cues = this.buildCues(done.words ?? []);
    const language = (done.language_code ?? '').trim() || 'unknown';
    const durationSec = Math.round(
      done.audio_duration ?? cues.at(-1)?.endSec ?? 0,
    );
    const chapters = await this.buildChapters(cues, language);

    return { language, durationSec, cues, chapters };
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: this.apiKey,
          'content-type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new Error(
        `AssemblyAI ${method} ${path} không kết nối được: ${(err as Error).message}`,
      );
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `AssemblyAI ${method} ${path} → ${res.status}: ${txt.slice(0, 300)}`,
      );
    }
    return (await res.json()) as T;
  }

  /** Poll trạng thái transcript tới khi 'completed' (hoặc lỗi/timeout). */
  private async poll(id: string): Promise<AaiTranscript> {
    const deadline = Date.now() + this.pollTimeoutMs;
    for (;;) {
      const t = await this.request<AaiTranscript>(
        'GET',
        `/v2/transcript/${id}`,
      );
      if (t.status === 'completed') return t;
      if (t.status === 'error') {
        throw new Error(
          `AssemblyAI transcription error: ${t.error ?? 'unknown'}`,
        );
      }
      if (Date.now() > deadline) {
        throw new Error('AssemblyAI transcription timed out');
      }
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
  }

  // ─── Build cues / chapters ───────────────────────────────────────────────────

  /**
   * Nhóm các từ (có timestamp ms) thành cue 3–8 giây, ngắt ở dấu kết câu khi đủ dài.
   * Giữ nguyên ngôn ngữ gốc, sắp theo thời gian.
   */
  private buildCues(words: AaiWord[]): TranscriptCue[] {
    const MIN_SEC = 3;
    const MAX_SEC = 7;
    const cues: TranscriptCue[] = [];
    let cur: AaiWord[] = [];
    let startMs = 0;

    const flush = () => {
      if (cur.length === 0) return;
      const text = cur
        .map((w) => w.text)
        .join(' ')
        .replace(/\s+([,.!?…;:])/g, '$1')
        .trim();
      const startSec = cur[0].start / 1000;
      const endSec = cur[cur.length - 1].end / 1000;
      if (text.length > 0 && endSec > startSec) {
        cues.push({ startSec, endSec, text });
      }
      cur = [];
    };

    for (const w of words) {
      if (!w || typeof w.text !== 'string') continue;
      if (cur.length === 0) startMs = w.start;
      cur.push(w);
      const spanSec = (w.end - startMs) / 1000;
      const endsSentence = /[.!?…]$/.test(w.text);
      if ((endsSentence && spanSec >= MIN_SEC) || spanSec >= MAX_SEC) {
        flush();
      }
    }
    flush();
    return cues.sort((a, b) => a.startSec - b.startSec);
  }

  /**
   * Sinh chương nội dung từ phụ đề (có mốc thời gian) bằng LLM.
   * Best-effort: lỗi/parse hỏng → trả mảng rỗng, không làm fail cả job phụ đề.
   */
  private async buildChapters(
    cues: TranscriptCue[],
    language: string,
  ): Promise<TranscriptChapter[]> {
    if (cues.length === 0) return [];
    const totalSec = Math.round(cues.at(-1)!.endSec);
    const lines = cues
      .map((c) => `[${Math.round(c.startSec)}s] ${c.text}`)
      .join('\n');
    const source = lines.length > 12000 ? lines.slice(0, 12000) : lines;
    const langName = this.languageName(language);

    const systemInstruction =
      'Bạn là công cụ phân tích nội dung video bài giảng. ' +
      'Luôn trả về JSON hợp lệ đúng định dạng yêu cầu, không kèm bất kỳ chữ nào ngoài JSON. ' +
      UNTRUSTED_DATA_RULE;

    const prompt = `Dưới đây là phụ đề của một video bài giảng, mỗi dòng có mốc thời gian (giây) ở đầu.
Hãy chia video thành các CHƯƠNG nội dung lớn theo chủ đề (mỗi chương vài phút).

Trả về DUY NHẤT một mảng JSON, mỗi phần tử có dạng:
{ "startSec": number, "endSec": number, "title": "tiêu đề ngắn", "summary": "tóm tắt 1-2 câu" }

Yêu cầu:
- startSec/endSec tính bằng giây, liên tục phủ từ 0 đến khoảng ${totalSec}, các chương không chồng lấn và theo thứ tự thời gian.
- BẮT BUỘC viết "title" và "summary" HOÀN TOÀN bằng ${langName} (mã ngôn ngữ "${language}") — giống y ngôn ngữ của phụ đề bên dưới. TUYỆT ĐỐI KHÔNG dịch sang ngôn ngữ khác.
- Số chương hợp lý theo độ dài (thường 3–8 chương cho video vài phút–vài chục phút).

Phụ đề:
${wrapUntrusted(source, 'phụ đề')}`;

    try {
      const raw = await this.gemini.generate(prompt, {
        provider: this.chapterProvider,
        model: this.chapterModel,
        temperature: 0.3,
        maxOutputTokens: 2048,
        systemInstruction,
      });
      return this.parseChapters(raw, totalSec);
    } catch (err) {
      this.logger.warn(
        `Phân chương video thất bại (bỏ qua, vẫn giữ phụ đề): ${(err as Error).message}`,
      );
      return [];
    }
  }

  /** Tên ngôn ngữ (tiếng Việt) từ mã ISO để nêu đích danh trong prompt phân chương. */
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
    return names[code.toLowerCase().split(/[-_]/)[0]] ?? `ngôn ngữ "${code}"`;
  }

  /** Bóc JSON mảng chương từ output LLM (bỏ rào ```json, chữ thừa) và làm sạch. */
  private parseChapters(raw: string, totalSec: number): TranscriptChapter[] {
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

    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    return parsed
      .map((item) => {
        const c = item as Partial<TranscriptChapter>;
        return {
          startSec: num(c?.startSec),
          endSec: num(c?.endSec) || totalSec,
          title: String(c?.title ?? '').trim(),
          summary: String(c?.summary ?? '').trim(),
        };
      })
      .filter((c) => c.title.length > 0 && c.endSec > c.startSec)
      .sort((a, b) => a.startSec - b.startSec);
  }
}
