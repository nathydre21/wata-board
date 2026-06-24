import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';

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

  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  RATE_LIMIT_QUEUE_SIZE: number;

  ALERT_ERROR_RATE_THRESHOLD: number;
  ALERT_REQUESTS_PER_MINUTE_THRESHOLD: number;
  ALERT_RESPONSE_TIME_MS_THRESHOLD: number;

  ERROR_TRACKING_ENDPOINT?: string;
  ERROR_TRACKING_API_KEY?: string;

  ALERT_WEBHOOK_URL?: string;

  PAYMENT_WEBHOOK_URL?: string;
  PAYMENT_WEBHOOK_API_KEY?: string;

  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_EMAIL?: string;

  PAYMENT_METER_ID?: string;
  PAYMENT_AMOUNT: number;

  ADMIN_SECRET_KEY?: string;
  API_KEY: string;

  LOG_LEVEL: string;

  EMAIL_NOTIFICATION_ENABLED: boolean;
  EMAIL_HOST?: string;
  EMAIL_PORT: number;
  EMAIL_SECURE: boolean;
  EMAIL_USER?: string;
  EMAIL_PASSWORD?: string;
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;
}

const VALID_LOG_LEVELS = [
  'error',
  'warn',
  'info',
  'http',
  'verbose',
  'debug',
  'silly',
] as const;

const VALID_NODE_ENVS = [
  'development',
  'production',
  'test',
] as const;

const VALID_NETWORKS = [
  'testnet',
  'mainnet',
] as const;

const STELLAR_SECRET_KEY_REGEX =
  /^S[A-Z2-7]{55}$/;

const URL_REGEX =
  /^https?:\/\/.+/;

function isValidUrl(value: string) {
  return URL_REGEX.test(value);
}

/* ------------------------------------------------------------------ */
/* Schema System */
/* ------------------------------------------------------------------ */

type Parser<T> = (
  value: string | undefined,
  field: string
) => T;

interface SchemaField<T> {
  parser: Parser<T>;
  defaultValue?: T;
}

const stringParser: Parser<string> = (
  value,
  field
) => {
  if (!value) {
    throw new Error(
      `"${field}" is required`
    );
  }

  return value;
};

const numberParser: Parser<number> = (
  value,
  field
) => {
  const num = Number(value);

  if (
    value === undefined ||
    Number.isNaN(num)
  ) {
    throw new Error(
      `"${field}" must be a valid number`
    );
  }

  return num;
};

const booleanParser: Parser<boolean> = (
  value
) => value === 'true';

function enumParser<T extends string>(
  allowed: readonly T[]
): Parser<T> {
  return (value, field) => {
    if (
      !value ||
      !allowed.includes(value as T)
    ) {
      throw new Error(
        `"${field}" must be one of: ${allowed.join(
          ', '
        )}`
      );
    }

    return value as T;
  };
}

const CONFIG_SCHEMA = {
  PORT: {
    parser: numberParser,
    defaultValue: 3001,
  },

  NODE_ENV: {
    parser: enumParser(
      VALID_NODE_ENVS
    ),
    defaultValue: 'development',
  },

  HTTPS_ENABLED: {
    parser: booleanParser,
    defaultValue: false,
  },

  NETWORK: {
    parser: enumParser(
      VALID_NETWORKS
    ),
    defaultValue: 'testnet',
  },

  LOG_LEVEL: {
    parser: enumParser(
      VALID_LOG_LEVELS
    ),
    defaultValue: 'info',
  },

  RATE_LIMIT_WINDOW_MS: {
    parser: numberParser,
    defaultValue: 60000,
  },

  RATE_LIMIT_MAX_REQUESTS: {
    parser: numberParser,
    defaultValue: 5,
  },

  RATE_LIMIT_QUEUE_SIZE: {
    parser: numberParser,
    defaultValue: 10,
  },

  ALERT_ERROR_RATE_THRESHOLD: {
    parser: numberParser,
    defaultValue: 0.1,
  },

  ALERT_REQUESTS_PER_MINUTE_THRESHOLD: {
    parser: numberParser,
    defaultValue: 500,
  },

  ALERT_RESPONSE_TIME_MS_THRESHOLD: {
    parser: numberParser,
    defaultValue: 5000,
  },

  PAYMENT_AMOUNT: {
    parser: numberParser,
    defaultValue: 10,
  },

  EMAIL_PORT: {
    parser: numberParser,
    defaultValue: 587,
  },
};

function validateSchema() {
  const result: Record<
    string,
    unknown
  > = {};

  for (const [key, schema] of Object.entries(
    CONFIG_SCHEMA
  )) {
    try {
      const raw =
        process.env[key];

      result[key] =
        raw !== undefined
          ? schema.parser(raw, key)
          : schema.defaultValue;
    } catch (error) {
      throw new Error(
        `[Config] ${key}: ${error instanceof Error
          ? error.message
          : String(error)
        }`
      );
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Business Validation */
/* ------------------------------------------------------------------ */

function parseEnv(): EnvConfig {
  const config =
    validateSchema();

  const errors: string[] = [];

  const PORT =
    config.PORT as number;

  const NODE_ENV =
    config.NODE_ENV as
    | 'development'
    | 'production'
    | 'test';

  const HTTPS_ENABLED =
    config.HTTPS_ENABLED as boolean;

  const NETWORK =
    config.NETWORK as
    | 'testnet'
    | 'mainnet';

  const LOG_LEVEL =
    config.LOG_LEVEL as string;

  const SSL_KEY_PATH =
    process.env.SSL_KEY_PATH;

  const SSL_CERT_PATH =
    process.env.SSL_CERT_PATH;

  const SSL_CA_PATH =
    process.env.SSL_CA_PATH;

  if (HTTPS_ENABLED) {
    if (!SSL_KEY_PATH) {
      errors.push(
        'SSL_KEY_PATH is required when HTTPS_ENABLED=true'
      );
    }

    if (!SSL_CERT_PATH) {
      errors.push(
        'SSL_CERT_PATH is required when HTTPS_ENABLED=true'
      );
    }
  }

  const RPC_URL_TESTNET =
    process.env
      .RPC_URL_TESTNET ??
    'https://soroban-testnet.stellar.org';

  const RPC_URL_MAINNET =
    process.env
      .RPC_URL_MAINNET ??
    'https://soroban.stellar.org';

  if (
    !isValidUrl(
      RPC_URL_TESTNET
    )
  ) {
    errors.push(
      'RPC_URL_TESTNET must be a valid URL'
    );
  }

  if (
    !isValidUrl(
      RPC_URL_MAINNET
    )
  ) {
    errors.push(
      'RPC_URL_MAINNET must be a valid URL'
    );
  }

  const API_KEY =
    process.env.API_KEY;

  if (
    NODE_ENV ===
    'production' &&
    !API_KEY
  ) {
    errors.push(
      'API_KEY is required in production'
    );
  }

  const ADMIN_SECRET_KEY =
    process.env.ADMIN_SECRET_KEY;

  if (
    ADMIN_SECRET_KEY &&
    !STELLAR_SECRET_KEY_REGEX.test(
      ADMIN_SECRET_KEY
    )
  ) {
    errors.push(
      'ADMIN_SECRET_KEY is not a valid Stellar secret key'
    );
  }

  if (errors.length) {
    throw new Error(
      [
        '[Config] Configuration validation failed:',
        ...errors.map(
          e => `- ${e}`
        ),
      ].join('\n')
    );
  }

  return {
    PORT,
    NODE_ENV,

    HTTPS_ENABLED,

    SSL_KEY_PATH,
    SSL_CERT_PATH,
    SSL_CA_PATH,

    ALLOWED_ORIGINS:
      process.env.ALLOWED_ORIGINS
        ?.split(',')
        .map(v => v.trim())
        .filter(Boolean) ?? [],

    FRONTEND_URL:
      process.env.FRONTEND_URL,

    NETWORK,

    NETWORK_PASSPHRASE_MAINNET:
      process.env
        .NETWORK_PASSPHRASE_MAINNET ??
      'Public Global Stellar Network ; September 2015',

    CONTRACT_ID_MAINNET:
      process.env
        .CONTRACT_ID_MAINNET ?? '',

    RPC_URL_MAINNET,

    NETWORK_PASSPHRASE_TESTNET:
      process.env
        .NETWORK_PASSPHRASE_TESTNET ??
      'Test SDF Network ; September 2015',

    CONTRACT_ID_TESTNET:
      process.env
        .CONTRACT_ID_TESTNET ??
      'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',

    RPC_URL_TESTNET,

    RATE_LIMIT_WINDOW_MS:
      config.RATE_LIMIT_WINDOW_MS as number,

    RATE_LIMIT_MAX_REQUESTS:
      config.RATE_LIMIT_MAX_REQUESTS as number,

    RATE_LIMIT_QUEUE_SIZE:
      config.RATE_LIMIT_QUEUE_SIZE as number,

    ALERT_ERROR_RATE_THRESHOLD:
      config.ALERT_ERROR_RATE_THRESHOLD as number,

    ALERT_REQUESTS_PER_MINUTE_THRESHOLD:
      config.ALERT_REQUESTS_PER_MINUTE_THRESHOLD as number,

    ALERT_RESPONSE_TIME_MS_THRESHOLD:
      config.ALERT_RESPONSE_TIME_MS_THRESHOLD as number,

    ERROR_TRACKING_ENDPOINT:
      process.env.ERROR_TRACKING_ENDPOINT,

    ERROR_TRACKING_API_KEY:
      process.env.ERROR_TRACKING_API_KEY,

    ALERT_WEBHOOK_URL:
      process.env.ALERT_WEBHOOK_URL,

    PAYMENT_WEBHOOK_URL:
      process.env.PAYMENT_WEBHOOK_URL,

    PAYMENT_WEBHOOK_API_KEY:
      process.env.PAYMENT_WEBHOOK_API_KEY,

    VAPID_PUBLIC_KEY:
      process.env.VAPID_PUBLIC_KEY,

    VAPID_PRIVATE_KEY:
      process.env.VAPID_PRIVATE_KEY,

    VAPID_EMAIL:
      process.env.VAPID_EMAIL,

    PAYMENT_METER_ID:
      process.env.PAYMENT_METER_ID,

    PAYMENT_AMOUNT:
      config.PAYMENT_AMOUNT as number,

    ADMIN_SECRET_KEY,

    API_KEY:
      API_KEY ?? '',

    LOG_LEVEL,

    EMAIL_NOTIFICATION_ENABLED:
      process.env
        .EMAIL_NOTIFICATION_ENABLED ===
      'true',

    EMAIL_HOST:
      process.env.EMAIL_HOST,

    EMAIL_PORT:
      config.EMAIL_PORT as number,

    EMAIL_SECURE:
      process.env.EMAIL_SECURE ===
      'true',

    EMAIL_USER:
      process.env.EMAIL_USER,

    EMAIL_PASSWORD:
      process.env.EMAIL_PASSWORD,

    EMAIL_FROM_ADDRESS:
      process.env.EMAIL_FROM_ADDRESS ??
      'noreply@wata-board.com',

    EMAIL_FROM_NAME:
      process.env.EMAIL_FROM_NAME ??
      'Wata Board',
  };
}

export const envConfig =
  parseEnv();

import('../utils/logger').then(
  ({ default: logger }) => {
    logger.level =
      envConfig.LOG_LEVEL;
  }
);