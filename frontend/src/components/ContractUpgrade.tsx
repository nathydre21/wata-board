/**
 * ContractUpgrade Component (#101)
 *
 * Admin UI for deploying new contract versions, viewing
 * version history, and triggering rollbacks.
 */

import React, { useState, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────

interface ContractVersion {
  version: string;
  wasmHash: string;
  deployedAt: string;
  deployedBy: string;
  description: string;
  status: string;
}

interface UpgradeResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  migrationsRun: string[];
  error?: string;
  timestamp: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ── Component ──────────────────────────────────────────────

const ContractUpgrade: React.FC = () => {
  const [currentVersion, setCurrentVersion] = useState('');
  const [history, setHistory] = useState<ContractVersion[]>([]);
  const [newVersion, setNewVersion] = useState('');
  const [wasmHash, setWasmHash] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<UpgradeResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchVersion();
    fetchHistory();
  }, []);

  const fetchVersion = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/upgrade/version`);
      const data = await res.json();
      setCurrentVersion(data.currentVersion);
    } catch {
      /* swallow – the dashboard will show stale data */
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/upgrade/history`);
      const data = await res.json();
      setHistory(data);
    } catch {
      /* swallow */
    }
  };

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/upgrade/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: newVersion, wasmHash, description }),
      });
      const data: UpgradeResult = await res.json();
      setResult(data);
      if (data.success) {
        fetchVersion();
        fetchHistory();
      }
    } catch (err: any) {
      setResult({
        success: false,
        fromVersion: currentVersion,
        toVersion: newVersion,
        migrationsRun: [],
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (targetVersion: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/upgrade/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersion }),
      });
      const data: UpgradeResult = await res.json();
      setResult(data);
      if (data.success) {
        fetchVersion();
        fetchHistory();
      }
    } catch (err: any) {
      setResult({
        success: false,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        migrationsRun: [],
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Contract Upgrade Management</h1>

      {/* Current version */}
      <div className="bg-blue-50 p-4 rounded mb-6">
        <span className="text-sm text-gray-500">Current Version</span>
        <div className="text-xl font-bold">{currentVersion}</div>
      </div>

      {/* Upgrade form */}
      <section className="mb-6 border p-4 rounded">
        <h2 className="text-lg font-semibold mb-3">Deploy New Version</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Version (e.g. 1.1.0)"
            value={newVersion}
            onChange={(e) => setNewVersion(e.target.value)}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="WASM Hash"
            value={wasmHash}
            onChange={(e) => setWasmHash(e.target.value)}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="p-2 border rounded md:col-span-2"
          />
        </div>
        <button
          onClick={handleUpgrade}
          disabled={loading || !newVersion || !wasmHash}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? 'Upgrading…' : 'Execute Upgrade'}
        </button>
      </section>

      {/* Result banner */}
      {result && (
        <div
          className={`mb-6 p-4 rounded ${
            result.success
              ? 'bg-green-50 border border-green-300'
              : 'bg-red-50 border border-red-300'
          }`}
        >
          <div className="font-semibold">
            {result.success ? '✅ Upgrade Successful' : '❌ Upgrade Failed'}
          </div>
          <div className="text-sm mt-1">
            {result.fromVersion} → {result.toVersion}
          </div>
          {result.error && (
            <div className="text-sm text-red-600 mt-1">{result.error}</div>
          )}
          {result.migrationsRun.length > 0 && (
            <div className="text-sm mt-1">
              Migrations: {result.migrationsRun.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Version history */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Version History</h2>
        <div className="space-y-2">
          {history
            .slice()
            .reverse()
            .map((v) => (
              <div
                key={v.version}
                className="flex items-center justify-between p-3 bg-gray-50 rounded"
              >
                <div>
                  <span className="font-mono font-bold">{v.version}</span>
                  <span
                    className={`ml-2 text-xs px-2 py-0.5 rounded ${
                      v.status === 'active'
                        ? 'bg-green-200'
                        : v.status === 'rolled_back'
                          ? 'bg-red-200'
                          : 'bg-gray-200'
                    }`}
                  >
                    {v.status}
                  </span>
                  <div className="text-xs text-gray-500">
                    {v.description} — by {v.deployedBy} at{' '}
                    {new Date(v.deployedAt).toLocaleString()}
                  </div>
                </div>
                {v.status !== 'active' && (
                  <button
                    onClick={() => handleRollback(v.version)}
                    disabled={loading}
                    className="text-sm px-3 py-1 bg-yellow-500 text-white rounded disabled:opacity-50"
                  >
                    Rollback
                  </button>
                )}
              </div>
            ))}
        </div>
      </section>
    </div>
  );
};

export default ContractUpgrade;
