import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CohereClient } from 'cohere-ai';

export interface RerankResult {
  index: number;
  relevanceScore: number;
}

@Injectable()
export class CohereService {
  private readonly logger = new Logger(CohereService.name);
  private readonly client: CohereClient;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('COHERE_API_KEY', '');
    if (!apiKey) {
      this.logger.warn('COHERE_API_KEY is not set — rerank will fallback to identity order');
    }
    this.client = new CohereClient({ token: apiKey });
    this.model = config.get<string>('COHERE_RERANK_MODEL', 'rerank-multilingual-v3.0');
  }

  async rerank(query: string, documents: string[], topN: number): Promise<RerankResult[]> {
    if (documents.length === 0) return [];
    try {
      const res = await this.client.rerank({
        model: this.model,
        query,
        documents,
        topN: Math.min(topN, documents.length),
      });
      return res.results.map((r) => ({
        index: r.index,
        relevanceScore: r.relevanceScore,
      }));
    } catch (err) {
      this.logger.error(`Cohere rerank failed: ${(err as Error).message} — falling back to original order`);
      return documents.slice(0, topN).map((_, i) => ({ index: i, relevanceScore: 0 }));
    }
  }
}
