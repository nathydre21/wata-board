/**
 * API Monitoring Dashboard (#99)
 *
 * Real-time dashboard showing system health, tier distribution,
 * endpoint metrics, and alerts. Auto-refreshes every 5 seconds.
 */

import React, { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────

interface SystemHealth {
  uptime: number;
  memoryUsageMb: number;
  activeConnections: number;
  requestsPerMinute: number;
  errorRate: number;
}

interface Alert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
}

interface MonitoringSnapshot {
  health: SystemHealth;
  rateLimiting: {
    userMetrics: Record<string, { count: number; errors: number }>;
    tierDistribution: Record<string, number>;
  };
  endpoints: Record<string, { count: number; avgResponseMs: number }>;
  alerts: Alert[];
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ── Component ──────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/dashboard`);
      if (!res.ok) throw new Error("Couldn't load monitoring data. Please refresh the page.");
      const data: MonitoringSnapshot = await res.json();
      setSnapshot(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    if (!autoRefresh) return;
    const interval = setInterval(fetchDashboard, 5000);
    return () => clearInterval(interval);
  }, [fetchDashboard, autoRefresh]);

  if (loading && !snapshot)
    return <div className="p-4">Loading dashboard…</div>;
  if (error && !snapshot)
    return <div className="p-4 text-red-500">Error: {error}</div>;
  if (!snapshot) return null;

  const { health, rateLimiting, endpoints, alerts } = snapshot;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">API Monitoring Dashboard</h1>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (5 s)
        </label>
      </div>

      {/* System Health */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-3">System Health</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <HealthCard label="Uptime" value={`${Math.floor(health.uptime / 60)}m`} />
          <HealthCard label="Memory" value={`${health.memoryUsageMb} MB`} />
          <HealthCard label="Connections" value={String(health.activeConnections)} />
          <HealthCard label="Req / min" value={String(health.requestsPerMinute)} />
          <HealthCard
            label="Error Rate"
            value={`${(health.errorRate * 100).toFixed(1)}%`}
            alert={health.errorRate > 0.1}
          />
        </div>
      </section>

      {/* Tier Distribution */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-3">User Tier Distribution</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(rateLimiting.tierDistribution).map(([tier, count]) => (
            <div key={tier} className="bg-gray-100 p-3 rounded">
              <div className="text-sm text-gray-500 capitalize">{tier}</div>
              <div className="text-xl font-bold">{count}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Endpoint Metrics */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Endpoint Metrics (1 min)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2">Endpoint</th>
                <th className="text-right p-2">Requests</th>
                <th className="text-right p-2">Avg Response</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(endpoints).map(([endpoint, data]) => (
                <tr key={endpoint} className="border-t">
                  <td className="p-2 font-mono text-xs">{endpoint}</td>
                  <td className="p-2 text-right">{data.count}</td>
                  <td className="p-2 text-right">{data.avgResponseMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Alerts ({alerts.length})</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alerts
              .slice()
              .reverse()
              .map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded text-sm ${
                    alert.level === 'critical'
                      ? 'bg-red-100 text-red-800'
                      : alert.level === 'warning'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  <span className="font-semibold uppercase">[{alert.level}]</span>{' '}
                  {alert.message}
                  <span className="text-xs ml-2 opacity-60">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
};

// ── Sub-component ──────────────────────────────────────────

const HealthCard: React.FC<{
  label: string;
  value: string;
  alert?: boolean;
}> = ({ label, value, alert }) => (
  <div
    className={`p-3 rounded ${
      alert ? 'bg-red-100 border border-red-300' : 'bg-gray-100'
    }`}
  >
    <div className="text-sm text-gray-500">{label}</div>
    <div className="text-xl font-bold">{value}</div>
  </div>
);

export default Dashboard;
