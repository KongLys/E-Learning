import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Supabase's pooler occasionally drops/restarts for a few seconds, which
    // makes a single $connect() fail with P1001 and crash the whole boot.
    // Retry with backoff so a transient blip doesn't take the app down.
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        const delayMs = Math.min(1000 * 2 ** (attempt - 1), 10_000);
        this.logger.warn(
          `Database connection failed (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
