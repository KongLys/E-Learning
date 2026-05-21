import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sortObject, buildQueryString, hmacSha512, formatVnpDate } from './vnpay.helper';

@Injectable()
export class VnpayService {
  private readonly tmnCode: string;
  private readonly hashSecret: string;
  private readonly vnpUrl: string;

  constructor(private config: ConfigService) {
    this.tmnCode = this.config.get<string>('VNPAY_TMN_CODE', 'TESTCODE');
    this.hashSecret = this.config.get<string>('VNPAY_HASH_SECRET', 'testhashsecret');
    this.vnpUrl = this.config.get<string>('VNPAY_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
  }

  buildPaymentUrl(orderId: string, amount: number, orderInfo: string, returnUrl: string, ipAddr: string): string {
    const now = new Date();
    const expire = new Date(now.getTime() + 15 * 60 * 1000);

    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode,
      vnp_Amount: String(Math.round(amount * 100)),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: orderId,
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: formatVnpDate(now),
      vnp_ExpireDate: formatVnpDate(expire),
    };

    const sorted = sortObject(params);
    const signData = buildQueryString(sorted);
    const secureHash = hmacSha512(this.hashSecret, signData);

    return `${this.vnpUrl}?${signData}&vnp_SecureHash=${secureHash}`;
  }

  verifyCallback(query: Record<string, string>): boolean {
    const { vnp_SecureHash, ...rest } = query;
    if (!vnp_SecureHash) return false;

    const filtered = Object.fromEntries(
      Object.entries(rest).filter(([k]) => k.startsWith('vnp_')),
    );
    const sorted = sortObject(filtered);
    const signData = buildQueryString(sorted);
    const expectedHash = hmacSha512(this.hashSecret, signData);

    return expectedHash === vnp_SecureHash;
  }
}
