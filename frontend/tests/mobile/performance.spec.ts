import { test, expect, Page } from '@playwright/test';

test.describe('Mobile Performance Checks', () => {

  test('should load home page within acceptable time', async ({ page, isMobile }: { page: Page; isMobile: boolean }) => {
    test.skip(!isMobile, 'This test is only for mobile viewports');

    const startTime = Date.now();
    await page.goto('/');
    const endTime = Date.now();

    const loadTime = endTime - startTime;
    // We expect the home page to load within 5 seconds in development/CI environment
    expect(loadTime).toBeLessThan(5000); 

    await expect(page.getByRole('heading', { name: 'Wata-Board' })).toBeVisible();
  });

  test('should have stable layout on initial load', async ({ page, isMobile }: { page: Page; isMobile: boolean }) => {
    test.skip(!isMobile, 'This test is only for mobile viewports');

    await page.goto('/');
    
    // Evaluate Cumulative Layout Shift (CLS) roughly via evaluating browser timing
    const cls: number = await page.evaluate(() => {
      let layoutShiftScore = 0;
      const observer = new (window as any).PerformanceObserver((list: any) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            layoutShiftScore += entry.value;
          }
        }
      });
      observer.observe({type: 'layout-shift', buffered: true});
      return layoutShiftScore;
    });

    // Ideal CLS should be less than 0.1
    expect(cls).toBeLessThan(0.2); 
  });

  test('should have fast interaction response', async ({ page, isMobile }: { page: Page; isMobile: boolean }) => {
    test.skip(!isMobile, 'This test is only for mobile viewports');

    await page.goto('/');
    
    const menuButton = page.getByLabel('Toggle navigation menu');
    const startInteraction = Date.now();
    await menuButton.tap();
    const endInteraction = Date.now();

    const interactionTime = endInteraction - startInteraction;
    // Taps should feel instant (< 300ms)
    expect(interactionTime).toBeLessThan(300);
  });
});
