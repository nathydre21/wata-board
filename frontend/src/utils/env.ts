/**
 * Frontend configuration validation.
 * Called once at app startup (main.tsx) to surface missing or invalid env vars early.
 */

export interface FrontendEnvConfig {
  network: 'testnet' | 'mainnet';
  apiUrl: string;
  contractIdTestnet: string;
  contractIdMainnet: string;
  rpcUrlTestnet: string;
  rpcUrlMainnet: string;
  networkPassphraseTestnet: string;
  networkPassphraseMainnet: string;
  wsPort: string;
}

interface ConfigIssue {
  field: string;
  message: string;
  fatal: boolean;
}

const URL_REGEX = /^https?:\/\/.+/;

function checkUrl(value: string | undefined, field: string, fatal = false): ConfigIssue | null {
  if (!value) return null; // handled by presence check
  if (!URL_REGEX.test(value)) {
    return { field, message: `"${field}" must be a valid URL. Got: "${value}"`, fatal };
  }
  return null;
}

function checkPlaceholder(value: string | undefined, placeholder: string, field: string): ConfigIssue | null {
  if (value === placeholder) {
    return { field, message: `"${field}" still contains the placeholder value "${placeholder}". Set a real value.`, fatal: false };
  }
  return null;
}

/**
 * Validates all VITE_ environment variables.
 * - Logs warnings for non-critical issues.
 * - Throws in production if fatal issues are found.
 * - In development, only warns so the dev server still starts.
 */
export function validateFrontendConfig(): FrontendEnvConfig {
  const issues: ConfigIssue[] = [];
  const isDev = import.meta.env.DEV;

  // ── VITE_NETWORK ──────────────────────────────────────────────────────────
  const rawNetwork = import.meta.env.VITE_NETWORK;
  if (rawNetwork && rawNetwork !== 'testnet' && rawNetwork !== 'mainnet') {
    issues.push({
      field: 'VITE_NETWORK',
      message: `Must be "testnet" or "mainnet". Got: "${rawNetwork}". Defaulting to "testnet".`,
      fatal: false,
    });
  }
  const network: 'testnet' | 'mainnet' = rawNetwork === 'mainnet' ? 'mainnet' : 'testnet';

  // ── VITE_API_URL ──────────────────────────────────────────────────────────
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!isDev && !apiUrl) {
    issues.push({ field: 'VITE_API_URL', message: 'VITE_API_URL is required in production.', fatal: true });
  }
  const urlIssue = checkUrl(apiUrl, 'VITE_API_URL');
  if (urlIssue) issues.push(urlIssue);

  // ── RPC URLs ──────────────────────────────────────────────────────────────
  const rpcUrlTestnet = (import.meta.env.VITE_RPC_URL_TESTNET as string | undefined) || 'https://soroban-testnet.stellar.org';
  const rpcUrlMainnet = (import.meta.env.VITE_RPC_URL_MAINNET as string | undefined) || 'https://soroban.stellar.org';

  const rpcTestnetIssue = checkUrl(rpcUrlTestnet, 'VITE_RPC_URL_TESTNET');
  if (rpcTestnetIssue) issues.push(rpcTestnetIssue);

  const rpcMainnetIssue = checkUrl(rpcUrlMainnet, 'VITE_RPC_URL_MAINNET');
  if (rpcMainnetIssue) issues.push(rpcMainnetIssue);

  // ── Contract IDs ──────────────────────────────────────────────────────────
  const contractIdTestnet =
    (import.meta.env.VITE_CONTRACT_ID_TESTNET as string | undefined) ||
    'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA';
  const contractIdMainnet = (import.meta.env.VITE_CONTRACT_ID_MAINNET as string | undefined) || '';

  const mainnetPlaceholderIssue = checkPlaceholder(contractIdMainnet, 'MAINNET_CONTRACT_ID_HERE', 'VITE_CONTRACT_ID_MAINNET');
  if (mainnetPlaceholderIssue) {
    issues.push({ ...mainnetPlaceholderIssue, fatal: network === 'mainnet' });
  }

  if (network === 'mainnet' && !contractIdMainnet) {
    issues.push({ field: 'VITE_CONTRACT_ID_MAINNET', message: 'Required when VITE_NETWORK=mainnet.', fatal: true });
  }

  // ── Network passphrases ───────────────────────────────────────────────────
  const networkPassphraseTestnet =
    (import.meta.env.VITE_NETWORK_PASSPHRASE_TESTNET as string | undefined) ||
    'Test SDF Network ; September 2015';
  const networkPassphraseMainnet =
    (import.meta.env.VITE_NETWORK_PASSPHRASE_MAINNET as string | undefined) ||
    'Public Global Stellar Network ; September 2015';

  // ── WS_PORT ───────────────────────────────────────────────────────────────
  const wsPort = (import.meta.env.VITE_WS_PORT as string | undefined) || '3002';
  const parsedWsPort = parseInt(wsPort, 10);
  if (isNaN(parsedWsPort) || parsedWsPort < 1 || parsedWsPort > 65535) {
    issues.push({ field: 'VITE_WS_PORT', message: `Must be a valid port (1–65535). Got: "${wsPort}". Defaulting to 3002.`, fatal: false });
  }

  // ── Report issues ─────────────────────────────────────────────────────────
  const fatalIssues = issues.filter((i) => i.fatal);
  const warnings = issues.filter((i) => !i.fatal);

  if (warnings.length > 0) {
    console.warn('[Config] Frontend configuration warnings:');
    warnings.forEach((w) => console.warn(`  ⚠  ${w.field}: ${w.message}`));
  }

  if (fatalIssues.length > 0) {
    const msg = fatalIssues.map((e) => `${e.field}: ${e.message}`).join('\n');
    console.error('[Config] Fatal frontend configuration errors:\n' + msg);
    // In production throw hard; in dev just warn so the dev server stays up
    if (!isDev) {
      throw new Error(`[Config] Fatal configuration error(s):\n${msg}`);
    }
  }

  return {
    network,
    apiUrl: apiUrl || 'http://localhost:3001',
    contractIdTestnet,
    contractIdMainnet,
    rpcUrlTestnet,
    rpcUrlMainnet,
    networkPassphraseTestnet,
    networkPassphraseMainnet,
    wsPort: isNaN(parsedWsPort) ? '3002' : wsPort,
  };
}

// Validated config singleton — resolved once at module load
export const frontendConfig = validateFrontendConfig();
