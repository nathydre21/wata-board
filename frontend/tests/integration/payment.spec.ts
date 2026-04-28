/**
 * Payment flow E2E tests (#154 – fixed flaky timing).
 *
 * All hard-coded `waitForTimeout` calls and magic-number timeouts have been
 * replaced with deterministic helpers from `tests/helpers/waitHelpers.ts`.
 */

import { test, expect } from '@playwright/test';
import {
  gotoAndWaitForApp,
  injectFreighterMock,
  mockHorizonRoutes,
  waitForBalanceLoaded,
  fillAndVerify,
  clickWhenReady,
  waitForStatus,
  UI_TIMEOUT,
  NETWORK_TIMEOUT,
} from '../helpers/waitHelpers';

const MOCK_PUBLIC_KEY = 'GDOPTS553GBKXNF3X4YCQ7NPZUQ644QAN4SV7JEZHAVOVROAUQTSKEHO';

test.describe('Payment Flow', () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  test('completes the payment flow with a mock wallet', async ({ page }) => {
    // Set up mocks BEFORE navigation
    await injectFreighterMock(page, MOCK_PUBLIC_KEY);
    await mockHorizonRoutes(page, MOCK_PUBLIC_KEY);

    await gotoAndWaitForApp(page, '/');

    // Wait for the wallet balance to finish loading before interacting
    await waitForBalanceLoaded(page);

    await fillAndVerify(page, /meter number/i, 'METER-456');
    await fillAndVerify(page, /amount/i, '50');

    await clickWhenReady(page, 'pay-button');

    await waitForStatus(
      page.getByTestId('payment-status'),
      /successful/i,
      NETWORK_TIMEOUT
    );
  });

  // -------------------------------------------------------------------------
  // No wallet installed
  // -------------------------------------------------------------------------

  test('shows an error when Freighter is not installed', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-ignore
      window.freighter = false;
      // @ts-ignore
      window.freighterApi = {
        isConnected: () => Promise.resolve({ isConnected: false }),
      };
    });

    await gotoAndWaitForApp(page, '/');

    await fillAndVerify(page, /meter number/i, 'METER-123');
    await fillAndVerify(page, /amount/i, '100');

    await clickWhenReady(page, 'pay-button');

    await waitForStatus(
      page.getByTestId('payment-status'),
      /install Freighter Wallet/i,
      UI_TIMEOUT
    );
  });

  // -------------------------------------------------------------------------
  // Validation – empty fields
  // -------------------------------------------------------------------------

  test('shows validation error when meter ID is empty', async ({ page }) => {
    await injectFreighterMock(page, MOCK_PUBLIC_KEY);
    await gotoAndWaitForApp(page, '/');

    // Leave meter ID blank, fill amount only
    await fillAndVerify(page, /amount/i, '50');
    await clickWhenReady(page, 'pay-button');

    // Expect an inline validation message
    await expect(
      page.locator('[data-testid="meter-id-error"], [role="alert"]').first()
    ).toBeVisible({ timeout: UI_TIMEOUT });
  });

  // -------------------------------------------------------------------------
  // Validation – invalid amount
  // -------------------------------------------------------------------------

  test('shows validation error for a zero amount', async ({ page }) => {
    await injectFreighterMock(page, MOCK_PUBLIC_KEY);
    await gotoAndWaitForApp(page, '/');

    await fillAndVerify(page, /meter number/i, 'METER-789');
    await fillAndVerify(page, /amount/i, '0');
    await clickWhenReady(page, 'pay-button');

    await expect(
      page.locator('[data-testid="amount-error"], [role="alert"]').first()
    ).toBeVisible({ timeout: UI_TIMEOUT });
  });

  // -------------------------------------------------------------------------
  // Network failure handling
  // -------------------------------------------------------------------------

  test('shows an error when the Horizon API is unavailable', async ({ page }) => {
    await injectFreighterMock(page, MOCK_PUBLIC_KEY);

    // Abort all Horizon requests to simulate network failure
    await page.route('**/horizon/**', (route) => route.abort('failed'));

    await gotoAndWaitForApp(page, '/');

    await fillAndVerify(page, /meter number/i, 'METER-FAIL');
    await fillAndVerify(page, /amount/i, '25');
    await clickWhenReady(page, 'pay-button');

    // App should surface an error, not hang indefinitely
    await expect(
      page.locator('[data-testid="payment-status"], [role="alert"]').first()
    ).toBeVisible({ timeout: NETWORK_TIMEOUT });
  });
});
