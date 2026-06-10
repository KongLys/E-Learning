import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private config: ConfigService) {
    this.bucket = this.config.get<string>('R2_BUCKET', 'elearning');
    this.publicUrl = this.config
      .get<string>('R2_PUBLIC_URL', '')
      .replace(/\/$/, '');
    this.client = new S3Client({
      endpoint: this.sanitizeEndpoint(this.config.get<string>('R2_ENDPOINT')),
      region: this.config.get<string>('R2_REGION', 'auto'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID', ''),
        secretAccessKey: this.config.get<string>('R2_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  async onModuleInit() {
    // R2 buckets are normally created from the dashboard. Verify reachability,
    // try to create if missing, but never crash boot if storage is unavailable.
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket '${this.bucket}' ready`);
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket '${this.bucket}' created`);
      } catch (err) {
        this.logger.warn(
          `Could not verify/create bucket '${this.bucket}': ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Streams the body to R2 using multipart upload (handles large files such as
   * video without buffering the whole object in memory). Accepts a Buffer for
   * small files or a Readable stream (e.g. fs.createReadStream of a temp file).
   */
  async uploadFile(
    key: string,
    body: Buffer | Readable,
    mimetype: string,
  ): Promise<string> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimetype,
      },
    });
    await upload.done();
    return this.getPublicUrl(key);
  }

  /** Buffers a whole object into memory — only use for small files (e.g. PDFs for parsing). */
  async downloadFile(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  /** Presigned GET URL for private objects (video/documents behind access checks). */
  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async deleteFile(key: string): Promise<void> {
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch(() => undefined);
  }

  /**
   * R2's S3 API endpoint must be the bare account host (no path). With
   * forcePathStyle the SDK appends `/<bucket>/<key>` itself, so a stray path
   * segment (e.g. the bucket name) doubles the prefix and breaks public URLs.
   * Strip any path and warn rather than letting it silently corrupt keys.
   */
  private sanitizeEndpoint(endpoint?: string): string | undefined {
    if (!endpoint) return endpoint;
    try {
      const url = new URL(endpoint);
      if (url.pathname && url.pathname !== '/') {
        this.logger.warn(
          `R2_ENDPOINT must not contain a path ('${url.pathname}') — using origin '${url.origin}'. ` +
            `The bucket is added separately via R2_BUCKET.`,
        );
      }
      return url.origin;
    } catch {
      this.logger.warn(`R2_ENDPOINT is not a valid URL: '${endpoint}'`);
      return endpoint;
    }
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  extractKeyFromUrl(url: string): string {
    if (this.publicUrl && url.startsWith(this.publicUrl)) {
      return url.slice(this.publicUrl.length + 1);
    }
    // Tolerate legacy MinIO-style URLs (…/<bucket>/<key>).
    const parts = url.split(`/${this.bucket}/`);
    return parts[1] ?? '';
  }
}
