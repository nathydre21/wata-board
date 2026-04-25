import { test, expect, Page } from '@playwright/test';

test.describe('Mobile Responsive Design', () => {
  test('should show mobile menu button on small screens', async ({ page, isMobile }: { page: Page; isMobile: boolean }) => {
    await page.goto('/');

    if (isMobile) {
      // Burger menu should be visible
      const menuButton = page.getByLabel('Toggle navigation menu');
      await expect(menuButton).toBeVisible();

      // Desktop menu should be hidden
      const desktopMenu = page.getByRole('menubar').filter({ hasText: 'Pay Bill' });
      // On mobile, the desktop menu (lg:flex) should be hidden
      await expect(desktopMenu).not.toBeVisible();
    } else {
      // On desktop, the desktop menu should be visible
      const desktopMenu = page.getByRole('menubar').filter({ hasText: 'Pay Bill' });
      await expect(desktopMenu).toBeVisible();
      
      // Burger menu should be hidden
      const menuButton = page.getByLabel('Toggle navigation menu');
      await expect(menuButton).not.toBeVisible();
    }
  });

  test('should open and close mobile menu', async ({ page, isMobile }: { page: Page; isMobile: boolean }) => {
    test.skip(!isMobile, 'This test is only for mobile viewports');

    await page.goto('/');

    // Open menu
    const menuButton = page.getByLabel('Toggle navigation menu');
    await menuButton.click();

    // Check if menu is open (e.g., side navigation is visible)
    const mobileNav = page.locator('nav').filter({ hasText: 'Pay Bill' }).last(); 
    // Actually, ResponsiveNavigation.tsx opens <MobileNavigation />
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible();

    // Close menu
    const closeButton = page.getByLabel('Toggle navigation menu'); // Toggle button
    // Or wait for close icon if it changes
    await closeButton.click();

    // Menu should be closed
    await expect(page.getByRole('link', { name: 'About' })).not.toBeVisible();
  });

  test('should adapt layout for different orientations', async ({ page, isMobile }: { page: Page; isMobile: boolean }) => {
    test.skip(!isMobile, 'This test is only for mobile viewports');

    await page.goto('/');
    
    // Portrait
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole('heading', { name: 'Wata-Board' })).toBeVisible();

    // Landscape
    await page.setViewportSize({ width: 667, height: 375 });
    await expect(page.getByRole('heading', { name: 'Wata-Board' })).toBeVisible();
  });
});
