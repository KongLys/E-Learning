import { Page } from '@playwright/test';

const ACCOUNTS = {
  admin: { email: 'admin@elearning.local', password: 'Admin@123' },
  instructor: { email: 'instructor@elearning.local', password: 'Demo@123' },
  student: { email: 'student@elearning.local', password: 'Demo@123' },
} as const;

export async function loginAs(page: Page, role: keyof typeof ACCOUNTS) {
  const { email, password } = ACCOUNTS[role];
  await page.goto('/login');
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/mật khẩu/i).fill(password);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'));
}

export const TEST_ACCOUNTS = ACCOUNTS;
