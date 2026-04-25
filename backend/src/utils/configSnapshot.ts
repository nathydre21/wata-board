/**
 * Configuration Snapshot Utility
 *
 * Captures a sanitised (no secrets) snapshot of the active configuration at
 * startup, computes a deterministic hash, and logs a diff whenever the hash
 * changes between restarts (requires a persistent snapshot file).
 *
 * The snapshot file is written to `logs/config-snapshot.json` so it survives
 * process restarts and can be inspected or committed for audit purposes.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from './logger';
import { CONFIG_VERSION } from '../config/configVersion';
import { TIER_RATE_LIMITS } from '../config/rateLimits';

export interface ConfigSnapshot {
  configVersion: string;
  capturedAt: string;
  hash: string;
  values: Record<string, unknown>;
}

const SNAPSHOT_PATH = path.join('logs', 'config-snapshot.json');

/** Build a sanitised config map from the current environment */
function buildConfigValues(): Record<string, unknown> {
  const env = process.env;

  const raw: Record<string, unknown> = {
    PORT: env.PORT || '3001',
    NODE_ENV: env.NODE_ENV || 'development',
    HTTPS_ENABLED: env.HTTPS_ENABLED || 'false',
    NETWORK: env.NETWORK || 'testnet',
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS || '',
    FRONTEND_URL: env.FRONTEND_URL || '',
    CONTRACT_ID_TESTNET: env.CONTRACT_ID_TESTNET || 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
    CONTRACT_ID_MAINNET: env.CONTRACT_ID_MAINNET || 'MAINNET_CONTRACT_ID_HERE',
    RPC_URL_TESTNET: env.RPC_URL_TESTNET || 'https://soroban-testnet.stellar.org',
    RPC_URL_MAINNET: env.RPC_URL_MAINNET || 'https://soroban.stellar.org',
    NETWORK_PASSPHRASE_TESTNET: env.NETWORK_PASSPHRASE_TESTNET || 'Test SDF Network ; September 2015',
    NETWORK_PASSPHRASE_MAINNET: env.NETWORK_PASSPHRASE_MAINNET || 'Public Global Stellar Network ; September 2015',
    // Secrets are never stored — only their presence is recorded
    ADMIN_SECRET_KEY: env.ADMIN_SECRET_KEY ? '[SET]' : '[MISSING]',
    API_KEY: env.API_KEY ? '[SET]' : '[MISSING]',
    // Rate limit tiers (static config)
    TIER_RATE_LIMITS: TIER_RATE_LIMITS,
  };

  return raw;
}

/** Compute a SHA-256 hash of the serialised config values */
function hashConfig(values: Record<string, unknown>): string {
  // Build a new object with sorted top-level keys so the hash is deterministic
  // regardless of insertion order. Use null replacer so nested objects are
  // fully serialised (passing a key array as replacer would silently drop
  // nested keys that aren't in the top-level list).
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(values).sort()) {
    sorted[key] = values[key];
  }
  const serialised = JSON.stringify(sorted);
  return crypto.createHash('sha256').update(serialised).digest('hex').slice(0, 16);
}

/** Load the previously persisted snapshot, or null if none exists */
function loadPreviousSnapshot(): ConfigSnapshot | null {
  try {
    if (!fs.existsSync(SNAPSHOT_PATH)) return null;
    const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
    return JSON.parse(raw) as ConfigSnapshot;
  } catch {
    return null;
  }
}

/** Persist the current snapshot to disk */
function persistSnapshot(snapshot: ConfigSnapshot): void {
  try {
    const dir = path.dirname(SNAPSHOT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch (err) {
    logger.warn('ConfigSnapshot: could not persist snapshot file', { error: err });
  }
}

/** Compute a human-readable diff between two config value maps */
function diffConfigs(
  prev: Record<string, unknown>,
  curr: Record<string, unknown>,
): Array<{ key: string; from: unknown; to: unknown }> {
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const changes: Array<{ key: string; from: unknown; to: unknown }> = [];

  for (const key of allKeys) {
    const prevVal = JSON.stringify(prev[key]);
    const currVal = JSON.stringify(curr[key]);
    if (prevVal !== currVal) {
      changes.push({ key, from: prev[key], to: curr[key] });
    }
  }

  return changes;
}

/**
 * Capture the current configuration snapshot, compare it with the previous
 * one, log any differences, and persist the new snapshot.
 *
 * Call this once during server startup (after env vars are loaded).
 */
export function captureAndTrackConfig(): ConfigSnapshot {
  const values = buildConfigValues();
  const hash = hashConfig(values);
  const snapshot: ConfigSnapshot = {
    configVersion: CONFIG_VERSION,
    capturedAt: new Date().toISOString(),
    hash,
    values,
  };

  const previous = loadPreviousSnapshot();

  if (!previous) {
    logger.info('ConfigSnapshot: initial snapshot recorded', {
      configVersion: CONFIG_VERSION,
      hash,
    });
  } else if (previous.hash !== hash) {
    const diff = diffConfigs(previous.values, values);
    logger.warn('ConfigSnapshot: configuration changed since last startup', {
      previousHash: previous.hash,
      currentHash: hash,
      previousVersion: previous.configVersion,
      currentVersion: CONFIG_VERSION,
      changedKeys: diff.map((d) => d.key),
      diff,
    });
  } else {
    logger.info('ConfigSnapshot: configuration unchanged', {
      configVersion: CONFIG_VERSION,
      hash,
    });
  }

  persistSnapshot(snapshot);
  return snapshot;
}

/** Return the current in-memory snapshot without persisting */
export function getCurrentSnapshot(): ConfigSnapshot {
  const values = buildConfigValues();
  return {
    configVersion: CONFIG_VERSION,
    capturedAt: new Date().toISOString(),
    hash: hashConfig(values),
    values,
  };
}
