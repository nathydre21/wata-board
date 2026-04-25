import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

// Types for monitoring data
interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  cpu: {
    percentage: number;
    loadAverage: number[];
    cores: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    stellar: { connected: boolean; responseTime: number };
    rpc: { connected: boolean; responseTime: number };
  };
}

interface PerformanceMetrics {
  timestamp: string;
  requests: {
    total: number;
    success: number;
    error: number;
    rateLimit: number;
  };
  responseTime: {
    avg: number;
    p95: number;
    p99: number;
  };
  transactions: {
    total: number;
    successful: number;
    failed: number;
    avgProcessingTime: number;
  };
}

interface BusinessMetrics {
  timestamp: string;
  users: {
    active: number;
    new: number;
    total: number;
    concurrent: number;
  };
  payments: {
    volume24h: number;
    transactions24h: number;
    avgAmount: number;
  };
  rateLimiting: {
    activeUsers: number;
    queuedRequests: number;
  };
}

interface Alert {
  id: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  resolved: boolean;
  source: string;
}

const Monitoring: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'health' | 'performance' | 'business' | 'alerts'>('overview');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [business, setBusiness] = useState<BusinessMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [healthHistory, setHealthHistory] = useState<SystemHealth[]>([]);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const wsUrl = `ws://localhost:3002/monitoring`;
    let ws: WebSocket | null = null;

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('Connected to monitoring WebSocket');
          setWsConnected(true);
          setError(null);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
              case 'initial':
                setHealth(message.data.health);
                setPerformance(message.data.performance);
                setBusiness(message.data.business);
                setAlerts(message.data.alerts);
                setLoading(false);
                break;
              case 'event':
                switch (message.data.type) {
                  case 'health':
                    setHealth(message.data.data);
                    break;
                  case 'performance':
                    setPerformance(message.data.data);
                    break;
                  case 'business':
                    setBusiness(message.data.data);
                    break;
                  case 'alert':
                    setAlerts(prev => [message.data.data, ...prev.slice(0, 9)]);
                    break;
                }
                break;
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setWsConnected(false);
          // Attempt to reconnect after 5 seconds
          setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          setError('Failed to connect to monitoring service');
          setWsConnected(false);
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        setError('WebSocket not available');
      }
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  // Fetch initial data if WebSocket fails
  useEffect(() => {
    if (!wsConnected && !error) {
      fetchInitialData();
    }
  }, [wsConnected, error]);

  const fetchInitialData = async () => {
    try {
      const [healthRes, performanceRes, businessRes, alertsRes] = await Promise.all([
        fetch('http://localhost:3001/api/monitoring/health'),
        fetch('http://localhost:3001/api/monitoring/performance'),
        fetch('http://localhost:3001/api/monitoring/business'),
        fetch('http://localhost:3001/api/monitoring/alerts')
      ]);

      const [healthData, performanceData, businessData, alertsData] = await Promise.all([
        healthRes.json(),
        performanceRes.json(),
        businessRes.json(),
        alertsRes.json()
      ]);

      if (healthData.success) setHealth(healthData.data);
      if (performanceData.success) setPerformance(performanceData.data);
      if (businessData.success) setBusiness(businessData.data);
      if (alertsData.success) setAlerts(alertsData.data);
      
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch monitoring data');
      setLoading(false);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/monitoring/alerts/${alertId}/resolve`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setAlerts(prev => prev.map(alert => 
          alert.id === alertId ? { ...alert, resolved: true } : alert
        ));
      }
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'degraded': return 'text-yellow-600';
      case 'unhealthy': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getAlertColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-100 border-red-300 text-red-800';
      case 'warning': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'info': return 'bg-blue-100 border-blue-300 text-blue-800';
      default: return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p>Loading monitoring data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">Monitoring Error</h2>
          <p className="text-slate-400">{error}</p>
          <button 
            onClick={fetchInitialData}
            className="mt-4 px-4 py-2 bg-sky-500 hover:bg-sky-400 rounded-lg transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">System Monitoring</h1>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                wsConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  wsConnected ? 'bg-green-400' : 'bg-red-400'
                }`}></div>
                {wsConnected ? 'Real-time' : 'Disconnected'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-800">
        <div className="mx-auto max-w-7xl px-4">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'health', label: 'System Health' },
              { id: 'performance', label: 'Performance' },
              { id: 'business', label: 'Business Metrics' },
              { id: 'alerts', label: 'Alerts' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                  activeTab === tab.id
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-slate-400 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* System Status Card */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">System Status</h3>
              <div className={`text-3xl font-bold ${getStatusColor(health?.status || 'unknown')}`}>
                {health?.status?.toUpperCase() || 'UNKNOWN'}
              </div>
              <p className="text-sm text-slate-400 mt-2">
                Uptime: {health ? formatUptime(health.uptime) : 'N/A'}
              </p>
            </div>

            {/* Active Users Card */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Active Users</h3>
              <div className="text-3xl font-bold text-sky-400">
                {business?.users?.active || 0}
              </div>
              <p className="text-sm text-slate-400 mt-2">
                Concurrent: {business?.users?.concurrent || 0}
              </p>
            </div>

            {/* Response Time Card */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Avg Response Time</h3>
              <div className="text-3xl font-bold text-green-400">
                {performance?.responseTime?.avg || 0}ms
              </div>
              <p className="text-sm text-slate-400 mt-2">
                95th: {performance?.responseTime?.p95 || 0}ms
              </p>
            </div>

            {/* Active Alerts Card */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Active Alerts</h3>
              <div className="text-3xl font-bold text-red-400">
                {alerts.filter(a => !a.resolved).length}
              </div>
              <p className="text-sm text-slate-400 mt-2">
                Critical: {alerts.filter(a => !a.resolved && a.level === 'critical').length}
              </p>
            </div>
          </div>
        )}

        {/* System Health Tab */}
        {activeTab === 'health' && health && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Memory Usage */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Memory Usage</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Usage</span>
                      <span>{health.memory.percentage}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          health.memory.percentage > 90 ? 'bg-red-500' :
                          health.memory.percentage > 70 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${health.memory.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-400">
                    Used: {formatBytes(health.memory.used * 1024 * 1024)} / {formatBytes(health.memory.total * 1024 * 1024)}
                  </div>
                </div>
              </div>

              {/* CPU Usage */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">CPU Usage</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Usage</span>
                      <span>{health.cpu.percentage}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          health.cpu.percentage > 90 ? 'bg-red-500' :
                          health.cpu.percentage > 70 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${health.cpu.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-400">
                    Load Average: {health.cpu.loadAverage.map(l => l.toFixed(2)).join(', ')}
                  </div>
                </div>
              </div>

              {/* Network Status */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Network Connectivity</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span>Stellar Network</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        health.network.stellar.connected ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm">
                        {health.network.stellar.connected ? 'Connected' : 'Disconnected'}
                      </span>
                      <span className="text-sm text-slate-400">
                        ({health.network.stellar.responseTime}ms)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>RPC Endpoint</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        health.network.rpc.connected ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm">
                        {health.network.rpc.connected ? 'Connected' : 'Disconnected'}
                      </span>
                      <span className="text-sm text-slate-400">
                        ({health.network.rpc.responseTime}ms)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Disk Usage */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Disk Usage</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Usage</span>
                      <span>{health.disk.percentage}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          health.disk.percentage > 95 ? 'bg-red-500' :
                          health.disk.percentage > 80 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${health.disk.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-400">
                    Used: {health.disk.used}GB / {health.disk.total}GB
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && performance && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Request Metrics */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Request Metrics</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total</span>
                    <span className="font-semibold">{performance.requests.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Success</span>
                    <span className="font-semibold text-green-400">{performance.requests.success}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Errors</span>
                    <span className="font-semibold text-red-400">{performance.requests.error}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rate Limited</span>
                    <span className="font-semibold text-yellow-400">{performance.requests.rateLimit}</span>
                  </div>
                </div>
              </div>

              {/* Response Time */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Response Times</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Average</span>
                    <span className="font-semibold">{performance.responseTime.avg}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">95th Percentile</span>
                    <span className="font-semibold">{performance.responseTime.p95}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">99th Percentile</span>
                    <span className="font-semibold">{performance.responseTime.p99}ms</span>
                  </div>
                </div>
              </div>

              {/* Transaction Metrics */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Transaction Metrics</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total</span>
                    <span className="font-semibold">{performance.transactions.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Successful</span>
                    <span className="font-semibold text-green-400">{performance.transactions.successful}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Failed</span>
                    <span className="font-semibold text-red-400">{performance.transactions.failed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Avg Processing</span>
                    <span className="font-semibold">{performance.transactions.avgProcessingTime}ms</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Business Metrics Tab */}
        {activeTab === 'business' && business && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* User Metrics */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">User Metrics</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Active (1h)</span>
                    <span className="font-semibold">{business.users.active}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">New (24h)</span>
                    <span className="font-semibold text-green-400">{business.users.new}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total</span>
                    <span className="font-semibold">{business.users.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Concurrent</span>
                    <span className="font-semibold text-sky-400">{business.users.concurrent}</span>
                  </div>
                </div>
              </div>

              {/* Payment Metrics */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Payment Metrics (24h)</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Volume</span>
                    <span className="font-semibold">{business.payments.volume24h}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Transactions</span>
                    <span className="font-semibold">{business.payments.transactions24h}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Average Amount</span>
                    <span className="font-semibold">{business.payments.avgAmount}</span>
                  </div>
                </div>
              </div>

              {/* Rate Limiting */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 lg:col-span-2">
                <h3 className="text-lg font-semibold mb-4">Rate Limiting</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-400">{business.rateLimiting.activeUsers}</div>
                    <div className="text-sm text-slate-400">Active Users</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-400">{business.rateLimiting.queuedRequests}</div>
                    <div className="text-sm text-slate-400">Queued Requests</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="space-y-4">
            {alerts.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-4">✅</div>
                <h3 className="text-xl font-semibold mb-2">No Active Alerts</h3>
                <p className="text-slate-400">All systems are operating normally</p>
              </div>
            ) : (
              alerts.map(alert => (
                <div key={alert.id} className={`border rounded-xl p-4 ${
                  alert.resolved ? 'opacity-50' : ''
                } ${getAlertColor(alert.level)}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          alert.level === 'critical' ? 'bg-red-600 text-white' :
                          alert.level === 'warning' ? 'bg-yellow-600 text-white' :
                          'bg-blue-600 text-white'
                        }`}>
                          {alert.level.toUpperCase()}
                        </span>
                        <span className="font-semibold">{alert.title}</span>
                        {alert.resolved && (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-green-600 text-white">
                            RESOLVED
                          </span>
                        )}
                      </div>
                      <p className="text-sm mb-2">{alert.message}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-600">
                        <span>Source: {alert.source}</span>
                        <span>Time: {new Date(alert.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                    {!alert.resolved && (
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="ml-4 px-3 py-1 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-sm transition"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Monitoring;
