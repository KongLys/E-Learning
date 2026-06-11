import { ConfigService } from '@nestjs/config';
import { SepayService } from './sepay.service';

describe('SepayService', () => {
  const config = {
    SEPAY_ACCOUNT_NUMBER: '0123456789',
    SEPAY_BANK_CODE: 'MBBank',
    SEPAY_ACCOUNT_NAME: 'NGUYEN VAN A',
    SEPAY_API_KEY: 'secret-key',
    SEPAY_QR_URL: 'https://qr.sepay.vn/img',
  } as Record<string, string>;

  const service = new SepayService({
    get: (key: string, def?: string) => config[key] ?? def,
  } as unknown as ConfigService);

  describe('generateTransferCode', () => {
    it('sinh mã dạng DH + 8 ký tự hex hoa', () => {
      const code = service.generateTransferCode();
      expect(code).toMatch(/^DH[0-9A-F]{8}$/);
    });

    it('mỗi lần sinh khác nhau', () => {
      expect(service.generateTransferCode()).not.toBe(
        service.generateTransferCode(),
      );
    });
  });

  describe('buildQrUrl', () => {
    it('chứa số tài khoản, ngân hàng, số tiền (làm tròn) và nội dung', () => {
      const url = service.buildQrUrl(199000.5, 'DHA1B2C3D4');
      expect(url).toContain('acc=0123456789');
      expect(url).toContain('bank=MBBank');
      expect(url).toContain('amount=199001');
      expect(url).toContain('des=DHA1B2C3D4');
    });
  });

  describe('verifyApiKey', () => {
    it('chấp nhận header đúng định dạng Apikey <key>', () => {
      expect(service.verifyApiKey('Apikey secret-key')).toBe(true);
    });

    it('từ chối key sai', () => {
      expect(service.verifyApiKey('Apikey wrong')).toBe(false);
    });

    it('từ chối khi thiếu header', () => {
      expect(service.verifyApiKey(undefined)).toBe(false);
    });
  });

  describe('extractTransferCode', () => {
    it('trích đúng mã khi có text nối thêm', () => {
      expect(service.extractTransferCode('DHA1B2C3D4 CHUYEN TIEN')).toBe(
        'DHA1B2C3D4',
      );
    });

    it('chuẩn hoá chữ thường và khoảng trắng', () => {
      expect(service.extractTransferCode('dha1b2c3d4')).toBe('DHA1B2C3D4');
    });

    it('trả null khi không có mã hợp lệ', () => {
      expect(service.extractTransferCode('thanh toan khoa hoc')).toBeNull();
      expect(service.extractTransferCode('')).toBeNull();
      expect(service.extractTransferCode(undefined)).toBeNull();
    });
  });
});
