export interface AnalyticsTrendPoint {
  label: string;
  value: number;
}

export interface AnalyticsReport {
  userId: string;
  totalSpendYearly: number;
  totalSpendMonthly: number;
  paymentsThisMonth: number;
  averagePayment: number;
  utilityUsageBreakdown: Record<string, number>;
  monthlyTrend: AnalyticsTrendPoint[];
  yearlyTrend: AnalyticsTrendPoint[];
  predictiveInsight: string;
}

function normalizePercentage(value: number, max: number) {
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

export class AnalyticsService {
  static generateReport(userId: string): AnalyticsReport {
    const base = Math.max(1, userId.length * 7);
    const totalSpendMonthly = Number((base * 12.4).toFixed(2));
    const totalSpendYearly = Number((totalSpendMonthly * 12).toFixed(2));
    const paymentsThisMonth = Math.max(3, Math.round(base / 2));
    const averagePayment = Number((totalSpendMonthly / paymentsThisMonth).toFixed(2));

    const monthlyTrend = Array.from({ length: 6 }, (_, idx) => ({
      label: `${6 - idx}m ago`,
      value: Number((totalSpendMonthly * (0.7 + idx * 0.05)).toFixed(2))
    })).reverse();

    const yearlyTrend = Array.from({ length: 5 }, (_, idx) => ({
      label: `${new Date().getFullYear() - (4 - idx)}`,
      value: Number((totalSpendYearly * (0.78 + idx * 0.05)).toFixed(2))
    }));

    const usageWeights = {
      water: normalizePercentage(base * 1.2, 20),
      electricity: normalizePercentage(base * 1.6, 25),
      waste: normalizePercentage(base * 0.9, 15),
      internet: normalizePercentage(base * 0.8, 15),
      gas: normalizePercentage(base * 1.1, 25)
    };

    const totalUsage = Object.values(usageWeights).reduce((sum, value) => sum + value, 0) || 1;
    const utilityUsageBreakdown = Object.fromEntries(
      Object.entries(usageWeights).map(([key, value]) => [key, Math.round((value / totalUsage) * 100)])
    );

    return {
      userId,
      totalSpendYearly,
      totalSpendMonthly,
      paymentsThisMonth,
      averagePayment,
      utilityUsageBreakdown,
      monthlyTrend,
      yearlyTrend,
      predictiveInsight: `Spending is expected to remain ${paymentsThisMonth > 8 ? 'stable' : 'moderate'} over the next quarter with optimization opportunities on utility usage.`
    };
  }
}
