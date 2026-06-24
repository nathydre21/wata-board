import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPaymentDashboardAnalytics, formatCurrency } from '../../services/analyticsService';
import type { PaymentDashboardAnalytics } from '../../services/analyticsService';
import { AnalyticsCharts } from './Charts';

export const AnalyticsDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [report, setReport] = useState<PaymentDashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentDashboardAnalytics()
      .then(setReport)
      .catch((err) => {
        setError(err.message || t('analytics.errorFallback'));
      })
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <main id="analytics-dashboard" className="min-h-screen px-4 py-10 sm:px-6 lg:px-8 bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">{t('analytics.dashboard.title')}</h1>
              <p className="mt-2 text-sm text-slate-400 max-w-2xl">{t('analytics.dashboard.subtitle')}</p>
            </div>
          </div>
        </div>

        {loading && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 text-center text-slate-400">
            {t('analytics.loading')}
          </div>
        )}

        {error && (
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6 text-amber-200">
            <p>{error}</p>
          </div>
        )}

        {report && (
          <div className="space-y-8">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Payment Volume</p>
                <p className="mt-4 text-3xl font-semibold text-white">{formatCurrency(report.totalVolume)}</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Payments</p>
                <p className="mt-4 text-3xl font-semibold text-white">{report.totalPayments}</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Average Payment Size</p>
                <p className="mt-4 text-3xl font-semibold text-white">{formatCurrency(report.averagePayment)}</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Success Rate</p>
                <p className="mt-4 text-3xl font-semibold text-white">{report.successRate}%</p>
              </div>
            </section>

            <AnalyticsCharts report={report} />

            <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Payment Reliability Snapshot</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm text-slate-500 uppercase tracking-[0.24em]">Success</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{report.successRate}%</p>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm text-slate-500 uppercase tracking-[0.24em]">Failed</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{report.failureRate}%</p>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm text-slate-500 uppercase tracking-[0.24em]">Pending</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{report.pendingRate}%</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Insights</h2>
              <p className="mt-4 text-slate-300 leading-relaxed">
                Payment trend direction: <span className="font-semibold">{report.trendDirection}</span>
              </p>
              <div className="mt-6 space-y-3">
                {report.insights.map((insight) => (
                  <p key={insight} className="text-slate-300">
                    - {insight}
                  </p>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
};
