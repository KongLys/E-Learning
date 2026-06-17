import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Google Cloud Text-to-Speech giới hạn 5000 byte/yêu cầu — chừa biên an toàn.
const MAX_CHUNK_BYTES = 4500;
const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

/**
 * Bọc Google Cloud Text-to-Speech REST API. Trả MP3 trực tiếp, hỗ trợ giọng
 * tiếng Việt (vi-VN). Dùng fetch + API key (cùng style với các lời gọi Ollama
 * trong GeminiService) nên không cần thêm thư viện npm.
 */
@Injectable()
export class GoogleTtsService {
  private readonly logger = new Logger(GoogleTtsService.name);
  private readonly apiKey: string;
  readonly voice: string;
  private readonly languageCode: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GOOGLE_TTS_API_KEY', '');
    this.voice = config.get<string>('GOOGLE_TTS_VOICE', 'vi-VN-Wavenet-A');
    this.languageCode = config.get<string>('GOOGLE_TTS_LANGUAGE', 'vi-VN');
    if (!this.apiKey) {
      this.logger.warn(
        'GOOGLE_TTS_API_KEY chưa cấu hình — tính năng tạo podcast sẽ lỗi khi chạy',
      );
    }
  }

  /** Tổng hợp toàn bộ text thành một buffer MP3 (ghép nhiều đoạn nếu vượt giới hạn). */
  async synthesize(text: string): Promise<Buffer> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'GOOGLE_TTS_API_KEY chưa cấu hình — không thể tạo podcast',
      );
    }
    const chunks = this.splitText(text);
    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      buffers.push(await this.synthesizeChunk(chunk));
    }
    // Các khung MP3 nối liền nhau phát liền mạch với cùng một giọng đọc.
    return Buffer.concat(buffers);
  }

  private async synthesizeChunk(text: string): Promise<Buffer> {
    let res: Response;
    try {
      res = await fetch(`${TTS_ENDPOINT}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: this.languageCode, name: this.voice },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      });
    } catch (err) {
      this.logger.error(`Google TTS request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Dịch vụ tạo giọng nói không khả dụng');
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Google TTS responded ${res.status}: ${detail}`);
      throw new ServiceUnavailableException('Dịch vụ tạo giọng nói không khả dụng');
    }
    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) {
      throw new ServiceUnavailableException('Google TTS không trả về audio');
    }
    return Buffer.from(data.audioContent, 'base64');
  }

  /**
   * Cắt text thành các đoạn ≤ MAX_CHUNK_BYTES, ưu tiên ranh giới câu/đoạn để
   * giọng đọc không bị ngắt giữa câu. Câu quá dài sẽ bị cắt cứng theo byte.
   */
  private splitText(text: string): string[] {
    const byteLen = (s: string) => Buffer.byteLength(s, 'utf8');
    // Tách theo câu (giữ lại dấu câu) rồi gom lại tới sát giới hạn.
    const sentences = text
      .split(/(?<=[.!?…\n])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let current = '';
    const pushCurrent = () => {
      if (current.trim()) chunks.push(current.trim());
      current = '';
    };

    for (const sentence of sentences) {
      // Câu đơn lẻ vượt giới hạn — cắt cứng theo byte.
      if (byteLen(sentence) > MAX_CHUNK_BYTES) {
        pushCurrent();
        chunks.push(...this.hardSplit(sentence, MAX_CHUNK_BYTES));
        continue;
      }
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (byteLen(candidate) > MAX_CHUNK_BYTES) {
        pushCurrent();
        current = sentence;
      } else {
        current = candidate;
      }
    }
    pushCurrent();
    return chunks.length > 0 ? chunks : [''];
  }

  /** Cắt cứng một chuỗi dài thành các đoạn ≤ maxBytes mà không vỡ ký tự UTF-8. */
  private hardSplit(text: string, maxBytes: number): string[] {
    const parts: string[] = [];
    let buf = '';
    for (const ch of text) {
      if (Buffer.byteLength(buf + ch, 'utf8') > maxBytes) {
        parts.push(buf);
        buf = ch;
      } else {
        buf += ch;
      }
    }
    if (buf) parts.push(buf);
    return parts;
  }
}
