import os from 'os';
import { Horizon } from '@stellar/stellar-sdk';
import https from 'https';
import http from 'http';
import logger from './logger';
import { envConfig } from './env';
import { database } from './database';

export interface DependencyHealth {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  responseTimeMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface HealthStatus {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  service: string;
  system: {
    cpu: { load: number[]; cores: number };
    memory: { total: number; free: number; processUsage: NodeJS.MemoryUsage };
    disk: { freeBytes: number; usedPercent: number };
  };
  dependencies: {
    stellar: DependencyHealth;
    sorobanRpc: DependencyHealth;
    database: DependencyHealth;
  };
  config: {
    httpsEnabled: boolean;
    rateLimitEnabled: boolean;
    secretKeyConfigured: boolean;
    network: string;
  };
}

export interface LivenessResponse {
  status: 'UP';
  timestamp: string;
  service: string;
}

export interface ReadinessResponse {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  timestamp: string;
  service: string;
  ready: boolean;
  checks: {
    database: DependencyHealth;
    stellar: DependencyHealth;
    sorobanRpc: DependencyHealth;
  };
}

async function httpGet(url: string, timeout = 5000): Promise<{ success: boolean; responseTime: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    const req = client.get(url, { timeout }, (res) => {
      resolve({ success: res.statusCode === 200, responseTime: Date.now() - start });
      req.destroy();
    });
    req.on('error', (e) => resolve({ success: false, responseTime: Date.now() - start, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, responseTime: Date.now() - start, error: 'Timeout' }); });
  });
}

class HealthService {
  private static startTime: number = Date.now();
  private static serviceName = 'wata-board-api';

  static async getFullHealth(): Promise<HealthStatus> {
    const [stellarHealth, sorobanHealth, databaseHealth] = await Promise.all([
      this.checkStellarConnectivity(),
      this.checkSorobanRpc(),
      this.checkDatabase(),
    ]);

    let overallStatus: 'UP' | 'DOWN' | 'DEGRADED' = 'UP';
    const downDeps = [stellarHealth, sorobanHealth, databaseHealth].filter((d) => d.status === 'DOWN').length;
    const degradedDeps = [stellarHealth, sorobanHealth, databaseHealth].filter((d) => d.status === 'DEGRADED').length;

    if (downDeps > 0) overallStatus = downDeps >= 2 ? 'DOWN' : 'DEGRADED';
    else if (degradedDeps > 0) overallStatus = 'DEGRADED';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      environment: envConfig.NODE_ENV || 'development',
      service: this.serviceName,
      system: {
        cpu: { load: os.loadavg(), cores: os.cpus().length },
        memory: { total: os.totalmem(), free: os.freemem(), processUsage: process.memoryUsage() },
        disk: this.getDiskInfo(),
      },
      dependencies: { stellar: stellarHealth, sorobanRpc: sorobanHealth, database: databaseHealth },
      config: {
        httpsEnabled: envConfig.HTTPS_ENABLED || false,
        rateLimitEnabled: true,
        secretKeyConfigured: !!envConfig.ADMIN_SECRET_KEY,
        network: envConfig.NETWORK || 'testnet',
      },
    };
  }

  static getLiveness(): LivenessResponse {
    return { status: 'UP', timestamp: new Date().toISOString(), service: this.serviceName };
  }

  static async getReadiness(): Promise<ReadinessResponse> {
    const [databaseHealth, stellarHealth, sorobanHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkStellarConnectivity(),
      this.checkSorobanRpc(),
    ]);

    const isReady = databaseHealth.status === 'UP' && stellarHealth.status === 'UP' && sorobanHealth.status === 'UP';
    let overallStatus: 'UP' | 'DOWN' | 'DEGRADED' = 'UP';
    if (databaseHealth.status === 'DOWN' || stellarHealth.status === 'DOWN' || sorobanHealth.status === 'DOWN') overallStatus = 'DOWN';
    else if (databaseHealth.status === 'DEGRADED' || stellarHealth.status === 'DEGRADED' || sorobanHealth.status === 'DEGRADED') overallStatus = 'DEGRADED';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      ready: isReady,
      checks: { database: databaseHealth, stellar: stellarHealth, sorobanRpc: sorobanHealth },
    };
  }

  private static async checkStellarConnectivity(): Promise<DependencyHealth> {
    const network = envConfig.NETWORK || 'testnet';
    const rpcUrl = network === 'mainnet' ? envConfig.RPC_URL_MAINNET : envConfig.RPC_URL_TESTNET;
    const horizonUrl = rpcUrl.replace('soroban', 'horizon');
    const start = Date.now();

    try {
      const server = new Horizon.Server(horizonUrl);
      await server.root();
      return { status: 'UP', responseTimeMs: Date.now() - start, details: { horizonUrl, network } };
    } catch (error: any) {
      logger.warn('Stellar Horizon connectivity issue', { error: error.message, url: horizonUrl });
      return { status: 'DEGRADED', responseTimeMs: Date.now() - start, error: error.message, details: { horizonUrl, network } };
    }
  }

  private static async checkSorobanRpc(): Promise<DependencyHealth> {
    const network = envConfig.NETWORK || 'testnet';
    const rpcUrl = network === 'mainnet' ? envConfig.RPC_URL_MAINNET : envConfig.RPC_URL_TESTNET;
    const start = Date.now();

    const result = await httpGet(rpcUrl);
    if (result.success) {
      return { status: 'UP', responseTimeMs: result.responseTime, details: { rpcUrl, network } };
    }
    return { status: 'DEGRADED', responseTimeMs: result.responseTime, error: result.error, details: { rpcUrl, network } };
  }

  private static async checkDatabase(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      const connected = await database.testConnection();
      return { status: connected ? 'UP' : 'DOWN', responseTimeMs: Date.now() - start, details: { type: 'mock' } };
    } catch (error: any) {
      logger.warn('Database connectivity issue', { error: error.message });
      return { status: 'DOWN', responseTimeMs: Date.now() - start, error: error.message };
    }
  }

  private static getDiskInfo(): { freeBytes: number; usedPercent: number } {
    try {
      const fs = require('fs');
      const stats = fs.statfsSync('/');
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bfree;
      const usedPercent = ((totalBytes - freeBytes) / totalBytes) * 100;
      return { freeBytes, usedPercent: Math.round(usedPercent * 100) / 100 };
    } catch {
      return { freeBytes: -1, usedPercent: -1 };
    }
  }
}

export { HealthService };
export default HealthService;