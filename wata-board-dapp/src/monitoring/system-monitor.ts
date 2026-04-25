/**
 * System Health Monitor for Wata-Board
 * Monitors server resources, connectivity, and overall system health
 */

import * as os from 'os';
import { performance } from 'perf_hooks';
import {
  SystemHealth,
  MemoryUsage,
  CpuUsage,
  DiskUsage,
  NetworkStatus,
  ConnectionStatus,
  MonitoringConfig,
  createTimestamp
} from '../../../shared/monitoring-types';

export class SystemMonitor {
  private startTime: number;
  private config: MonitoringConfig;
  private healthHistory: SystemHealth[] = [];
  private maxHistorySize = 1000;

  constructor(config: MonitoringConfig) {
    this.startTime = Date.now();
    this.config = config;
  }

  /**
   * Get current system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const timestamp = createTimestamp();
    
    const [memory, cpu, disk, network] = await Promise.all([
      this.getMemoryUsage(),
      this.getCpuUsage(),
      this.getDiskUsage(),
      this.getNetworkStatus()
    ]);

    const health: SystemHealth = {
      status: this.determineHealthStatus(memory, cpu, disk, network),
      timestamp,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memory,
      cpu,
      disk,
      network
    };

    // Store in history
    this.healthHistory.push(health);
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }

    return health;
  }

  /**
   * Get memory usage statistics
   */
  private async getMemoryUsage(): Promise<MemoryUsage> {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      total: Math.round(totalMem / (1024 * 1024)), // Convert to MB
      used: Math.round(usedMem / (1024 * 1024)),
      free: Math.round(freeMem / (1024 * 1024)),
      percentage: Math.round((usedMem / totalMem) * 100),
      heapUsed: Math.round(memUsage.heapUsed / (1024 * 1024)),
      heapTotal: Math.round(memUsage.heapTotal / (1024 * 1024))
    };
  }

  /**
   * Get CPU usage statistics
   */
  private async getCpuUsage(): Promise<CpuUsage> {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    
    // Calculate CPU usage (simplified approach)
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (idle / total) * 100;

    return {
      percentage: Math.round(usage * 100) / 100,
      loadAverage: loadAvg.map(avg => Math.round(avg * 100) / 100),
      cores: cpus.length
    };
  }

  /**
   * Get disk usage statistics
   */
  private async getDiskUsage(): Promise<DiskUsage> {
    try {
      const fs = await import('fs');
      const stats = fs.statSync('.');
      
      // Simplified disk usage - in a real implementation, you'd use a library like 'diskusage'
      // For now, we'll return placeholder values
      return {
        total: 100, // Placeholder - would use actual disk size
        used: 50,   // Placeholder - would calculate actual usage
        free: 50,   // Placeholder - would calculate actual free space
        percentage: 50 // Placeholder
      };
    } catch (error) {
      // Return default values if disk stats can't be retrieved
      return {
        total: 0,
        used: 0,
        free: 0,
        percentage: 0
      };
    }
  }

  /**
   * Get network connectivity status
   */
  private async getNetworkStatus(): Promise<NetworkStatus> {
    const [stellar, rpc] = await Promise.all([
      this.checkStellarConnection(),
      this.checkRpcConnection()
    ]);

    return {
      stellar,
      rpc
    };
  }

  /**
   * Check Stellar network connectivity
   */
  private async checkStellarConnection(): Promise<ConnectionStatus> {
    const startTime = performance.now();
    
    try {
      // Import Stellar SDK dynamically
      const { Horizon } = await import('@stellar/stellar-sdk');
      const server = new Horizon.Server('https://horizon-testnet.stellar.org');
      
      await server.root();
      const responseTime = performance.now() - startTime;

      return {
        connected: true,
        responseTime: Math.round(responseTime),
        lastCheck: createTimestamp()
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      return {
        connected: false,
        responseTime: Math.round(responseTime),
        lastCheck: createTimestamp(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check RPC connectivity
   */
  private async checkRpcConnection(): Promise<ConnectionStatus> {
    const startTime = performance.now();
    
    try {
      // Use fetch to check RPC endpoint
      const response = await fetch('https://soroban-testnet.stellar.org', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const responseTime = performance.now() - startTime;

      return {
        connected: response.ok,
        responseTime: Math.round(responseTime),
        lastCheck: createTimestamp(),
        error: response.ok ? undefined : `HTTP ${response.status}`
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      return {
        connected: false,
        responseTime: Math.round(responseTime),
        lastCheck: createTimestamp(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Determine overall health status based on component status
   */
  private determineHealthStatus(
    memory: MemoryUsage,
    cpu: CpuUsage,
    disk: DiskUsage,
    network: NetworkStatus
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const thresholds = this.config.alerts.thresholds;
    
    // Check for unhealthy conditions
    if (
      memory.percentage > 90 ||
      cpu.percentage > 90 ||
      disk.percentage > 95 ||
      !network.stellar.connected ||
      !network.rpc.connected
    ) {
      return 'unhealthy';
    }

    // Check for degraded conditions
    if (
      memory.percentage > thresholds.memory ||
      cpu.percentage > thresholds.cpu ||
      disk.percentage > thresholds.disk ||
      network.stellar.responseTime > thresholds.stellarResponseTime ||
      network.rpc.responseTime > thresholds.stellarResponseTime
    ) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Get health history
   */
  getHealthHistory(limit?: number): SystemHealth[] {
    if (limit) {
      return this.healthHistory.slice(-limit);
    }
    return [...this.healthHistory];
  }

  /**
   * Get current uptime
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Clear health history
   */
  clearHistory(): void {
    this.healthHistory = [];
  }
}
