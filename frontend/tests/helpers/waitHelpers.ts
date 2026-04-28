/**
 * Reusable wait/synchronization helpers for Playwright E2E tests (#154).
 *
 * Replace all `waitForTimeout` and magic-number timeouts with these
 * deterministic helpers that wait for observable application state.
 */

import { type Page, type Locator, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default timeout for UI state transitions (ms). */
export const UI_TIMEOUT = 10_000;
/** Timeout for operations that involve network round-trips (ms). */
export const NETWORK_TIMEOUT = 15_000;
/** Timeout for wallet / blockchain interactions (ms). */
export const WALLET_TIMEOUT = 20_000;

// ---------------------------------------------------------------------------
// Page-level helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to a route and wait until the React app has mounted.
 * Replaces `goto(url, { waitUntil: 'networkidle' })` which is unreliable
 * when the app makes background requests after initial render.
 */
export async function gotoAndWaitForApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  // Wait for the root element to be non-empty (React has rendered)
  await page.waitForFunction(
    () => document.getElementById('root')?.children.length ?? 0 > 0,
    { timeout: UI_TIMEOUT }
  );
}

/**
 * Wait for all in-flight fetch/XHR requests to settle.
 * More reliable than `waitUntil: 'networkidle'` for SPAs.
 */
export async function waitForNetworkIdle(page: Page, idleMs = 300): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: NETWORK_TIMEOUT });
  // Extra settle time for debounced state updates
  await page.waitForTimeout(idleMs);
}

// ---------------------------------------------------------------------------
// Wallet / balance helpers
// ---------------------------------------------------------------------------

/**
 * Inject the standard Freighter mock before navigating.
 * Call this before `page.goto()`.
 */
export async function injectFreighterMock(page: Page, publicKey: string): Promise<void> {
  await page.addInitScript((pubKey: string) => {
    // @ts-ignore
    window.freighter = {
      isConnected: () => Promise.resolve(true),
      requestAccess: () => Promise.resolve(pubKey),
      getPublicKey: () => Promise.resolve(pubKey),
      getNetwork: () => Promise.resolve('TESTNET'),
      signTransaction: (xdr: string) => Promise.resolve({ signedTxXdr: xdr }),
    };
    // @ts-ignore
    window.freighterApi = {
      isConnected: () => Promise.resolve({ isConnected: true }),
      requestAccess: () => Promise.resolve({ publicKey: pubKey }),
      getAddress: () => Promise.resolve({ address: pubKey }),
      signTransaction: (xdr: string) => Promise.resolve({ signedTxXdr: 'SIGNED_XDR_MOCK' }),
    };
    // @ts-ignore
    window.__MOCK_STELLAR_ACCOUNT__ = (id: string) => ({
      id,
      accountId: () => id,
      sequence: '100',
      sequenceNumber: () => '100',
      incrementSequenceNumber: () => {},
      balances: [{ asset_type: 'native', balance: '1000.00' }],
    });
  }, publicKey);
}

/**
 * Intercept Horizon API calls with deterministic mock responses.
 * Call this before `page.goto()`.
 */
export async function mockHorizonRoutes(page: Page, publicKey: string): Promise<void> {
  await page.route('**/horizon/**', async (route) => {
    const url = route.request().url();
    if (url.includes('accounts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: publicKey,
          accountId: publicKey,
          sequence: '100',
          balances: [{ asset_type: 'native', balance: '1000.00' }],
        }),
      });
    } else if (url.includes('ledgers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _embedded: {
            records: [{ base_fee_in_stroops: 100, base_reserve_in_stroops: 5_000_000 }],
          },
        }),
      });
    } else if (route.request().method() === 'POST' && url.includes('transactions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ hash: 'MOCK_TX_HASH_E2E' }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Wait until the wallet balance element shows a non-zero, non-loading value.
 * Replaces `waitForTimeout(15000)` + `toContainText(/1,000.00/)`.
 */
export async function waitForBalanceLoaded(page: Page): Promise<void> {
  // First wait for the element to appear
  const balance = page.locator('.text-lg.font-semibold').first();
  await balance.waitFor({ state: 'visible', timeout: WALLET_TIMEOUT });

  // Then wait until it contains a numeric value (not a spinner/placeholder)
  await expect(balance).toContainText(/[\d,]+\.\d{2}/, { timeout: WALLET_TIMEOUT });
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

/**
 * Fill a labelled input and wait for the value to be reflected in the DOM.
 * Avoids race conditions where React state hasn't updated yet.
 */
export async function fillAndVerify(
  page: Page,
  label: RegExp | string,
  value: string
): Promise<void> {
  const input = page.getByLabel(label);
  await input.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  await input.fill(value);
  await expect(input).toHaveValue(value, { timeout: UI_TIMEOUT });
}

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

/**
 * Click a button identified by test-id and wait for it to become enabled first.
 */
export async function clickWhenReady(page: Page, testId: string): Promise<void> {
  const btn = page.getByTestId(testId);
  await btn.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  await expect(btn).toBeEnabled({ timeout: UI_TIMEOUT });
  await btn.click();
}

/**
 * Wait for a status element to show a specific text pattern.
 * Replaces bare `toContainText` calls with no explicit timeout.
 */
export async function waitForStatus(
  locator: Locator,
  pattern: RegExp | string,
  timeout = NETWORK_TIMEOUT
): Promise<void> {
  await expect(locator).toContainText(pattern, { timeout });
}
