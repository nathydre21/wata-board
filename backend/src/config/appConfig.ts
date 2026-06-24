/**
 * Environment-Specific Configuration Loader (#200)
 *
 * Loads configuration based on NODE_ENV:
 * - development
 * - production
 * - test
 * - default
 */

import { config as dotenvConfig } from 'dotenv';
import { envConfig } from '../utils/env';

dotenvConfig();

export interface AppConfig {
  server: {
    port: number;
    nodeEnv: 'development' | 'production' | 'test';
    httpsEnabled: boolean;
    sslKeyPath?: string;
    sslCertPath?: string;
    sslCaPath?: string;
  };

  cors: {
    allowedOrigins: string[];
    frontendUrl: string;
  };

  network: {
    type: 'testnet' | 'mainnet';
    contractId: string;
    rpcUrl: string;
    networkPassphrase: string;
  };

  security: {
    keyMasterPassword?: string;
    adminSecretKey?: string;
  };

  rateLimits: {
    tierLimits: Record<
      string,
      {
        windowMs: number;
        maxRequests: number;
        queueSize: number;
      }
    >;
  };

  monitoring: {
    enabled: boolean;
    metricsRetentionMs: number;
    alertThresholds: {
      errorRate: number;
      requestsPerMinute: number;
      responseTimeMs: number;
    };
  };
}

const defaultConfig: AppConfig = {
  server: {
    port: envConfig.PORT,
    nodeEnv: envConfig.NODE_ENV,
    httpsEnabled: envConfig.HTTPS_ENABLED,
    sslKeyPath: envConfig.SSL_KEY_PATH,
    sslCertPath: envConfig.SSL_CERT_PATH,
    sslCaPath: envConfig.SSL_CA_PATH,
  },

  cors: {
    allowedOrigins:
      envConfig.ALLOWED_ORIGINS.length > 0
        ? envConfig.ALLOWED_ORIGINS
        : ['http://localhost:3000', 'http://localhost:5173'],

    frontendUrl:
      envConfig.FRONTEND_URL ??
      'http://localhost:5173',
  },

  network: {
    type: envConfig.NETWORK,

    contractId:
      envConfig.NETWORK === 'mainnet'
        ? envConfig.CONTRACT_ID_MAINNET
        : envConfig.CONTRACT_ID_TESTNET,

    rpcUrl:
      envConfig.NETWORK === 'mainnet'
        ? envConfig.RPC_URL_MAINNET
        : envConfig.RPC_URL_TESTNET,

    networkPassphrase:
      envConfig.NETWORK === 'mainnet'
        ? envConfig.NETWORK_PASSPHRASE_MAINNET
        : envConfig.NETWORK_PASSPHRASE_TESTNET,
  },

  security: {
    keyMasterPassword:
      process.env.KEY_MASTER_PASSWORD,
    adminSecretKey:
      envConfig.ADMIN_SECRET_KEY,
  },

  rateLimits: {
    tierLimits: {
      anonymous: {
        windowMs: 60000,
        maxRequests: 5,
        queueSize: 5,
      },

      verified: {
        windowMs: 60000,
        maxRequests: 15,
        queueSize: 10,
      },

      premium: {
        windowMs: 60000,
        maxRequests: 50,
        queueSize: 25,
      },

      admin: {
        windowMs: 60000,
        maxRequests: 200,
        queueSize: 50,
      },
    },
  },

  monitoring: {
    enabled: true,

    metricsRetentionMs:
      10 * 60 * 1000,

    alertThresholds: {
      errorRate: 0.1,
      requestsPerMinute: 500,
      responseTimeMs: 5000,
    },
  },
};

const envConfigs: Record<
  string,
  Partial<AppConfig>
> = {
  development: {
    server: {
      ...defaultConfig.server,
      port: 3001,
      httpsEnabled: false,
    },

    cors: {
      allowedOrigins: [
        'http://localhost:3000',
        'http://localhost:5173',
      ],

      frontendUrl:
        'http://localhost:5173',
    },

    network: {
      type: 'testnet',

      contractId:
        envConfig.CONTRACT_ID_TESTNET,

      rpcUrl:
        envConfig.RPC_URL_TESTNET,

      networkPassphrase:
        envConfig.NETWORK_PASSPHRASE_TESTNET,
    },

    monitoring: {
      enabled: true,

      metricsRetentionMs:
        5 * 60 * 1000,

      alertThresholds: {
        errorRate: 0.05,
        requestsPerMinute: 100,
        responseTimeMs: 2000,
      },
    },
  },

  production: {
    server: {
      ...defaultConfig.server,

      port: envConfig.PORT,

      httpsEnabled: true,

      sslKeyPath:
        envConfig.SSL_KEY_PATH ||
        '/etc/letsencrypt/live/yourdomain.com/privkey.pem',

      sslCertPath:
        envConfig.SSL_CERT_PATH ||
        '/etc/letsencrypt/live/yourdomain.com/fullchain.pem',

      sslCaPath:
        envConfig.SSL_CA_PATH ||
        '/etc/letsencrypt/live/yourdomain.com/chain.pem',
    },

    cors: {
      allowedOrigins:
        envConfig.ALLOWED_ORIGINS,

      frontendUrl:
        envConfig.FRONTEND_URL || '',
    },

    network: {
      type: 'mainnet',

      contractId:
        envConfig.CONTRACT_ID_MAINNET,

      rpcUrl:
        envConfig.RPC_URL_MAINNET,

      networkPassphrase:
        envConfig.NETWORK_PASSPHRASE_MAINNET,
    },

    monitoring: {
      enabled: true,

      metricsRetentionMs:
        60 * 60 * 1000,

      alertThresholds: {
        errorRate: 0.05,
        requestsPerMinute: 1000,
        responseTimeMs: 3000,
      },
    },
  },

  test: {
    server: {
      ...defaultConfig.server,
      port: 3002,
      httpsEnabled: false,
    },

    cors: {
      allowedOrigins: [
        'http://localhost:3001',
      ],

      frontendUrl:
        'http://localhost:3001',
    },

    network: {
      type: 'testnet',

      contractId:
        'TEST_CONTRACT_ID',

      rpcUrl:
        envConfig.RPC_URL_TESTNET,

      networkPassphrase:
        envConfig.NETWORK_PASSPHRASE_TESTNET,
    },

    monitoring: {
      enabled: false,

      metricsRetentionMs:
        60 * 1000,

      alertThresholds: {
        errorRate: 0.5,
        requestsPerMinute: 10,
        responseTimeMs: 10000,
      },
    },
  },
};

/**
 * Load configuration based on NODE_ENV
 */
export function loadConfig(): AppConfig {
  const environment =
    envConfig.NODE_ENV;

  const environmentConfig =
    envConfigs[environment] ?? {};

  return deepMerge(
    defaultConfig,
    environmentConfig
  );
}

/**
 * Deep merge configuration objects
 */
function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    if (
      Object.prototype.hasOwnProperty.call(
        source,
        key
      )
    ) {
      const sourceValue =
        source[key];

      const targetValue =
        result[key];

      if (
        isObject(sourceValue) &&
        isObject(targetValue)
      ) {
        result[key] = deepMerge(
          targetValue,
          sourceValue
        );
      } else if (
        sourceValue !== undefined
      ) {
        result[key] = sourceValue;
      }
    }
  }

  return result;
}

function isObject(
  value: unknown
): value is Record<string, any> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

export const config =
  loadConfig();
