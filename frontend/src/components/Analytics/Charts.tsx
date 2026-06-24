import React from 'react';
import type { PaymentDashboardAnalytics } from '../../services/analyticsService';

interface AnalyticsChartsProps {
  report: PaymentDashboardAnalytics;
}

const Bar = ({ label, value, max }: { label: string; value: number; max: number }) => {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-sky-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ report }) => {
  const maxMonthly = Math.max(...report.monthlyTrend.map((point) => point.value), 1);
  const statusEntries = Object.entries(report.statusDistribution);
  const maxStatus = Math.max(...statusEntries.map(([, value]) => value), 1);

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
        <h2 className="text-lg font-semibold text-white">Monthly Spend Trend</h2>
        <div className="mt-6 space-y-4">
          {report.monthlyTrend.map((point) => (
            <Bar key={point.label} label={point.label} value={point.value} max={maxMonthly} />
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
        <h2 className="text-lg font-semibold text-white">Payment Status Distribution</h2>
        <div className="mt-6 space-y-4">
          {statusEntries.map(([status, value]) => (
            <Bar key={status} label={status} value={value} max={maxStatus} />
          ))}
        </div>
      </div>
    </section>
  );
};
