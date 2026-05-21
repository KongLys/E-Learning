import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
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
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { NoteModule } from './note/note.module';
import { QuickQuestionModule } from './quick-question/quick-question.module';
import { AdminModule } from './admin/admin.module';
import { CommunityModule } from './community/community.module';
import { NotificationModule } from './notification/notification.module';
import { InstructorStatsModule } from './instructor-stats/instructor-stats.module';
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
        MINIO_ENDPOINT: Joi.string().default('localhost'),
        MINIO_PORT: Joi.number().default(9000),
        MINIO_USE_SSL: Joi.boolean().default(false),
        MINIO_ACCESS_KEY: Joi.string().default('minioadmin'),
        MINIO_SECRET_KEY: Joi.string().default('minioadmin'),
        MINIO_BUCKET: Joi.string().default('elearning'),
        VNPAY_TMN_CODE: Joi.string().default('TESTCODE'),
        VNPAY_HASH_SECRET: Joi.string().default('testhashsecret'),
        VNPAY_URL: Joi.string().default('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
        VNPAY_API_URL: Joi.string().default('https://sandbox.vnpayment.vn/merchant_webapi/api/transaction'),
        MONGODB_URI: Joi.string().default('mongodb://localhost:27017/elearning'),
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
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
    EnrollmentModule,
    ProgressModule,
    QuizAttemptModule,
    OrderModule,
    PaymentModule,
    NoteModule,
    QuickQuestionModule,
    AdminModule,
    CommunityModule,
    NotificationModule,
    InstructorStatsModule,
    ChatModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
