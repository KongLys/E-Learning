import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private redis: Redis;

  constructor(private config: ConfigService) {
    super();
    this.redis = new Redis(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const result = await this.redis.ping();
      return this.getStatus(key, result === 'PONG');
    } catch {
      return this.getStatus(key, false);
    }
  }
}
