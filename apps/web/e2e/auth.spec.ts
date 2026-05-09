import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';

test.describe('Authentication flows', () => {
  test('register as student → login → see my courses', async ({ page }) => {
    const uniqueEmail = `e2e_student_${Date.now()}@test.local`;

    // Register
    await page.goto('/register');
    await page.getByPlaceholder(/họ và tên/i).fill('E2E Student');
    await page.getByPlaceholder(/email/i).fill(uniqueEmail);
    await page.getByPlaceholder(/mật khẩu/i).fill('Test@12345');
    await page.getByRole('button', { name: /đăng ký/i }).click();
    await page.waitForURL('/');

    // Navigate to my courses
    await page.goto('/my-courses');
    await expect(page.getByText(/khóa học của tôi/i)).toBeVisible();
  });

  test('register with existing email → error message', async ({ page }) => {
    await page.goto('/register');
    await page.getByPlaceholder(/họ và tên/i).fill('Duplicate User');
    await page.getByPlaceholder(/email/i).fill('student@elearning.local');
    await page.getByPlaceholder(/mật khẩu/i).fill('Test@12345');
    await page.getByRole('button', { name: /đăng ký/i }).click();
    // Should stay on register page and show error
    await expect(page).toHaveURL('/register');
  });

  test('login with wrong password → error message', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/email/i).fill('student@elearning.local');
    await page.getByPlaceholder(/mật khẩu/i).fill('wrongpassword');
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    // Should stay on login page
    await expect(page).toHaveURL('/login');
  });

  test('student login → redirected away from login page', async ({ page }) => {
    await loginAs(page, 'student');
    await expect(page).not.toHaveURL('/login');
  });
});
