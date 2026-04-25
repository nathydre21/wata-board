/**
 * Configuration Versioning (#configuration-versioning)
 *
 * Every time a configuration key or default value changes, bump CONFIG_VERSION
 * and add an entry to CONFIG_CHANGELOG so there is a traceable history of what
 * changed, when, and why.
 *
 * Schema:
 *   major – breaking change (removed/renamed key, incompatible default)
 *   minor – new optional key added
 *   patch – default value tweak, comment update, non-breaking adjustment
 */

export interface ConfigChangeEntry {
  version: string;
  date: string;
  component: 'backend' | 'frontend' | 'contract' | 'all';
  description: string;
  keys?: string[];
}

/** Current configuration schema version */
export const CONFIG_VERSION = '1.0.0';

/** Full changelog – newest entry first */
export const CONFIG_CHANGELOG: ConfigChangeEntry[] = [
  {
    version: '1.0.0',
    date: '2026-04-23',
    component: 'all',
    description: 'Initial versioned configuration baseline. Captures all existing env vars, network config, and rate-limit settings.',
    keys: [
      'PORT', 'NODE_ENV', 'HTTPS_ENABLED', 'NETWORK',
      'CONTRACT_ID_TESTNET', 'CONTRACT_ID_MAINNET',
      'RPC_URL_TESTNET', 'RPC_URL_MAINNET',
      'NETWORK_PASSPHRASE_TESTNET', 'NETWORK_PASSPHRASE_MAINNET',
      'ALLOWED_ORIGINS', 'FRONTEND_URL',
      'ADMIN_SECRET_KEY', 'API_KEY',
      'TIER_RATE_LIMITS',
    ],
  },
];

/** Returns the most recent changelog entry */
export function getLatestChange(): ConfigChangeEntry {
  return CONFIG_CHANGELOG[0];
}

/** Returns the full version history */
export function getVersionHistory(): ConfigChangeEntry[] {
  return CONFIG_CHANGELOG;
}
