import { AnalyticsService } from '../services/analyticsService';

describe('AnalyticsService', () => {
  it('generates a consistent analytics report', () => {
    const report = AnalyticsService.generateReport('demo-user');
    expect(report.userId).toBe('demo-user');
    expect(report.totalSpendMonthly).toBeGreaterThan(0);
    expect(report.monthlyTrend).toHaveLength(6);
    expect(report.yearlyTrend).toHaveLength(5);
    expect(report.utilityUsageBreakdown).toHaveProperty('water');
    expect(report.predictiveInsight).toContain('Spending is expected');
  });
});
