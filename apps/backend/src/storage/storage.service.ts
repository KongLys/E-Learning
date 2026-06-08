import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private client: Client;
  private bucket: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private config: ConfigService) {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'elearning');
    this.client = new Client({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: this.config.get<number>('MINIO_PORT', 9000),
      useSSL: this.config.get<boolean>('MINIO_USE_SSL', false),
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Bucket '${this.bucket}' created`);
    }
  }

  async uploadFile(key: string, buffer: Buffer, mimetype: string): Promise<string> {
    const stream = Readable.from(buffer);
    await this.client.putObject(this.bucket, key, stream, buffer.length, { 'Content-Type': mimetype });
    return this.getPublicUrl(key);
  }

  async downloadFile(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key).catch(() => undefined);
  }

  getPublicUrl(key: string): string {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = this.config.get<number>('MINIO_PORT', 9000);
    const ssl = this.config.get<boolean>('MINIO_USE_SSL', false);
    const protocol = ssl ? 'https' : 'http';
    return `${protocol}://${endpoint}:${port}/${this.bucket}/${key}`;
  }

  extractKeyFromUrl(url: string): string {
    const parts = url.split(`/${this.bucket}/`);
    return parts[1] ?? '';
  }
}
