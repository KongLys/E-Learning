import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';

const FREE_COURSE_SLUG = 'nestjs-cho-nguoi-moi';
const QUIZ_LESSON_ID = 'seed-lesson-3';

test.describe('Learn: quiz flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'student');
    // Ensure enrolled
    await page.goto(`/courses/${FREE_COURSE_SLUG}`);
    const enrollBtn = page.getByRole('button', { name: /học miễn phí|tiếp tục học/i });
    if (await enrollBtn.isVisible()) await enrollBtn.click();
    await page.waitForTimeout(500);
  });

  test('quiz lesson renders start button', async ({ page }) => {
    await page.goto(`/learn/${FREE_COURSE_SLUG}/${QUIZ_LESSON_ID}`);
    await expect(page.getByRole('button', { name: /bắt đầu làm bài/i })).toBeVisible();
  });

  test('quiz: answer correctly → see result', async ({ page }) => {
    await page.goto(`/learn/${FREE_COURSE_SLUG}/${QUIZ_LESSON_ID}`);
    await page.getByRole('button', { name: /bắt đầu làm bài/i }).click();
    // Select "Express.js" which is the correct answer
    await page.getByText('Express.js').click();
    await page.getByRole('button', { name: /nộp bài/i }).click();
    // Should show result
    await expect(page.getByText(/kết quả|điểm|đúng/i)).toBeVisible();
  });
});
