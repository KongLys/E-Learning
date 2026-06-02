import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { StorageModule } from '../storage/storage.module';
import { GeminiService } from './gemini.service';
import { CohereService } from './cohere.service';
import { LlamaParseService } from './chunking/llama-parse.service';
import { MarkdownChunkerService } from './chunking/markdown-chunker.service';
import { VectorStoreService } from './vector/vector-store.service';
import { RagService } from './rag/rag.service';
import { AiChatService } from './ai-chat.service';
import { AiChatController } from './ai-chat.controller';
import { MaterialProcessor, MATERIAL_QUEUE } from './processors/material.processor';

@Module({
  imports: [
    StorageModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        const parsed = new URL(url);
        return {
          connection: {
            host: parsed.hostname,
            port: Number(parsed.port || 6379),
            password: parsed.password || undefined,
            db: parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.slice(1)) : 0,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: MATERIAL_QUEUE }),
  ],
  controllers: [AiChatController],
  providers: [
    GeminiService,
    CohereService,
    LlamaParseService,
    MarkdownChunkerService,
    VectorStoreService,
    RagService,
    AiChatService,
    MaterialProcessor,
  ],
  exports: [
    BullModule,
    VectorStoreService,
    GeminiService,
    MarkdownChunkerService,
    LlamaParseService,
  ],
})
export class AiModule {}
