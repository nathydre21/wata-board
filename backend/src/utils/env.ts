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

  // Legacy support - deprecated, use secureEnvConfig instead
  ADMIN_SECRET_KEY?: string;
  API_KEY: string;
}

function parseEnv(): EnvConfig {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
  const NETWORK = (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';
  const PORT = parseInt(process.env.PORT || '3001', 10);

  // Legacy support - ADMIN_SECRET_KEY is now optional
  // Use secureEnvConfig for secure key management instead
  const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;

  const API_KEY = process.env.API_KEY;
  if (!API_KEY) {
    throw new Error('CRITICAL: API_KEY is missing from environment variables. An API key is required to secure the backend endpoints.');
  }

  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  return {
    PORT,
    NODE_ENV,
    HTTPS_ENABLED,
    SSL_KEY_PATH: process.env.SSL_KEY_PATH,
    SSL_CERT_PATH: process.env.SSL_CERT_PATH,
    SSL_CA_PATH: process.env.SSL_CA_PATH,
    ALLOWED_ORIGINS,
    FRONTEND_URL: process.env.FRONTEND_URL,
    NETWORK,
    ADMIN_SECRET_KEY,
    API_KEY,

    NETWORK_PASSPHRASE_MAINNET: process.env.NETWORK_PASSPHRASE_MAINNET || 'Public Global Stellar Network ; September 2015',
    CONTRACT_ID_MAINNET: process.env.CONTRACT_ID_MAINNET || '',
    RPC_URL_MAINNET: process.env.RPC_URL_MAINNET || 'https://soroban.stellar.org',

    NETWORK_PASSPHRASE_TESTNET: process.env.NETWORK_PASSPHRASE_TESTNET || 'Test SDF Network ; September 2015',
    CONTRACT_ID_TESTNET: process.env.CONTRACT_ID_TESTNET || 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
    RPC_URL_TESTNET: process.env.RPC_URL_TESTNET || 'https://soroban-testnet.stellar.org',
  };
}

// Export a singleton configuration object
export const envConfig = parseEnv();
