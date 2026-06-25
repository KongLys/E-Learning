import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerativeModel,
} from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';

export interface GenerateOpts {
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  // Ghi đè provider/model cho từng lời gọi (vd quiz ôn tập mặc định Ollama,
  // độc lập với CHAT_PROVIDER dùng cho RAG/chat). Bỏ trống = dùng cấu hình mặc định.
  provider?: 'gemini' | 'ollama';
  model?: string;
  // Ép Ollama trả JSON hợp lệ: 'json' (chỉ ràng buộc cú pháp) hoặc 1 JSON schema
  // (structured outputs). Chỉ áp dụng cho provider 'ollama'.
  format?: 'json' | Record<string, unknown>;
}

export interface TranscriptCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface TranscriptChapter {
  startSec: number;
  endSec: number;
  title: string;
  summary: string;
}

export interface MediaTranscript {
  language: string;
  durationSec: number;
  cues: TranscriptCue[];
  chapters: TranscriptChapter[];
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly client: GoogleGenerativeAI;
  private readonly apiKey: string;
  private readonly transcribeModelName: string;
  private readonly chatModelName: string;
  private readonly embedModelName: string;
  private readonly embedDimensions: number;
  private readonly embedProvider: 'gemini' | 'ollama';
  private readonly chatProvider: 'gemini' | 'ollama';
  private readonly ollamaBaseUrl: string;
  private readonly ollamaEmbedModel: string;
  private readonly ollamaChatModel: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY', '');
    this.chatProvider =
      config.get<string>('CHAT_PROVIDER', 'gemini') === 'ollama'
        ? 'ollama'
        : 'gemini';
    this.embedProvider =
      config.get<string>('EMBED_PROVIDER', 'gemini') === 'ollama'
        ? 'ollama'
        : 'gemini';
    if (!apiKey && (this.chatProvider === 'gemini' || this.embedProvider === 'gemini')) {
      this.logger.warn(
        'GEMINI_API_KEY is not set — Gemini-backed AI features will fail at runtime',
      );
    }
    this.apiKey = apiKey;
    this.client = new GoogleGenerativeAI(apiKey);
    this.chatModelName = config.get<string>(
      'GEMINI_CHAT_MODEL',
      'gemini-1.5-flash',
    );
    this.transcribeModelName = config.get<string>(
      'GEMINI_TRANSCRIBE_MODEL',
      'gemini-1.5-flash',
    );
    this.embedModelName = config.get<string>(
      'GEMINI_EMBED_MODEL',
      'gemini-embedding-001',
    );
    this.embedDimensions = config.get<number>('GEMINI_EMBED_DIMENSIONS', 768);
    this.ollamaBaseUrl = config.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11434',
    );
    this.ollamaEmbedModel = config.get<string>(
      'OLLAMA_EMBED_MODEL',
      'nomic-embed-text',
    );
    this.ollamaChatModel = config.get<string>(
      'OLLAMA_CHAT_MODEL',
      'qwen2.5:7b',
    );
  }

  /**
   * Dùng Gemini File API để phụ đề hoá + phân tích nội dung một file media.
   * Upload file lên Gemini, chờ ACTIVE, rồi yêu cầu model trả JSON gồm:
   *  - cues: phụ đề có timestamp (giữ nguyên ngôn ngữ gốc, tự nhận diện)
   *  - chapters: phân đoạn nội dung theo khung thời gian (tiêu đề + tóm tắt)
   * Luôn xoá file đã upload trên Gemini sau khi xong (best-effort).
   */
  async transcribeMedia(
    filePath: string,
    mimeType: string,
  ): Promise<MediaTranscript> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY chưa cấu hình — không thể tạo phụ đề',
      );
    }

    const fileManager = new GoogleAIFileManager(this.apiKey);
    const uploaded = await fileManager.uploadFile(filePath, { mimeType });

    // File lớn cần thời gian xử lý phía Gemini — poll tới khi ACTIVE.
    let file = await fileManager.getFile(uploaded.file.name);
    const deadline = Date.now() + 10 * 60 * 1000;
    while (file.state === FileState.PROCESSING) {
      if (Date.now() > deadline) {
        await fileManager.deleteFile(file.name).catch(() => undefined);
        throw new Error('Gemini file processing timed out');
      }
      await new Promise((r) => setTimeout(r, 5000));
      file = await fileManager.getFile(uploaded.file.name);
    }
    if (file.state === FileState.FAILED) {
      await fileManager.deleteFile(file.name).catch(() => undefined);
      throw new Error('Gemini failed to process the uploaded media');
    }

    try {
      const model = this.client.getGenerativeModel({
        model: this.transcribeModelName,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              language: { type: SchemaType.STRING },
              durationSec: { type: SchemaType.NUMBER },
              cues: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    startSec: { type: SchemaType.NUMBER },
                    endSec: { type: SchemaType.NUMBER },
                    text: { type: SchemaType.STRING },
                  },
                  required: ['startSec', 'endSec', 'text'],
                },
              },
              chapters: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    startSec: { type: SchemaType.NUMBER },
                    endSec: { type: SchemaType.NUMBER },
                    title: { type: SchemaType.STRING },
                    summary: { type: SchemaType.STRING },
                  },
                  required: ['startSec', 'endSec', 'title', 'summary'],
                },
              },
            },
            required: ['language', 'durationSec', 'cues', 'chapters'],
          },
        },
      });

      const prompt = [
        'Bạn là công cụ tạo phụ đề và phân tích nội dung cho video bài giảng.',
        'Hãy nghe toàn bộ media và trả về JSON đúng schema:',
        '- "language": mã ngôn ngữ của lời nói (vd "vi", "en"). Tự nhận diện.',
        '- "durationSec": tổng thời lượng media tính bằng giây.',
        '- "cues": phụ đề chia thành các câu/đoạn ngắn 3–8 giây, mỗi cue có startSec, endSec (giây, có thể lẻ) và text. GIỮ NGUYÊN ngôn ngữ gốc, không dịch. Sắp xếp theo thời gian, không chồng lấn.',
        '- "chapters": chia video thành các đoạn nội dung lớn theo chủ đề (mỗi đoạn vài phút). Mỗi chapter có startSec, endSec, title (ngắn gọn) và summary (1–2 câu tóm tắt nội dung đoạn đó), bằng ngôn ngữ gốc.',
        'Chỉ trả JSON, không thêm chữ nào khác.',
      ].join('\n');

      const res = await model.generateContent([
        { fileData: { fileUri: file.uri, mimeType: file.mimeType } },
        { text: prompt },
      ]);

      const raw = res.response.text();
      const parsed = JSON.parse(raw) as Partial<MediaTranscript>;
      return this.normalizeTranscript(parsed);
    } finally {
      await fileManager.deleteFile(file.name).catch(() => undefined);
    }
  }

  /** Làm sạch dữ liệu Gemini trả về: ép kiểu số, bỏ cue/chapter thiếu nội dung, sắp theo thời gian. */
  private normalizeTranscript(p: Partial<MediaTranscript>): MediaTranscript {
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const cues = (p.cues ?? [])
      .map((c) => ({
        startSec: num(c?.startSec),
        endSec: num(c?.endSec),
        text: String(c?.text ?? '').trim(),
      }))
      .filter((c) => c.text.length > 0 && c.endSec > c.startSec)
      .sort((a, b) => a.startSec - b.startSec);
    const chapters = (p.chapters ?? [])
      .map((c) => ({
        startSec: num(c?.startSec),
        endSec: num(c?.endSec),
        title: String(c?.title ?? '').trim(),
        summary: String(c?.summary ?? '').trim(),
      }))
      .filter((c) => c.title.length > 0)
      .sort((a, b) => a.startSec - b.startSec);
    const durationSec = num(p.durationSec) || cues.at(-1)?.endSec || 0;
    return {
      language: String(p.language ?? '').trim() || 'unknown',
      durationSec: Math.round(durationSec),
      cues,
      chapters,
    };
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.embedProvider === 'ollama') return this.embedBatchOllama(texts);

    const model = this.client.getGenerativeModel({
      model: this.embedModelName,
    });
    const BATCH = 100;
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      try {
        const res = await model.batchEmbedContents({
          requests: slice.map((text) => ({
            content: { role: 'user', parts: [{ text }] },
            outputDimensionality: this.embedDimensions,
          })),
        });
        for (const e of res.embeddings) {
          results.push(e.values);
        }
      } catch (err) {
        this.logger.error(`Embedding batch failed: ${(err as Error).message}`);
        throw new ServiceUnavailableException('Embedding service unavailable');
      }
    }
    return results;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    return vec;
  }

  private async embedBatchOllama(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    const BATCH = 64;
    for (let i = 0; i < texts.length; i += BATCH) {
      const input = texts.slice(i, i + BATCH);
      try {
        const res = await fetch(`${this.ollamaBaseUrl}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.ollamaEmbedModel, input }),
        });
        if (!res.ok) {
          throw new Error(
            `Ollama responded ${res.status}: ${await res.text()}`,
          );
        }
        const data = (await res.json()) as { embeddings?: number[][] };
        if (!data.embeddings || data.embeddings.length !== input.length) {
          throw new Error('Ollama returned no/incomplete embeddings');
        }
        results.push(...data.embeddings);
      } catch (err) {
        this.logger.error(
          `Ollama embedding batch failed: ${(err as Error).message}`,
        );
        throw new ServiceUnavailableException('Embedding service unavailable');
      }
    }
    return results;
  }

  async generate(prompt: string, opts: GenerateOpts = {}): Promise<string> {
    if ((opts.provider ?? this.chatProvider) === 'ollama')
      return this.generateOllama(prompt, opts);
    const model = this.getChatModel(opts);
    const res = await model.generateContent(prompt);
    return res.response.text();
  }

  async *generateStream(
    prompt: string,
    opts: GenerateOpts = {},
  ): AsyncGenerator<string> {
    if ((opts.provider ?? this.chatProvider) === 'ollama') {
      yield* this.generateStreamOllama(prompt, opts);
      return;
    }
    const model = this.getChatModel(opts);
    const result = await model.generateContentStream(prompt);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }

  private getChatModel(opts: GenerateOpts): GenerativeModel {
    return this.client.getGenerativeModel({
      model: opts.model || this.chatModelName,
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
      },
      systemInstruction: opts.systemInstruction,
    });
  }

  // ─── Ollama chat (local, no quota) ───────────────────────────────────────────

  private ollamaBody(prompt: string, opts: GenerateOpts, stream: boolean) {
    return {
      model: opts.model || this.ollamaChatModel,
      prompt,
      stream,
      ...(opts.systemInstruction ? { system: opts.systemInstruction } : {}),
      ...(opts.format ? { format: opts.format } : {}),
      options: {
        temperature: opts.temperature ?? 0.3,
        num_predict: opts.maxOutputTokens ?? 2048,
      },
    };
  }

  private async generateOllama(
    prompt: string,
    opts: GenerateOpts,
  ): Promise<string> {
    try {
      const res = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.ollamaBody(prompt, opts, false)),
      });
      if (!res.ok) {
        throw new Error(`Ollama responded ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { response?: string };
      return data.response ?? '';
    } catch (err) {
      this.logger.error(`Ollama generate failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Chat model service unavailable');
    }
  }

  private async *generateStreamOllama(
    prompt: string,
    opts: GenerateOpts,
  ): AsyncGenerator<string> {
    let res: Response;
    try {
      res = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.ollamaBody(prompt, opts, true)),
      });
    } catch (err) {
      this.logger.error(
        `Ollama stream connect failed: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Chat model service unavailable');
    }
    if (!res.ok || !res.body) {
      throw new ServiceUnavailableException('Chat model service unavailable');
    }

    // Ollama streams NDJSON: one JSON object per line, each with a `response` delta.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line) as { response?: string; done?: boolean };
          if (obj.response) yield obj.response;
        } catch {
          // partial/non-JSON keep-alive line — ignore
        }
      }
    }
  }
}
