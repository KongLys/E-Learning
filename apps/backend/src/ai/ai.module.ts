import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { StorageModule } from '../storage/storage.module';
import { GeminiService } from './gemini.service';
import { GoogleTtsService } from './google-tts.service';
import { CohereService } from './cohere.service';
import { LlamaParseService } from './chunking/llama-parse.service';
import { MarkdownChunkerService } from './chunking/markdown-chunker.service';
import { VectorStoreService } from './vector/vector-store.service';
import { RagService } from './rag/rag.service';
import { GuardrailService } from './guard/guardrail.service';
import { AiChatService } from './ai-chat.service';
import { AiChatController } from './ai-chat.controller';
import { QuizGenerationService } from './quiz-generation.service';
import { AiQuizService } from './ai-quiz.service';
import { AiQuizController } from './ai-quiz.controller';
import {
  LessonIndexProcessor,
  LESSON_INDEX_QUEUE,
} from './processors/lesson-index.processor';
import {
  VideoTranscribeProcessor,
  VIDEO_TRANSCRIBE_QUEUE,
} from './processors/video-transcribe.processor';
import { MindmapService } from './mindmap/mindmap.service';
import { MindmapController } from './mindmap/mindmap.controller';
import { MindmapProcessor } from './mindmap/mindmap.processor';
import { MINDMAP_QUEUE } from './mindmap/mindmap.queue';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    StorageModule,
    ModerationModule,
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
            db:
              parsed.pathname && parsed.pathname !== '/'
                ? Number(parsed.pathname.slice(1))
                : 0,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: MINDMAP_QUEUE }),
    BullModule.registerQueue({ name: LESSON_INDEX_QUEUE }),
    BullModule.registerQueue({ name: VIDEO_TRANSCRIBE_QUEUE }),
  ],
  controllers: [AiChatController, MindmapController, AiQuizController],
  providers: [
    GeminiService,
    GoogleTtsService,
    CohereService,
    LlamaParseService,
    MarkdownChunkerService,
    VectorStoreService,
    RagService,
    GuardrailService,
    AiChatService,
    QuizGenerationService,
    AiQuizService,
    LessonIndexProcessor,
    VideoTranscribeProcessor,
    MindmapService,
    MindmapProcessor,
  ],
  exports: [
    BullModule,
    VectorStoreService,
    GeminiService,
    GoogleTtsService,
    MarkdownChunkerService,
    LlamaParseService,
    QuizGenerationService,
  ],
})
export class AiModule {}
