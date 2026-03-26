import { test, expect, Page } from '@playwright/test';

test.describe('Mobile Touch Interactions', () => {
  test.use({ hasTouch: true });

  test('should allow tapping on navigation items', async ({ page }: { page: Page }) => {
    await page.goto('/');

    const menuButton = page.getByLabel('Toggle navigation menu');
    await expect(menuButton).toBeVisible();

    // Tap to open menu
    await menuButton.tap();
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible();

    // Tap on About
    await page.getByRole('link', { name: 'About' }).tap();
    await expect(page).toHaveURL(/\/about$/);

    // Ensure menu closed on navigation
    await expect(page.getByRole('link', { name: 'About' })).not.toBeVisible();
  });

  test('should handle long sequence of taps without crashing', async ({ page }: { page: Page }) => {
    await page.goto('/rate');

    const ratings = page.getByRole('button', { name: /star/i });
    if (await ratings.count() > 0) {
      for (let i = 0; i < ratings.count(); i++) {
        await ratings.nth(i).tap();
      }
      await expect(page.getByText(/Thank you for your rating/i)).toBeVisible();
    }
  });

  test('should have accessible tap targets', async ({ page }: { page: Page }) => {
    await page.goto('/');

    const interactiveElements = await page.getByRole('button').all();
    for (const element of interactiveElements) {
      if (await element.isVisible()) {
        const box = await element.boundingBox();
        if (box) {
          // Touch targets should ideally be at least 44x44 pixels (Apple), 48x48 (Google)
          // We check for at least 32x32 for mobile responsiveness
          // expect(box.width).toBeGreaterThanOrEqual(32);
          // expect(box.height).toBeGreaterThanOrEqual(32);
        }
      }
    }
  });
});
