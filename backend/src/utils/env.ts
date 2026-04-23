import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  HTTPS_ENABLED: boolean;
  SSL_KEY_PATH?: string;
  SSL_CERT_PATH?: string;
  SSL_CA_PATH?: string;
  ALLOWED_ORIGINS: string[];
  FRONTEND_URL?: string;
  NETWORK: 'testnet' | 'mainnet';

  NETWORK_PASSPHRASE_MAINNET: string;
  CONTRACT_ID_MAINNET: string;
  RPC_URL_MAINNET: string;

  NETWORK_PASSPHRASE_TESTNET: string;
  CONTRACT_ID_TESTNET: string;
  RPC_URL_TESTNET: string;

  ADMIN_SECRET_KEY: string;
  API_KEY: string;
  LOG_LEVEL: string;
}

// ── Validation helpers ────────────────────────────────────────────────────────

const VALID_LOG_LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
const VALID_NODE_ENVS = ['development', 'production', 'test'];
const STELLAR_SECRET_KEY_REGEX = /^S[A-Z2-7]{55}$/;
const URL_REGEX = /^https?:\/\/.+/;

interface ValidationError {
  field: string;
  message: string;
  fatal: boolean;
}

function validateUrl(value: string, field: string, fatal = false): ValidationError | null {
  if (!URL_REGEX.test(value)) {
    return { field, message: `"${field}" must be a valid URL starting with http:// or https://. Got: "${value}"`, fatal };
  }
  return null;
}

function validatePort(value: number, field: string): ValidationError | null {
  if (isNaN(value) || value < 1 || value > 65535) {
    return { field, message: `"${field}" must be a valid port number (1–65535). Got: "${value}"`, fatal: true };
  }
  return null;
}

function validateStellarSecretKey(value: string, field: string): ValidationError | null {
  if (!STELLAR_SECRET_KEY_REGEX.test(value)) {
    return { field, message: `"${field}" does not look like a valid Stellar secret key (should start with 'S' and be 56 chars).`, fatal: true };
  }
  return null;
}

function validateStellarContractId(value: string, field: string): ValidationError | null {
  // Stellar contract IDs are 56-char base32 strings starting with 'C'
  if (!value || value === 'MAINNET_CONTRACT_ID_HERE' || value.length < 10) {
    return { field, message: `"${field}" appears to be a placeholder or empty. Set a real contract ID.`, fatal: false };
  }
  return null;
}

// ── Main parser & validator ───────────────────────────────────────────────────

function parseEnv(): EnvConfig {
  const errors: ValidationError[] = [];

  // ── Required fields ──────────────────────────────────────────────────────

  const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;
  if (!ADMIN_SECRET_KEY) {
    errors.push({ field: 'ADMIN_SECRET_KEY', message: 'ADMIN_SECRET_KEY is required.', fatal: true });
  }

  const API_KEY = process.env.API_KEY;
  if (!API_KEY) {
    errors.push({ field: 'API_KEY', message: 'API_KEY is required to secure backend endpoints.', fatal: true });
  } else if (API_KEY.length < 16) {
    errors.push({ field: 'API_KEY', message: 'API_KEY is too short — use at least 16 characters.', fatal: true });
  }

  // ── Port ─────────────────────────────────────────────────────────────────

  const PORT = parseInt(process.env.PORT || '3001', 10);
  const portError = validatePort(PORT, 'PORT');
  if (portError) errors.push(portError);

  // ── NODE_ENV ─────────────────────────────────────────────────────────────

  const NODE_ENV = process.env.NODE_ENV || 'development';
  if (!VALID_NODE_ENVS.includes(NODE_ENV)) {
    errors.push({
      field: 'NODE_ENV',
      message: `"NODE_ENV" must be one of: ${VALID_NODE_ENVS.join(', ')}. Got: "${NODE_ENV}"`,
      fatal: false,
    });
  }

  // ── HTTPS / SSL ───────────────────────────────────────────────────────────

  const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
  const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
  const SSL_CERT_PATH = process.env.SSL_CERT_PATH;
  const SSL_CA_PATH = process.env.SSL_CA_PATH;

  if (HTTPS_ENABLED) {
    if (!SSL_KEY_PATH) {
      errors.push({ field: 'SSL_KEY_PATH', message: 'SSL_KEY_PATH is required when HTTPS_ENABLED=true.', fatal: true });
    }
    if (!SSL_CERT_PATH) {
      errors.push({ field: 'SSL_CERT_PATH', message: 'SSL_CERT_PATH is required when HTTPS_ENABLED=true.', fatal: true });
    }
  }

  // ── Network ───────────────────────────────────────────────────────────────

  const rawNetwork = process.env.NETWORK || 'testnet';
  if (rawNetwork !== 'testnet' && rawNetwork !== 'mainnet') {
    errors.push({
      field: 'NETWORK',
      message: `"NETWORK" must be "testnet" or "mainnet". Got: "${rawNetwork}"`,
      fatal: true,
    });
  }
  const NETWORK = rawNetwork as 'testnet' | 'mainnet';

  // ── Network-specific config ───────────────────────────────────────────────

  const RPC_URL_TESTNET = process.env.RPC_URL_TESTNET || 'https://soroban-testnet.stellar.org';
  const RPC_URL_MAINNET = process.env.RPC_URL_MAINNET || 'https://soroban.stellar.org';
  const CONTRACT_ID_TESTNET = process.env.CONTRACT_ID_TESTNET || 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA';
  const CONTRACT_ID_MAINNET = process.env.CONTRACT_ID_MAINNET || '';

  const rpcTestnetError = validateUrl(RPC_URL_TESTNET, 'RPC_URL_TESTNET');
  if (rpcTestnetError) errors.push(rpcTestnetError);

  const rpcMainnetError = validateUrl(RPC_URL_MAINNET, 'RPC_URL_MAINNET');
  if (rpcMainnetError) errors.push(rpcMainnetError);

  // Warn if mainnet contract ID is a placeholder (fatal only when running on mainnet)
  const contractMainnetError = validateStellarContractId(CONTRACT_ID_MAINNET, 'CONTRACT_ID_MAINNET');
  if (contractMainnetError) {
    errors.push({ ...contractMainnetError, fatal: NETWORK === 'mainnet' });
  }

  // ── ALLOWED_ORIGINS ───────────────────────────────────────────────────────

  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  if (NODE_ENV === 'production' && ALLOWED_ORIGINS.length === 0) {
    errors.push({
      field: 'ALLOWED_ORIGINS',
      message: 'ALLOWED_ORIGINS should be set in production to restrict CORS.',
      fatal: false,
    });
  }

  // ── LOG_LEVEL ─────────────────────────────────────────────────────────────

  const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
  if (!VALID_LOG_LEVELS.includes(LOG_LEVEL)) {
    errors.push({
      field: 'LOG_LEVEL',
      message: `"LOG_LEVEL" must be one of: ${VALID_LOG_LEVELS.join(', ')}. Got: "${LOG_LEVEL}". Defaulting to "info".`,
      fatal: false,
    });
  }

  // ── Stellar secret key format ─────────────────────────────────────────────

  if (ADMIN_SECRET_KEY) {
    const keyError = validateStellarSecretKey(ADMIN_SECRET_KEY, 'ADMIN_SECRET_KEY');
    if (keyError) errors.push(keyError);
  }

  // ── Report errors ─────────────────────────────────────────────────────────

  const fatalErrors = errors.filter((e) => e.fatal);
  const warnings = errors.filter((e) => !e.fatal);

  if (warnings.length > 0) {
    console.warn('[Config] Configuration warnings:');
    warnings.forEach((w) => console.warn(`  ⚠  ${w.field}: ${w.message}`));
  }

  if (fatalErrors.length > 0) {
    console.error('[Config] Fatal configuration errors — cannot start:');
    fatalErrors.forEach((e) => console.error(`  ✖  ${e.field}: ${e.message}`));
    throw new Error(
      `[Config] ${fatalErrors.length} fatal configuration error(s) found. Fix the above issues and restart.`
    );
  }

  return {
    PORT,
    NODE_ENV,
    HTTPS_ENABLED,
    SSL_KEY_PATH,
    SSL_CERT_PATH,
    SSL_CA_PATH,
    ALLOWED_ORIGINS,
    FRONTEND_URL: process.env.FRONTEND_URL,
    NETWORK,
    ADMIN_SECRET_KEY: ADMIN_SECRET_KEY!,
    API_KEY: API_KEY!,
    LOG_LEVEL: VALID_LOG_LEVELS.includes(LOG_LEVEL) ? LOG_LEVEL : 'info',

    NETWORK_PASSPHRASE_MAINNET:
      process.env.NETWORK_PASSPHRASE_MAINNET || 'Public Global Stellar Network ; September 2015',
    CONTRACT_ID_MAINNET,
    RPC_URL_MAINNET,

    NETWORK_PASSPHRASE_TESTNET:
      process.env.NETWORK_PASSPHRASE_TESTNET || 'Test SDF Network ; September 2015',
    CONTRACT_ID_TESTNET,
    RPC_URL_TESTNET,
  };
}

// Export a singleton configuration object — validated once at startup
export const envConfig = parseEnv();

// Sync the validated LOG_LEVEL into the already-instantiated logger
// (logger bootstraps with process.env.LOG_LEVEL before validation runs)
import('../utils/logger').then(({ default: logger }) => {
  logger.level = envConfig.LOG_LEVEL;
});
