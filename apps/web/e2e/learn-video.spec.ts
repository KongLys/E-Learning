import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';

const FREE_COURSE_SLUG = 'nestjs-cho-nguoi-moi';
const FREE_LESSON_ID = 'seed-lesson-1';

test.describe('Learn: free course video flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'student');
  });

  test('student enrolls free course → navigates to lesson', async ({ page }) => {
    await page.goto(`/courses/${FREE_COURSE_SLUG}`);
    // Enroll or continue button
    const enrollBtn = page.getByRole('button', { name: /học miễn phí|tiếp tục học/i });
    await expect(enrollBtn).toBeVisible();
    await enrollBtn.click();
    // Should navigate to the learn page
    await page.waitForURL(/\/learn\//);
    await expect(page).toHaveURL(new RegExp(`/learn/${FREE_COURSE_SLUG}/`));
  });

  test('video lesson page renders player controls', async ({ page }) => {
    await page.goto(`/learn/${FREE_COURSE_SLUG}/${FREE_LESSON_ID}`);
    // Header with lesson title
    await expect(page.getByRole('heading', { name: /nestjs là gì/i })).toBeVisible();
    // Notes tab
    await expect(page.getByText(/ghi chú/i)).toBeVisible();
  });

  test('notes panel allows adding a note', async ({ page }) => {
    await page.goto(`/learn/${FREE_COURSE_SLUG}/${FREE_LESSON_ID}`);
    await page.getByRole('button', { name: /thêm note/i }).click();
    await page.getByPlaceholder(/nội dung ghi chú/i).fill('E2E test note content');
    await page.getByRole('button', { name: /^lưu$/i }).click();
    await expect(page.getByText('E2E test note content')).toBeVisible();
  });

  test('sidebar shows course sections', async ({ page }) => {
    await page.goto(`/learn/${FREE_COURSE_SLUG}/${FREE_LESSON_ID}`);
    // Progress section visible in sidebar (desktop)
    await expect(page.getByText(/tiến độ khóa học/i)).toBeVisible();
  });
});
