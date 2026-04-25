import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUserAnalytics } from '../services/analyticsService';

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
    await expect(fetchUserAnalytics('test-user')).rejects.toThrow('Failed to retrieve analytics');
  });
});
