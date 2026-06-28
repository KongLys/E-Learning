import { NestFactory } from '@nestjs/core';
import { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GeminiService } from '../src/ai/providers/gemini.service';
import { CohereService } from '../src/ai/providers/cohere.service';
import { VectorStoreService } from '../src/ai/vector/vector-store.service';
import { GraphRetrieverService } from '../src/ai/lightrag/graph-retriever.service';
import { RaptorService } from '../src/ai/raptor/raptor.service';

export interface BenchDeps {
  app: INestApplicationContext;
  prisma: PrismaService;
  gemini: GeminiService;
  cohere: CohereService;
  vector: VectorStoreService;
  graph: GraphRetrieverService;
  raptor: RaptorService;
}

/**
 * Khởi tạo Nest application context (không mở HTTP) để tái dùng toàn bộ DI tree
 * của backend trong script benchmark. `strict: false` cho phép lấy provider nằm
 * sâu trong AiModule mà không cần export.
 */
export async function bootstrap(): Promise<BenchDeps> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const get = <T>(type: new (...args: any[]) => T): T =>
    app.get(type, { strict: false });
  return {
    app,
    prisma: get(PrismaService),
    gemini: get(GeminiService),
    cohere: get(CohereService),
    vector: get(VectorStoreService),
    graph: get(GraphRetrieverService),
    raptor: get(RaptorService),
  };
}
