import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface LlamaParseJobStatus {
  id: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR' | 'CANCELED';
}

@Injectable()
export class LlamaParseService {
  private readonly logger = new Logger(LlamaParseService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly language: string;
  private readonly resultType: string;
  private readonly pollInterval: number;
  private readonly pollTimeout: number;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('LLAMA_CLOUD_API_KEY', '');
    this.baseUrl = config.get<string>('LLAMA_PARSE_BASE_URL', 'https://api.cloud.llamaindex.ai');
    this.language = config.get<string>('LLAMA_PARSE_LANGUAGE', 'vi');
    this.resultType = config.get<string>('LLAMA_PARSE_RESULT_TYPE', 'markdown');
    this.pollInterval = config.get<number>('LLAMA_PARSE_POLL_INTERVAL_MS', 5000);
    this.pollTimeout = config.get<number>('LLAMA_PARSE_POLL_TIMEOUT_MS', 300000);
    if (!this.apiKey) {
      this.logger.warn('LLAMA_CLOUD_API_KEY is not set — material parsing will fail at runtime');
    }
  }

  async submitJob(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(fileBuffer)], { type: mimeType }),
      fileName,
    );
    form.append('language', this.language);
    form.append('result_type', this.resultType);

    const res = await fetch(`${this.baseUrl}/api/parsing/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new ServiceUnavailableException(`LlamaParse upload failed (${res.status}): ${errBody.slice(0, 200)}`);
    }
    const json = (await res.json()) as { id: string };
    return json.id;
  }

  async pollUntilDone(jobId: string): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < this.pollTimeout) {
      const status = await this.getStatus(jobId);
      if (status.status === 'SUCCESS') return;
      if (status.status === 'ERROR' || status.status === 'CANCELED') {
        throw new ServiceUnavailableException(`LlamaParse job ${jobId} ended with status ${status.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
    throw new ServiceUnavailableException(`LlamaParse job ${jobId} timed out after ${this.pollTimeout}ms`);
  }

  async getStatus(jobId: string): Promise<LlamaParseJobStatus> {
    const res = await fetch(`${this.baseUrl}/api/parsing/job/${jobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`LlamaParse status check failed (${res.status})`);
    }
    return (await res.json()) as LlamaParseJobStatus;
  }

  async getMarkdown(jobId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/parsing/job/${jobId}/result/markdown`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`LlamaParse markdown fetch failed (${res.status})`);
    }
    const json = (await res.json()) as { markdown: string };
    return json.markdown;
  }
}
