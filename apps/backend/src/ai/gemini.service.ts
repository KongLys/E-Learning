import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from '@google/generative-ai';

export interface GenerateOpts {
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly client: GoogleGenerativeAI;
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
    this.client = new GoogleGenerativeAI(apiKey);
    this.chatModelName = config.get<string>(
      'GEMINI_CHAT_MODEL',
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
    if (this.chatProvider === 'ollama') return this.generateOllama(prompt, opts);
    const model = this.getChatModel(opts);
    const res = await model.generateContent(prompt);
    return res.response.text();
  }

  async *generateStream(
    prompt: string,
    opts: GenerateOpts = {},
  ): AsyncGenerator<string> {
    if (this.chatProvider === 'ollama') {
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
      model: this.chatModelName,
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
      model: this.ollamaChatModel,
      prompt,
      stream,
      ...(opts.systemInstruction ? { system: opts.systemInstruction } : {}),
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
