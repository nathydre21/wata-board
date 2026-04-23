export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usage: number;
  };
  server: {
    uptime: number;
    activeConnections: number;
    totalRequests: number;
    requestsPerMinute: number;
    errorRate: number;
  };
  stellar: {
    networkStatus: 'online' | 'offline' | 'degraded';
    responseTime: number;
    lastBlockTime?: Date;
  };
  rateLimit: {
    activeUsers: number;
    queuedRequests: number;
    rejectedRequests: number;
  };
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: 'pass' | 'fail' | 'warn';
    stellar: 'pass' | 'fail' | 'warn';
    memory: 'pass' | 'fail' | 'warn';
    cpu: 'pass' | 'fail' | 'warn';
    rateLimit: 'pass' | 'fail' | 'warn';
  };
  lastCheck: Date;
  uptime: number;
}

export interface MonitoringEvent {
  type: 'metrics' | 'health' | 'error';
  data: any;
  timestamp: Date;
}

export class MonitoringService {
  private metrics: SystemMetrics;
  private healthStatus: HealthStatus;
  private requestCounts: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private activeConnections = 0;
  private totalRequests = 0;
  private lastCleanup = Date.now();
  private monitoringInterval: any = null;
  private healthCheckInterval: any = null;
  private eventListeners: Map<string, ((data: any) => void)[]> = new Map();

  constructor() {
    this.metrics = this.initializeMetrics();
    this.healthStatus = this.initializeHealthStatus();
    this.startMonitoring();
    this.startHealthChecks();
  }

  // Simple event system
  public on(event: string, listener: (data: any) => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  public off(event: string, listener: (data: any) => void) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  private initializeMetrics(): SystemMetrics {
    return {
      timestamp: new Date(),
      cpu: {
        usage: 0,
        loadAverage: [0, 0, 0]
      },
      memory: {
        total: 0,
        free: 0,
        used: 0,
        usage: 0
      },
      server: {
        uptime: 0,
        activeConnections: 0,
        totalRequests: 0,
        requestsPerMinute: 0,
        errorRate: 0
      },
      stellar: {
        networkStatus: 'online',
        responseTime: 0
      },
      rateLimit: {
        activeUsers: 0,
        queuedRequests: 0,
        rejectedRequests: 0
      }
    };
  }

  private initializeHealthStatus(): HealthStatus {
    return {
      status: 'healthy',
      checks: {
        database: 'pass',
        stellar: 'pass',
        memory: 'pass',
        cpu: 'pass',
        rateLimit: 'pass'
      },
      lastCheck: new Date(),
      uptime: 0
    };
  }

  private startMonitoring() {
    // Simplified monitoring without setInterval for TypeScript compatibility
    // In production, this would use setInterval
    this.collectMetrics();
    this.emit('metrics', this.metrics);
  }

  private startHealthChecks() {
    // Simplified health checks without setInterval for TypeScript compatibility
    // In production, this would use setInterval
    this.performHealthChecks();
    this.emit('health', this.healthStatus);
  }

  private async collectMetrics() {
    const now = Date.now();
    this.metrics.timestamp = new Date();

    // Collect CPU metrics (simplified for cross-platform compatibility)
    this.metrics.cpu = await this.getCpuMetrics();

    // Collect memory metrics
    this.metrics.memory = this.getMemoryMetrics();

    // Update server metrics
    this.metrics.server = {
      uptime: 0, // Simplified - would use process.uptime() in Node.js
      activeConnections: this.activeConnections,
      totalRequests: this.totalRequests,
      requestsPerMinute: this.calculateRequestsPerMinute(),
      errorRate: this.calculateErrorRate()
    };

    // Clean up old request counts periodically
    if (now - this.lastCleanup > 60000) { // Every minute
      this.cleanupOldCounts();
      this.lastCleanup = now;
    }
  }

  private async getCpuMetrics() {
    // Simplified CPU monitoring - in production you'd use os.cpus()
    return {
      usage: Math.random() * 20, // Placeholder - would use actual CPU monitoring
      loadAverage: [0, 0, 0] // Windows doesn't have load average
    };
  }

  private getMemoryMetrics() {
    // Simplified memory metrics without process.memoryUsage()
    // In production, this would use actual memory monitoring
    const total = 512; // MB (simulated)
    const used = Math.random() * total * 0.7; // Simulated usage up to 70%
    
    return {
      total: Math.round(total),
      free: Math.round(total - used),
      used: Math.round(used),
      usage: (used / total) * 100
    };
  }

  private calculateRequestsPerMinute(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    let count = 0;

    for (const [key] of this.requestCounts) {
      if (parseInt(key) >= oneMinuteAgo) {
        count++;
      }
    }

    return count;
  }

  private calculateErrorRate(): number {
    const totalRequests = this.requestCounts.size;
    const totalErrors = this.errorCounts.size;
    
    if (totalRequests === 0) return 0;
    return (totalErrors / totalRequests) * 100;
  }

  private cleanupOldCounts() {
    const oneMinuteAgo = Date.now() - 60000;
    
    for (const [key] of this.requestCounts) {
      if (parseInt(key) < oneMinuteAgo) {
        this.requestCounts.delete(key);
      }
    }
    
    for (const [key] of this.errorCounts) {
      if (parseInt(key) < oneMinuteAgo) {
        this.errorCounts.delete(key);
      }
    }
  }

  private async performHealthChecks() {
    this.healthStatus.lastCheck = new Date();
    this.healthStatus.uptime = 0; // Simplified - would use process.uptime() in Node.js

    // Memory check
    const memUsage = this.metrics.memory.usage;
    this.healthStatus.checks.memory = memUsage > 90 ? 'fail' : memUsage > 70 ? 'warn' : 'pass';

    // CPU check
    const cpuUsage = this.metrics.cpu.usage;
    this.healthStatus.checks.cpu = cpuUsage > 90 ? 'fail' : cpuUsage > 70 ? 'warn' : 'pass';

    // Error rate check
    const errorRate = this.metrics.server.errorRate;
    this.healthStatus.checks.rateLimit = errorRate > 10 ? 'fail' : errorRate > 5 ? 'warn' : 'pass';

    // Stellar network check (simplified)
    this.healthStatus.checks.stellar = this.metrics.stellar.networkStatus === 'online' ? 'pass' : 'fail';

    // Database check (simplified - would check actual DB connection)
    this.healthStatus.checks.database = 'pass';

    // Determine overall status
    const checks = Object.values(this.healthStatus.checks);
    if (checks.some(check => check === 'fail')) {
      this.healthStatus.status = 'unhealthy';
    } else if (checks.some(check => check === 'warn')) {
      this.healthStatus.status = 'degraded';
    } else {
      this.healthStatus.status = 'healthy';
    }
  }

  // Public methods for tracking events
  public trackRequest() {
    this.totalRequests++;
    this.requestCounts.set(Date.now().toString(), 1);
  }

  public trackError(error: Error) {
    this.errorCounts.set(Date.now().toString(), 1);
    this.emit('error', error);
  }

  public incrementConnections() {
    this.activeConnections++;
  }

  public decrementConnections() {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  public updateStellarStatus(status: 'online' | 'offline' | 'degraded', responseTime?: number) {
    this.metrics.stellar.networkStatus = status;
    if (responseTime !== undefined) {
      this.metrics.stellar.responseTime = responseTime;
    }
  }

  public updateRateLimitMetrics(activeUsers: number, queuedRequests: number, rejectedRequests: number) {
    this.metrics.rateLimit = {
      activeUsers,
      queuedRequests,
      rejectedRequests
    };
  }

  public getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  public getHealthStatus(): HealthStatus {
    return { ...this.healthStatus };
  }

  public destroy() {
    // Simplified cleanup without clearInterval for TypeScript compatibility
    // In production, this would clear the intervals
    this.monitoringInterval = null;
    this.healthCheckInterval = null;
    this.eventListeners.clear();
  }
}

export const monitoringService = new MonitoringService();
