import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as Joi from 'joi';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { ChatModule } from './chat/chat.module';
import { UserModule } from './user/user.module';
import { CourseModule } from './course/course.module';
import { SectionModule } from './section/section.module';
import { LessonModule } from './lesson/lesson.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { ProgressModule } from './progress/progress.module';
import { QuizAttemptModule } from './quiz-attempt/quiz-attempt.module';
import { ReviewQuizModule } from './review-quiz/review-quiz.module';
import { PodcastModule } from './podcast/podcast.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { NoteModule } from './note/note.module';
import { QuickQuestionModule } from './quick-question/quick-question.module';
import { AdminModule } from './admin/admin.module';
import { CommunityModule } from './community/community.module';
import { ReviewModule } from './review/review.module';
import { NotificationModule } from './notification/notification.module';
import { InstructorStatsModule } from './instructor-stats/instructor-stats.module';
import { AiModule } from './ai/ai.module';
import { ModerationModule } from './moderation/moderation.module';
import { CouponModule } from './coupon/coupon.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        PORT: Joi.number().default(3001),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        JWT_SECRET: Joi.string().default('change-me-in-production'),
        JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
        JWT_REFRESH_EXPIRES: Joi.string().default('7d'),
        R2_ENDPOINT: Joi.string().required(),
        R2_REGION: Joi.string().default('auto'),
        R2_ACCESS_KEY_ID: Joi.string().required(),
        R2_SECRET_ACCESS_KEY: Joi.string().required(),
        R2_BUCKET: Joi.string().default('elearning'),
        R2_PUBLIC_URL: Joi.string().required(),
        SEPAY_ACCOUNT_NUMBER: Joi.string().allow('').default(''),
        SEPAY_BANK_CODE: Joi.string().allow('').default(''),
        SEPAY_ACCOUNT_NAME: Joi.string().allow('').default(''),
        SEPAY_API_KEY: Joi.string().allow('').default(''),
        SEPAY_QR_URL: Joi.string().default('https://qr.sepay.vn/img'),
        GEMINI_API_KEY: Joi.string().allow('').default(''),
        GEMINI_CHAT_MODEL: Joi.string().default('gemini-1.5-flash'),
        GEMINI_TRANSCRIBE_MODEL: Joi.string().default('gemini-1.5-flash'),
        GEMINI_EMBED_MODEL: Joi.string().default('text-embedding-004'),
        GOOGLE_TTS_API_KEY: Joi.string().allow('').default(''),
        GOOGLE_TTS_VOICE: Joi.string().default('vi-VN-Wavenet-A'),
        GOOGLE_TTS_LANGUAGE: Joi.string().default('vi-VN'),
        COHERE_API_KEY: Joi.string().allow('').default(''),
        COHERE_RERANK_MODEL: Joi.string().default('rerank-multilingual-v3.0'),
        LLAMA_CLOUD_API_KEY: Joi.string().allow('').default(''),
        LLAMA_PARSE_BASE_URL: Joi.string().default(
          'https://api.cloud.llamaindex.ai',
        ),
        LLAMA_PARSE_LANGUAGE: Joi.string().default('vi'),
        LLAMA_PARSE_RESULT_TYPE: Joi.string().default('markdown'),
        LLAMA_PARSE_POLL_INTERVAL_MS: Joi.number().default(5000),
        LLAMA_PARSE_POLL_TIMEOUT_MS: Joi.number().default(300000),
        RAG_CHUNK_SIZE: Joi.number().default(1000),
        RAG_CHUNK_OVERLAP: Joi.number().default(200),
        RAG_RETRIEVE_TOP: Joi.number().default(50),
        RAG_RERANK_TOP: Joi.number().default(5),
        MODERATION_ENABLED: Joi.string().valid('true', 'false').default('true'),
        MODERATION_SERVICE_URL: Joi.string().default('http://localhost:8000'),
        MODERATION_API_KEY: Joi.string().allow('').default(''),
        MODERATION_TIMEOUT_MS: Joi.number().default(15000),
        MODERATION_FAIL_OPEN: Joi.string()
          .valid('true', 'false')
          .default('true'),
        MODERATION_DEBUG: Joi.string().valid('true', 'false').default('false'),
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 80 }]),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    StorageModule,
    UserModule,
    CourseModule,
    SectionModule,
    LessonModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    EnrollmentModule,
    ProgressModule,
    QuizAttemptModule,
    ReviewQuizModule,
    PodcastModule,
    OrderModule,
    PaymentModule,
    NoteModule,
    QuickQuestionModule,
    AdminModule,
    CommunityModule,
    ReviewModule,
    NotificationModule,
    InstructorStatsModule,
    ChatModule,
    AiModule,
    ModerationModule,
    CouponModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
