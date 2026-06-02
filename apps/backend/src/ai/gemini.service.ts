import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY', '');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set — AI features will fail at runtime');
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.chatModelName = config.get<string>('GEMINI_CHAT_MODEL', 'gemini-1.5-flash');
    this.embedModelName = config.get<string>('GEMINI_EMBED_MODEL', 'text-embedding-004');
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const model = this.client.getGenerativeModel({ model: this.embedModelName });
    const BATCH = 100;
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      try {
        const res = await model.batchEmbedContents({
          requests: slice.map((text) => ({
            content: { role: 'user', parts: [{ text }] },
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

  async generate(prompt: string, opts: GenerateOpts = {}): Promise<string> {
    const model = this.getChatModel(opts);
    const res = await model.generateContent(prompt);
    return res.response.text();
  }

  async *generateStream(prompt: string, opts: GenerateOpts = {}): AsyncGenerator<string> {
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
}
