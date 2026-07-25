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

  it('provides payment dashboard analytics', async () => {
    const service = new AnalyticsService();
    const dashboard = await service.getPaymentDashboardAnalytics();

    expect(dashboard.totalPayments).toBeGreaterThanOrEqual(0);
    expect(dashboard.totalVolume).toBeGreaterThanOrEqual(0);
    expect(dashboard.averagePayment).toBeGreaterThanOrEqual(0);
    expect(dashboard.monthlyTrend.length).toBeGreaterThanOrEqual(0);
    expect(dashboard.statusDistribution).toBeDefined();
    expect(Array.isArray(dashboard.insights)).toBe(true);
  });

  describe('getPaginatedMonthlyGrowth', () => {
    it('returns pagination metadata', async () => {
      const service = new AnalyticsService();
      const result = await service.getPaginatedMonthlyGrowth({ page: 1, limit: 5 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.data)).toBe(true);

      const { pagination } = result;
      expect(pagination.page).toBe(1);
      expect(pagination.limit).toBe(5);
      expect(typeof pagination.total).toBe('number');
      expect(typeof pagination.totalPages).toBe('number');
      expect(typeof pagination.hasNextPage).toBe('boolean');
      expect(pagination.hasPreviousPage).toBe(false);
    });

    it('returns at most `limit` items per page', async () => {
      const service = new AnalyticsService();
      const result = await service.getPaginatedMonthlyGrowth({ page: 1, limit: 3 });

      expect(result.data.length).toBeLessThanOrEqual(3);
    });

    it('returns correct page 2 slice', async () => {
      const service = new AnalyticsService();
      const page1 = await service.getPaginatedMonthlyGrowth({ page: 1, limit: 2 });
      const page2 = await service.getPaginatedMonthlyGrowth({ page: 2, limit: 2 });

      expect(page2.pagination.page).toBe(2);
      // page 2 items must differ from page 1 items (unless total <= 2)
      if (page1.pagination.total > 2) {
        expect(page2.data[0]).not.toEqual(page1.data[0]);
        expect(page2.pagination.hasPreviousPage).toBe(true);
      }
    });

    it('hasNextPage is false on last page', async () => {
      const service = new AnalyticsService();
      // Fetch all data in one large page
      const all = await service.getPaginatedMonthlyGrowth({ page: 1, limit: 1000 });
      expect(all.pagination.hasNextPage).toBe(false);
    });

    it('totalPages is at least 1 even when data is empty', async () => {
      const service = new AnalyticsService();
      const result = await service.getPaginatedMonthlyGrowth({ page: 1, limit: 12 });
      expect(result.pagination.totalPages).toBeGreaterThanOrEqual(1);
    });
  });
});
