/**
 * Frontend Configuration Versioning
 *
 * Mirrors the backend versioning pattern for the frontend environment.
 * Captures the active Vite env vars at build time, computes a hash, and
 * stores it in sessionStorage so the console can warn when config drifts
 * between page loads (e.g. after a hot-reload or new deployment).
 */

export interface FrontendConfigSnapshot {
  configVersion: string;
  capturedAt: string;
  hash: string;
  values: Record<string, string>;
}

/** Increment this whenever a VITE_ env key is added, removed, or its default changes */
export const FRONTEND_CONFIG_VERSION = '1.0.0';

const SESSION_KEY = 'nepa_config_snapshot';

/** Collect all relevant VITE_ env vars into a plain object */
function buildFrontendConfigValues(): Record<string, string> {
  return {
    VITE_NETWORK: import.meta.env.VITE_NETWORK ?? 'testnet',
    VITE_API_URL: import.meta.env.VITE_API_URL ?? '',
    VITE_FRONTEND_URL: import.meta.env.VITE_FRONTEND_URL ?? '',
    VITE_CONTRACT_ID_TESTNET:
      import.meta.env.VITE_CONTRACT_ID_TESTNET ??
      'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
    VITE_CONTRACT_ID_MAINNET:
      import.meta.env.VITE_CONTRACT_ID_MAINNET ?? 'MAINNET_CONTRACT_ID_HERE',
    VITE_RPC_URL_TESTNET:
      import.meta.env.VITE_RPC_URL_TESTNET ?? 'https://soroban-testnet.stellar.org',
    VITE_RPC_URL_MAINNET:
      import.meta.env.VITE_RPC_URL_MAINNET ?? 'https://soroban.stellar.org',
    VITE_NETWORK_PASSPHRASE_TESTNET:
      import.meta.env.VITE_NETWORK_PASSPHRASE_TESTNET ?? 'Test SDF Network ; September 2015',
    VITE_NETWORK_PASSPHRASE_MAINNET:
      import.meta.env.VITE_NETWORK_PASSPHRASE_MAINNET ??
      'Public Global Stellar Network ; September 2015',
  };
}

/** Simple djb2-style hash – good enough for change detection, not cryptographic */
function hashValues(values: Record<string, string>): string {
  const str = Object.keys(values)
    .sort()
    .map((k) => `${k}=${values[k]}`)
    .join('|');
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Call once at app startup (e.g. in main.tsx).
 * Logs a warning to the console if the config hash differs from the
 * previously stored session snapshot.
 */
export function initFrontendConfigTracking(): FrontendConfigSnapshot {
  const values = buildFrontendConfigValues();
  const hash = hashValues(values);
  const snapshot: FrontendConfigSnapshot = {
    configVersion: FRONTEND_CONFIG_VERSION,
    capturedAt: new Date().toISOString(),
    hash,
    values,
  };

  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const previous: FrontendConfigSnapshot = JSON.parse(stored);
      if (previous.hash !== hash) {
        console.warn(
          '[Config] Configuration changed since last page load.',
          { previousHash: previous.hash, currentHash: hash, version: FRONTEND_CONFIG_VERSION },
        );
      }
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    // sessionStorage may be unavailable (e.g. private browsing restrictions)
  }

  return snapshot;
}

/** Returns the current frontend config snapshot without side effects */
export function getFrontendConfigSnapshot(): FrontendConfigSnapshot {
  const values = buildFrontendConfigValues();
  return {
    configVersion: FRONTEND_CONFIG_VERSION,
    capturedAt: new Date().toISOString(),
    hash: hashValues(values),
    values,
  };
}
