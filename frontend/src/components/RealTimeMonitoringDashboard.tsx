import React, { useState, useEffect, useRef } from 'react';
import { Alert, AlertTriangle, CheckCircle, XCircle, Activity, Cpu, HardDrive, Wifi, Database } from 'lucide-react';

interface MonitoringData {
  timestamp: number;
  systemHealth: {
    uptime: number;
    memoryUsageMb: number;
    activeConnections: number;
    requestsPerMinute: number;
    avgResponseTimeMs: number;
    errorRate: number;
  };
  fullHealth: {
    status: string;
    system: {
      cpu: { load: number[]; cores: number };
      memory: { total: number; free: number };
      disk: { freeBytes: number; usedPercent: number };
    };
    dependencies: {
      stellar: { status: string; responseTimeMs?: number };
      sorobanRpc: { status: string; responseTimeMs?: number };
      database: { status: string; responseTimeMs?: number };
    };
  };
  alerts: Array<{
    id: string;
    type: 'error' | 'warning' | 'critical';
    message: string;
    timestamp: number;
    source: string;
    resolved?: boolean;
  }>;
  performanceMetrics: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkLatency: {
      stellar: number;
      soroban: number;
      database: number;
    };
    requestMetrics: {
      totalRequests: number;
      errorRate: number;
      avgResponseTime: number;
      requestsPerSecond: number;
    };
  };
}

const RealTimeMonitoringDashboard: React.FC = () => {
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [alerts, setAlerts] = useState<MonitoringData['alerts']>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    try {
      ws.current = new WebSocket('ws://localhost:8080');
      
      ws.current.onopen = () => {
        setWsConnected(true);
        console.log('Connected to monitoring WebSocket');
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as MonitoringData;
          setMonitoringData(data);
          setAlerts(data.alerts);
        } catch (error) {
          console.error('Failed to parse monitoring data:', error);
        }
      };

      ws.current.onclose = () => {
        setWsConnected(false);
        console.log('Disconnected from monitoring WebSocket');
        // Attempt to reconnect after 5 seconds
        setTimeout(connectWebSocket, 5000);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsConnected(false);
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      setWsConnected(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'UP': return 'text-green-600';
      case 'DOWN': return 'text-red-600';
      case 'DEGRADED': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical': return <XCircle className="w-5 h-5 text-red-600" />;
      case 'error': return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default: return <Alert className="w-5 h-5 text-blue-600" />;
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600 bg-red-100';
    if (percentage >= 75) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  if (!monitoringData) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 text-gray-400 animate-pulse" />
            <p className="text-gray-600">Connecting to monitoring service...</p>
            <p className="text-sm text-gray-500 mt-2">
              Status: {wsConnected ? 'Connected' : 'Disconnected'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Real-Time Monitoring</h1>
          <p className="text-gray-600 mt-1">System health and performance metrics</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
          <span className="text-sm text-gray-600">
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">System Status</p>
              <p className={`text-lg font-semibold ${getStatusColor(monitoringData.fullHealth.status)}`}>
                {monitoringData.fullHealth.status}
              </p>
            </div>
            <Activity className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Uptime</p>
              <p className="text-lg font-semibold text-gray-900">
                {Math.floor(monitoringData.systemHealth.uptime / 3600)}h {Math.floor((monitoringData.systemHealth.uptime % 3600) / 60)}m
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Connections</p>
              <p className="text-lg font-semibold text-gray-900">
                {monitoringData.systemHealth.activeConnections}
              </p>
            </div>
            <Wifi className="w-8 h-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Requests/min</p>
              <p className="text-lg font-semibold text-gray-900">
                {monitoringData.systemHealth.requestsPerMinute}
              </p>
            </div>
            <Activity className="w-8 h-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Resource Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center mb-4">
            <Cpu className="w-6 h-6 text-blue-600 mr-2" />
            <h3 className="text-lg font-semibold">CPU Usage</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Usage</span>
              <span className={`text-sm font-medium px-2 py-1 rounded ${getUsageColor(monitoringData.performanceMetrics.cpuUsage)}`}>
                {monitoringData.performanceMetrics.cpuUsage.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  monitoringData.performanceMetrics.cpuUsage >= 90 ? 'bg-red-600' :
                  monitoringData.performanceMetrics.cpuUsage >= 75 ? 'bg-yellow-600' : 'bg-green-600'
                }`}
                style={{ width: `${Math.min(monitoringData.performanceMetrics.cpuUsage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              Load: {monitoringData.fullHealth.system.cpu.load[0].toFixed(2)} / {monitoringData.fullHealth.system.cpu.cores} cores
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center mb-4">
            <Database className="w-6 h-6 text-green-600 mr-2" />
            <h3 className="text-lg font-semibold">Memory Usage</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Usage</span>
              <span className={`text-sm font-medium px-2 py-1 rounded ${getUsageColor(monitoringData.performanceMetrics.memoryUsage)}`}>
                {monitoringData.performanceMetrics.memoryUsage.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  monitoringData.performanceMetrics.memoryUsage >= 90 ? 'bg-red-600' :
                  monitoringData.performanceMetrics.memoryUsage >= 75 ? 'bg-yellow-600' : 'bg-green-600'
                }`}
                style={{ width: `${Math.min(monitoringData.performanceMetrics.memoryUsage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {monitoringData.systemHealth.memoryUsageMb} MB used
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center mb-4">
            <HardDrive className="w-6 h-6 text-purple-600 mr-2" />
            <h3 className="text-lg font-semibold">Disk Usage</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Usage</span>
              <span className={`text-sm font-medium px-2 py-1 rounded ${getUsageColor(monitoringData.performanceMetrics.diskUsage)}`}>
                {monitoringData.performanceMetrics.diskUsage.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  monitoringData.performanceMetrics.diskUsage >= 90 ? 'bg-red-600' :
                  monitoringData.performanceMetrics.diskUsage >= 75 ? 'bg-yellow-600' : 'bg-green-600'
                }`}
                style={{ width: `${Math.min(monitoringData.performanceMetrics.diskUsage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {(monitoringData.fullHealth.system.disk.freeBytes / 1024 / 1024 / 1024).toFixed(1)} GB free
            </p>
          </div>
        </div>
      </div>

      {/* Network Dependencies */}
      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="text-lg font-semibold mb-4">Network Dependencies</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Stellar Horizon</span>
              <span className={`text-sm ${getStatusColor(monitoringData.fullHealth.dependencies.stellar.status)}`}>
                {monitoringData.fullHealth.dependencies.stellar.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              Latency: {monitoringData.performanceMetrics.networkLatency.stellar}ms
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Soroban RPC</span>
              <span className={`text-sm ${getStatusColor(monitoringData.fullHealth.dependencies.sorobanRpc.status)}`}>
                {monitoringData.fullHealth.dependencies.sorobanRpc.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              Latency: {monitoringData.performanceMetrics.networkLatency.soroban}ms
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Database</span>
              <span className={`text-sm ${getStatusColor(monitoringData.fullHealth.dependencies.database.status)}`}>
                {monitoringData.fullHealth.dependencies.database.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              Latency: {monitoringData.performanceMetrics.networkLatency.database}ms
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="text-lg font-semibold mb-4">Recent Alerts</h3>
        {alerts.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No recent alerts</p>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 10).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  {getAlertIcon(alert.type)}
                  <div>
                    <p className="font-medium text-gray-900">{alert.message}</p>
                    <p className="text-sm text-gray-600">
                      {alert.source} • {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                {alert.resolved && (
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">Resolved</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Request Metrics */}
      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="text-lg font-semibold mb-4">Request Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">Avg Response Time</p>
            <p className="text-lg font-semibold">{monitoringData.systemHealth.avgResponseTimeMs}ms</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Error Rate</p>
            <p className={`text-lg font-semibold ${
              monitoringData.systemHealth.errorRate > 0.1 ? 'text-red-600' : 'text-green-600'
            }`}>
              {(monitoringData.systemHealth.errorRate * 100).toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Requests/sec</p>
            <p className="text-lg font-semibold">{monitoringData.performanceMetrics.requestMetrics.requestsPerSecond.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Requests</p>
            <p className="text-lg font-semibold">{monitoringData.performanceMetrics.requestMetrics.totalRequests}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealTimeMonitoringDashboard;
