import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

interface SystemMetrics {
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

interface HealthStatus {
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

interface Alert {
  id: string;
  severity: 'critical' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
  component: string;
}

export default function Monitoring() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch initial data
  const fetchInitialData = useCallback(async () => {
    try {
      const [metricsRes, healthRes, alertsRes] = await Promise.all([
        fetch('http://localhost:3001/api/monitoring/metrics'),
        fetch('http://localhost:3001/api/monitoring/health'),
        fetch('http://localhost:3001/api/monitoring/alerts')
      ]);

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData.data);
      }

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealth(healthData.data);
      }

      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.data.alerts || []);
      }
    } catch (error) {
      console.error('Failed to fetch initial monitoring data:', error);
    }
  }, []);

  // Setup Server-Sent Events for real-time updates
  useEffect(() => {
    fetchInitialData();

    const eventSource = new EventSource('http://localhost:3001/api/monitoring/events');
    
    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'metrics') {
          setMetrics(data.data);
        } else if (data.type === 'health') {
          setHealth(data.data);
        } else if (data.type === 'error') {
          console.error('Monitoring error:', data.data);
        }
        
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to parse SSE data:', error);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, [fetchInitialData]);

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'pass':
        return 'text-green-400 bg-green-400/10';
      case 'degraded':
      case 'warn':
        return 'text-yellow-400 bg-yellow-400/10';
      case 'unhealthy':
      case 'fail':
        return 'text-red-400 bg-red-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getNetworkStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-400';
      case 'degraded':
        return 'text-yellow-400';
      case 'offline':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">System Monitoring</h1>
              <p className="mt-2 text-sm text-slate-400">
                Real-time system health and performance metrics
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                isConnected ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'
              }`}>
                <div className={`h-2 w-2 rounded-full ${
                  isConnected ? 'bg-green-400' : 'bg-red-400'
                }`} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
              <Link
                to="/"
                className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Back to App
              </Link>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        </div>

        {/* System Status Overview */}
        {health && (
          <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-200">System Status</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {Object.entries(health.checks).map(([component, status]) => (
                <div key={component} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {component.charAt(0).toUpperCase() + component.slice(1)}
                  </div>
                  <div className={`mt-2 rounded-lg px-2 py-1 text-center text-sm font-medium ${getStatusColor(status)}`}>
                    {status.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-slate-300">
                Overall Status: <span className={`font-semibold ${getStatusColor(health.status)}`}>
                  {health.status.toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Uptime: {formatUptime(health.uptime)}
              </div>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        {metrics && (
          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* CPU & Memory */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-200">System Resources</h2>
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">CPU Usage</span>
                    <span className="font-mono text-slate-400">{metrics.cpu.usage.toFixed(1)}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-800">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        metrics.cpu.usage > 80 ? 'bg-red-400' :
                        metrics.cpu.usage > 60 ? 'bg-yellow-400' : 'bg-green-400'
                      }`}
                      style={{ width: `${Math.min(metrics.cpu.usage, 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">Memory Usage</span>
                    <span className="font-mono text-slate-400">
                      {metrics.memory.used}MB / {metrics.memory.total}MB
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-800">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        metrics.memory.usage > 80 ? 'bg-red-400' :
                        metrics.memory.usage > 60 ? 'bg-yellow-400' : 'bg-green-400'
                      }`}
                      style={{ width: `${Math.min(metrics.memory.usage, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {metrics.memory.usage.toFixed(1)}% used
                  </div>
                </div>
              </div>
            </div>

            {/* Server Metrics */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-200">Server Performance</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active Connections</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-100">
                    {metrics.server.activeConnections}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Requests/Min</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-100">
                    {metrics.server.requestsPerMinute}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Error Rate</div>
                  <div className={`mt-1 text-2xl font-semibold ${
                    metrics.server.errorRate > 5 ? 'text-red-400' :
                    metrics.server.errorRate > 1 ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {metrics.server.errorRate.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Requests</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-100">
                    {metrics.server.totalRequests.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Stellar Network */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-200">Stellar Network</h2>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Network Status</span>
                  <span className={`font-semibold ${getNetworkStatusColor(metrics.stellar.networkStatus)}`}>
                    {metrics.stellar.networkStatus.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Response Time</span>
                  <span className="font-mono text-sm text-slate-400">
                    {metrics.stellar.responseTime}ms
                  </span>
                </div>
              </div>
            </div>

            {/* Rate Limiting */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-200">Rate Limiting</h2>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active Users</div>
                  <div className="mt-1 text-xl font-semibold text-slate-100">
                    {metrics.rateLimit.activeUsers}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Queued</div>
                  <div className={`mt-1 text-xl font-semibold ${
                    metrics.rateLimit.queuedRequests > 0 ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {metrics.rateLimit.queuedRequests}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rejected</div>
                  <div className={`mt-1 text-xl font-semibold ${
                    metrics.rateLimit.rejectedRequests > 0 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {metrics.rateLimit.rejectedRequests}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-200">Active Alerts</h2>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-lg border p-4 ${
                    alert.severity === 'critical' 
                      ? 'border-red-800 bg-red-950/20' 
                      : 'border-yellow-800 bg-yellow-950/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${
                          alert.severity === 'critical' ? 'bg-red-400' : 'bg-yellow-400'
                        }`} />
                        <h3 className="font-semibold text-slate-100">{alert.title}</h3>
                      </div>
                      <p className="mt-1 text-sm text-slate-300">{alert.message}</p>
                      <div className="mt-2 text-xs text-slate-500">
                        {alert.component} • {new Date(alert.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className={`rounded-full px-2 py-1 text-xs font-medium ${
                      alert.severity === 'critical' 
                        ? 'bg-red-500/10 text-red-300' 
                        : 'bg-yellow-500/10 text-yellow-300'
                    }`}>
                      {alert.severity.toUpperCase()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Data State */}
        {!metrics && !health && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
            <div className="text-slate-400">
              <div className="mb-4 text-lg">Loading monitoring data...</div>
              <div className="text-sm">
                Make sure the backend server is running on localhost:3001
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
