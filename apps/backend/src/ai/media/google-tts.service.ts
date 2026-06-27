import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Google Cloud Text-to-Speech giới hạn 5000 byte/yêu cầu — chừa biên an toàn.
const MAX_CHUNK_BYTES = 4500;
// Giọng Chirp 3 HD còn từ chối từng CÂU quá dài trong một yêu cầu (lỗi 400
// "This request contains sentences that are too long"), kể cả khi tổng < giới
// hạn trên. Giữ mỗi câu dưới ngưỡng này; câu dài hơn sẽ được tách nhỏ.
const MAX_SENTENCE_BYTES = 900;
const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

// Các ký tự CHỈ có trong tiếng Việt (nguyên âm có dấu + đ). Nếu text chứa bất
// kỳ ký tự nào trong nhóm này thì coi như nội dung là tiếng Việt; ngược lại
// (chỉ ký tự ASCII/Latin không dấu) coi là tiếng Anh.
const VIETNAMESE_CHARS =
  /[ăâđêôơưàáảãạấầẩẫậắằẳẵặèéẻẽẹếềểễệìíỉĩịòóỏõọốồổỗộớờởỡợùúủũụứừửữựỳýỷỹỵĂÂĐÊÔƠƯÀÁẢÃẠẤẦẨẪẬẮẰẲẴẶÈÉẺẼẸẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌỐỒỔỖỘỚỜỞỠỢÙÚỦŨỤỨỪỬỮỰỲÝỶỸỴ]/;

export interface SynthesizeResult {
  audio: Buffer;
  /** Tên giọng đã dùng (vd vi-VN-Chirp3-HD-Puck) — để lưu vào NarrationAsset. */
  voice: string;
}

/**
 * Bọc Google Cloud Text-to-Speech REST API. Trả MP3 trực tiếp. Tự nhận diện
 * ngôn ngữ (tiếng Việt vs tiếng Anh) để chọn giọng Chirp 3 HD tương ứng
 * (vi-VN-Chirp3-HD-Puck / en-US-Chirp3-HD-Puck). Dùng fetch + API key nên
 * không cần thêm thư viện npm.
 */
@Injectable()
export class GoogleTtsService {
  private readonly logger = new Logger(GoogleTtsService.name);
  private readonly apiKey: string;
  /** Tên giọng Chirp 3 HD dùng chung cho mọi ngôn ngữ (vd Puck, Aoede). */
  private readonly voiceName: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GOOGLE_TTS_API_KEY', '');
    this.voiceName = config.get<string>('GOOGLE_TTS_VOICE_NAME', 'Puck');
    if (!this.apiKey) {
      this.logger.warn(
        'GOOGLE_TTS_API_KEY chưa cấu hình — tính năng giọng đọc/video AI sẽ lỗi khi chạy',
      );
    }
  }

  /** Phát hiện ngôn ngữ thô để chọn locale giọng đọc. */
  detectLanguage(text: string): 'vi-VN' | 'en-US' {
    return VIETNAMESE_CHARS.test(text) ? 'vi-VN' : 'en-US';
  }

  /** Ghép tên giọng Chirp 3 HD theo locale, vd vi-VN-Chirp3-HD-Puck. */
  resolveVoice(languageCode: 'vi-VN' | 'en-US'): string {
    return `${languageCode}-Chirp3-HD-${this.voiceName}`;
  }

  /**
   * Tổng hợp toàn bộ text thành một buffer MP3 (ghép nhiều đoạn nếu vượt giới
   * hạn). Tự chọn giọng theo ngôn ngữ phát hiện được từ chính nội dung.
   */
  async synthesize(text: string): Promise<SynthesizeResult> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'GOOGLE_TTS_API_KEY chưa cấu hình — không thể tạo giọng đọc',
      );
    }
    const languageCode = this.detectLanguage(text);
    const voice = this.resolveVoice(languageCode);
    const chunks = this.splitText(text);
    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      buffers.push(await this.synthesizeChunk(chunk, languageCode, voice));
    }
    // Các khung MP3 nối liền nhau phát liền mạch với cùng một giọng đọc.
    return { audio: Buffer.concat(buffers), voice };
  }

  private async synthesizeChunk(
    text: string,
    languageCode: string,
    voice: string,
  ): Promise<Buffer> {
    let res: Response;
    try {
      res = await fetch(`${TTS_ENDPOINT}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode, name: voice },
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
   * Cắt text thành các đoạn ≤ MAX_CHUNK_BYTES để gửi từng yêu cầu TTS. Đảm bảo:
   *  - Mỗi câu ≤ MAX_SENTENCE_BYTES (câu dài tách tại dấu phẩy → từ → byte).
   *  - Mỗi câu KẾT THÚC bằng dấu câu, các câu trong một đoạn ngăn nhau bằng
   *    xuống dòng → Google không gộp các câu liền nhau thành một "câu" quá dài
   *    (nguyên nhân lỗi 400 với nội dung không có dấu chấm cuối dòng/đề mục).
   */
  private splitText(text: string): string[] {
    const byteLen = (s: string) => Buffer.byteLength(s, 'utf8');

    // Tách theo ranh giới câu (giữ dấu) và xuống dòng (mỗi đề mục/đoạn 1 câu).
    const rawSentences = text
      .split(/(?<=[.!?…])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Cắt nhỏ những câu vượt ngưỡng Chirp.
    const sentences: string[] = [];
    for (const s of rawSentences) {
      if (byteLen(s) > MAX_SENTENCE_BYTES) {
        sentences.push(...this.splitLongSentence(s));
      } else {
        sentences.push(s);
      }
    }

    // Đảm bảo mỗi câu kết thúc bằng dấu câu để Google không gộp câu.
    const terminated = sentences.map((s) =>
      /[.!?…]$/.test(s) ? s : `${s}.`,
    );

    // Gom các câu tới sát MAX_CHUNK_BYTES, ngăn cách bằng xuống dòng.
    const chunks: string[] = [];
    let current = '';
    for (const sentence of terminated) {
      const candidate = current ? `${current}\n${sentence}` : sentence;
      if (byteLen(candidate) > MAX_CHUNK_BYTES) {
        if (current) chunks.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks.length > 0 ? chunks : [''];
  }

  /**
   * Tách một câu dài quá ngưỡng Chirp thành các mảnh ≤ MAX_SENTENCE_BYTES, ưu
   * tiên ranh giới mệnh đề (dấu phẩy/chấm phẩy/hai chấm), sau đó theo từ, cuối
   * cùng cắt cứng theo byte cho từ quá dài (vd URL dài).
   */
  private splitLongSentence(sentence: string): string[] {
    const byteLen = (s: string) => Buffer.byteLength(s, 'utf8');
    const out: string[] = [];
    let buf = '';
    const flush = () => {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    };
    const addPiece = (piece: string) => {
      const candidate = buf ? `${buf} ${piece}` : piece;
      if (byteLen(candidate) > MAX_SENTENCE_BYTES) {
        flush();
        buf = piece;
      } else {
        buf = candidate;
      }
    };

    const clauses = sentence
      .split(/(?<=[,;:])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const clause of clauses) {
      if (byteLen(clause) <= MAX_SENTENCE_BYTES) {
        addPiece(clause);
        continue;
      }
      // Mệnh đề vẫn quá dài — gom theo từ.
      flush();
      for (const word of clause.split(/\s+/).filter(Boolean)) {
        if (byteLen(word) > MAX_SENTENCE_BYTES) {
          flush();
          out.push(...this.hardSplit(word, MAX_SENTENCE_BYTES));
        } else {
          addPiece(word);
        }
      }
      flush();
    }
    flush();
    return out;
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
