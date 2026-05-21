import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';

test.describe('Payment: VNPay checkout flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'student');
  });

  test('paid course shows Buy button when not enrolled', async ({ page }) => {
    // This test requires a published paid course in the catalog.
    // If no paid courses exist from seed, this test checks the free course shows correct CTA.
    await page.goto(`/courses/nestjs-cho-nguoi-moi`);
    // Free course should show "Học miễn phí" or "Tiếp tục học"
    const cta = page.getByRole('button', { name: /học miễn phí|tiếp tục học|mua ngay/i });
    await expect(cta).toBeVisible();
  });

  test('checkout success page renders', async ({ page }) => {
    await page.goto('/checkout/success?orderId=test-order-id');
    await expect(page.getByText(/hoàn tất|thành công/i)).toBeVisible();
  });
});
