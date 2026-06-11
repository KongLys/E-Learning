import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'crypto';

/**
 * SePay gateway: thanh toán bằng QR chuyển khoản ngân hàng (VietQR).
 * - Sinh mã QR qua qr.sepay.vn với nội dung chuyển khoản (transferCode) duy nhất.
 * - SePay theo dõi tài khoản ngân hàng và gọi webhook khi có tiền vào.
 * - Webhook xác thực bằng header `Authorization: Apikey <SEPAY_API_KEY>`.
 */
@Injectable()
export class SepayService {
  private readonly accountNumber: string;
  private readonly bankCode: string;
  private readonly accountName: string;
  private readonly apiKey: string;
  private readonly qrUrl: string;

  constructor(private config: ConfigService) {
    this.accountNumber = this.config.get<string>('SEPAY_ACCOUNT_NUMBER', '');
    this.bankCode = this.config.get<string>('SEPAY_BANK_CODE', '');
    this.accountName = this.config.get<string>('SEPAY_ACCOUNT_NAME', '');
    this.apiKey = this.config.get<string>('SEPAY_API_KEY', '');
    this.qrUrl = this.config.get<string>(
      'SEPAY_QR_URL',
      'https://qr.sepay.vn/img',
    );
  }

  /** Sinh nội dung chuyển khoản duy nhất, ví dụ: DHA1B2C3D4 (chỉ chữ + số). */
  generateTransferCode(): string {
    return 'DH' + randomBytes(4).toString('hex').toUpperCase();
  }

  /** URL ảnh QR VietQR kèm số tiền và nội dung chuyển khoản. */
  buildQrUrl(amount: number, transferCode: string): string {
    const params = new URLSearchParams({
      acc: this.accountNumber,
      bank: this.bankCode,
      amount: String(Math.round(amount)),
      des: transferCode,
    });
    return `${this.qrUrl}?${params.toString()}`;
  }

  /** Thông tin tài khoản nhận để hiển thị hướng dẫn chuyển khoản thủ công. */
  getAccountInfo() {
    return {
      accountNumber: this.accountNumber,
      bankCode: this.bankCode,
      accountName: this.accountName,
    };
  }

  /** Xác thực header `Authorization: Apikey <key>` của webhook (so sánh an toàn timing). */
  verifyApiKey(authHeader?: string): boolean {
    if (!this.apiKey || !authHeader) return false;
    const expected = `Apikey ${this.apiKey}`;
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /**
   * Trích transferCode khỏi nội dung chuyển khoản đã chuẩn hoá.
   * Khớp đúng định dạng cố định DH + 8 ký tự hex hoa để tránh nuốt nhầm
   * phần text ngân hàng nối thêm (vd "DHA1B2C3D4 CHUYEN TIEN").
   */
  extractTransferCode(content?: string): string | null {
    if (!content) return null;
    const normalized = content.toUpperCase().replace(/\s+/g, '');
    const match = normalized.match(/DH[0-9A-F]{8}/);
    return match ? match[0] : null;
  }
}
