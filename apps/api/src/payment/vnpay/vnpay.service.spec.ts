import { Test, TestingModule } from '@nestjs/testing';
import { VnpayService } from './vnpay.service';
import { ConfigService } from '@nestjs/config';
import { hmacSha512, sortObject, buildQueryString } from './vnpay.helper';

const mockConfig = {
  get: jest.fn().mockImplementation((key: string, def: unknown) => {
    const vals: Record<string, unknown> = {
      VNPAY_TMN_CODE: 'TESTCODE',
      VNPAY_HASH_SECRET: 'testhashsecret',
      VNPAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    };
    return vals[key] ?? def;
  }),
};

describe('VnpayService', () => {
  let service: VnpayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VnpayService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<VnpayService>(VnpayService);
  });

  describe('buildPaymentUrl', () => {
    it('includes vnp_SecureHash in the URL', () => {
      const url = service.buildPaymentUrl('order-1', 299000, 'Test payment', 'http://localhost/return', '127.0.0.1');
      expect(url).toContain('vnp_SecureHash=');
      expect(url).toContain('vnp_TxnRef=order-1');
      expect(url).toContain('vnp_Amount=29900000');
    });

    it('produces a valid HMAC that verifyCallback can verify', () => {
      const url = service.buildPaymentUrl('order-2', 100000, 'Test', 'http://return', '10.0.0.1');
      const queryString = url.split('?')[1];
      const params: Record<string, string> = {};
      for (const pair of queryString.split('&')) {
        const [k, v] = pair.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v);
      }
      expect(service.verifyCallback(params)).toBe(true);
    });
  });

  describe('verifyCallback', () => {
    it('returns false when vnp_SecureHash is missing', () => {
      expect(service.verifyCallback({ vnp_TxnRef: 'order-1' })).toBe(false);
    });

    it('returns false when params are tampered', () => {
      const url = service.buildPaymentUrl('order-3', 50000, 'Test', 'http://return', '127.0.0.1');
      const queryString = url.split('?')[1];
      const params: Record<string, string> = {};
      for (const pair of queryString.split('&')) {
        const [k, v] = pair.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v);
      }
      params['vnp_Amount'] = '999999999';
      expect(service.verifyCallback(params)).toBe(false);
    });
  });
});

describe('vnpay helper functions', () => {
  describe('sortObject', () => {
    it('sorts keys alphabetically', () => {
      const sorted = sortObject({ b: '2', a: '1', c: '3' });
      expect(Object.keys(sorted)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('hmacSha512', () => {
    it('produces consistent hash for same input', () => {
      const h1 = hmacSha512('secret', 'data');
      const h2 = hmacSha512('secret', 'data');
      expect(h1).toBe(h2);
    });

    it('produces different hash for different input', () => {
      expect(hmacSha512('secret', 'data1')).not.toBe(hmacSha512('secret', 'data2'));
    });
  });
});
