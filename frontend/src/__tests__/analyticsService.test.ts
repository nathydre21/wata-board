import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUserAnalytics, fetchPaymentDashboardAnalytics } from '../services/analyticsService';

describe('Analytics Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches analytics report from backend', async () => {
    const fakeReport = {
      userId: 'test-user',
      totalSpendYearly: 1200,
      totalSpendMonthly: 100,
      paymentsThisMonth: 5,
      averagePayment: 20,
      utilityUsageBreakdown: { water: 40, electricity: 35, waste: 25 },
      monthlyTrend: [{ label: 'Jan', value: 100 }],
      yearlyTrend: [{ label: '2025', value: 1200 }],
      predictiveInsight: 'Expect stable spending.'
    };

    (globalThis as any).fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(fakeReport)
      })
    );

    const report = await fetchUserAnalytics('test-user');
    expect(report).toEqual(fakeReport);
    expect((globalThis as any).fetch).toHaveBeenCalledWith('/api/analytics/test-user');
  });

  it('throws when the backend returns an error', async () => {
    (globalThis as any).fetch = vi.fn(() => Promise.resolve({ ok: false }));
    await expect(fetchUserAnalytics('test-user')).rejects.toThrow("Couldn't load your analytics data. Please refresh and try again.");
  });

  it('fetches payment dashboard analytics from backend', async () => {
    const payload = {
      success: true,
      data: {
        totalPayments: 25,
        totalVolume: 1500,
        averagePayment: 60,
        successRate: 92,
        failureRate: 4,
        pendingRate: 4,
        monthlyTrend: [{ label: 'Jan 2026', value: 10 }],
        statusDistribution: { confirmed: 23, failed: 1, pending: 1 },
        trendDirection: 'increasing',
        insights: ['Payment volume is trending up month-over-month.'],
      }
    };

    (globalThis as any).fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(payload)
      })
    );

    const report = await fetchPaymentDashboardAnalytics();
    expect(report).toEqual(payload.data);
    expect((globalThis as any).fetch).toHaveBeenCalledWith('/api/analytics/payments/dashboard');
  });
});
