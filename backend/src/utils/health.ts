import os from 'os';
import { Horizon } from '@stellar/stellar-sdk';
import logger from './logger';

export interface HealthStatus {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  system: {
    cpu: {
      load: number[];
      cores: number;
    };
    memory: {
      total: number;
      free: number;
      processUsage: NodeJS.MemoryUsage;
    };
  };
  dependencies: {
    stellar: {
      status: 'UP' | 'DOWN' | 'UNKNOWN';
      network: string;
      responseTimeMs?: number;
      error?: string;
    };
  };
  config: {
    httpsEnabled: boolean;
    rateLimitEnabled: boolean;
    secretKeyConfigured: boolean;
  };
}

/**
 * Service to aggregate system and application health metrics.
 */
export class HealthService {
  private static startTime: number = Date.now();

  /**
   * Performs a comprehensive check of all system dependencies.
   */
  static async getFullHealth(): Promise<HealthStatus> {
    const start = Date.now();
    const stellarHealth = await this.checkStellarConnectivity();
    
    // Overall status is DEGRADED if key dependencies have issues
    let overallStatus: 'UP' | 'DOWN' | 'DEGRADED' = 'UP';
    if (stellarHealth.status === 'DOWN') {
      overallStatus = 'DEGRADED';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      system: {
        cpu: {
          load: os.loadavg(),
          cores: os.cpus().length,
        },
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          processUsage: process.memoryUsage(),
        },
      },
      dependencies: {
        stellar: stellarHealth,
      },
      config: {
        httpsEnabled: process.env.HTTPS_ENABLED === 'true',
        rateLimitEnabled: true, // Always on in this app
        secretKeyConfigured: !!process.env.SECRET_KEY,
      },
    };
  }

  /**
   * Basic liveness check (fast, no heavy resource checking).
   */
  static getLiveness() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness check ensures the app is ready to take traffic.
   */
  static async getReadiness() {
    const stellarHealth = await this.checkStellarConnectivity();
    return {
      status: stellarHealth.status === 'UP' ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      service: 'wata-board-api',
      ready: stellarHealth.status === 'UP',
    };
  }

  private static async checkStellarConnectivity() {
    const network = process.env.NETWORK || 'testnet';
    const rpcUrl = network === 'mainnet' 
      ? process.env.RPC_URL_MAINNET || 'https://soroban.stellar.org'
      : process.env.RPC_URL_TESTNET || 'https://soroban-testnet.stellar.org';

    const horizonUrl = rpcUrl.replace('soroban', 'horizon');
    const start = Date.now();

    try {
      const server = new Horizon.Server(horizonUrl);
      // Basic call to check horizon status
      await server.root();
      
      return {
        status: 'UP' as const,
        network,
        responseTimeMs: Date.now() - start,
      };
    } catch (error: any) {
      logger.error('Health check: Stellar Horizon connectivity failed', { error: error.message, url: horizonUrl });
      return {
        status: 'DOWN' as const,
        network,
        error: error.message,
      };
    }
  }
}
