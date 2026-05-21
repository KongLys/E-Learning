import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';

test.describe('Instructor: course creation flow', () => {
  test('instructor creates a new course', async ({ page }) => {
    await loginAs(page, 'instructor');
    await page.goto('/instructor/courses/new');
    await page.getByPlaceholder(/tiêu đề/i).fill('E2E Test Course ' + Date.now());
    await page.getByLabel(/mô tả chi tiết/i).fill('Mô tả chi tiết dài hơn 10 ký tự cho khóa học E2E');
    await page.getByRole('button', { name: /tạo.*tiếp tục/i }).click();
    // After creation, should redirect to edit page
    await page.waitForURL(/\/instructor\/courses\/.+\/edit/);
    await expect(page).toHaveURL(/\/instructor\/courses\/.+\/edit/);
  });

  test('instructor sees course list', async ({ page }) => {
    await loginAs(page, 'instructor');
    await page.goto('/instructor/courses');
    await expect(page.getByRole('heading', { name: /khóa học của tôi/i })).toBeVisible();
  });

  test('instructor sees dashboard', async ({ page }) => {
    await loginAs(page, 'instructor');
    await page.goto('/instructor/dashboard');
    await expect(page.getByText(/doanh thu|học viên|khóa học/i)).toBeVisible();
  });
});

test.describe('Admin: course review flow', () => {
  test('admin sees dashboard with stats', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin');
    await expect(page.getByText(/tổng người dùng/i)).toBeVisible();
  });

  test('admin sees users list', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /người dùng/i })).toBeVisible();
    // seed data has admin/instructor/student
    await expect(page.getByText('student@elearning.local')).toBeVisible();
  });

  test('admin sees courses list', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/courses');
    await expect(page.getByRole('heading', { name: /khóa học/i })).toBeVisible();
  });
});
