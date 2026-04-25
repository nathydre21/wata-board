import {
  PaymentRequest,
  PaymentResponse,
  RateLimitInfo,
  createApiResponse,
} from "../../../shared/types";
import { DatabaseService } from "../utils/database";
import logger from "../utils/logger";

// Analytics Data Types
export interface PaymentAnalytics {
  totalPayments: number;
  totalAmount: number;
  averagePayment: number;
  paymentsThisMonth: number;
  paymentsThisYear: number;
  successRate: number;
  failureRate: number;
}

export interface UserAnalytics {
  userId: string;
  totalPayments: number;
  totalSpent: number;
  averagePayment: number;
  paymentFrequency: number;
  lastPaymentDate?: string;
  preferredMeterTypes: Record<string, number>;
  monthlySpending: AnalyticsTrendPoint[];
}

export interface SystemAnalytics {
  totalUsers: number;
  totalMeters: number;
  totalPayments: number;
  totalVolume: number;
  networkDistribution: Record<string, number>;
  meterTypeDistribution: Record<string, number>;
  paymentStatusDistribution: Record<string, number>;
  monthlyGrowth: AnalyticsTrendPoint[];
}

export interface PredictiveInsights {
  nextMonthPrediction: number;
  spendingTrend: "increasing" | "decreasing" | "stable";
  riskFactors: string[];
  recommendations: string[];
}

export interface AnalyticsTrendPoint {
  label: string;
  value: number;
  count?: number;
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
  private db: DatabaseService;

  constructor() {
    this.db = new DatabaseService();
  }

  /**
   * Generate comprehensive analytics report for a user
   */
  async generateUserAnalytics(userId: string): Promise<UserAnalytics> {
    try {
      const query = `
        WITH user_payments AS (
          SELECT 
            p.*, 
            m.meter_type,
            DATE_TRUNC('month', p.created_at) as payment_month
          FROM payments p
          JOIN meters m ON p.meter_id = m.meter_id
          WHERE p.user_id = $1
            AND p.status = 'confirmed'
        ),
        monthly_stats AS (
          SELECT 
            payment_month,
            COUNT(*) as payment_count,
            SUM(amount) as total_amount,
            AVG(amount) as avg_amount
          FROM user_payments
          GROUP BY payment_month
          ORDER BY payment_month DESC
          LIMIT 12
        )
        SELECT 
          COUNT(*) as total_payments,
          COALESCE(SUM(p.amount), 0) as total_spent,
          COALESCE(AVG(p.amount), 0) as avg_payment,
          MAX(p.created_at) as last_payment_date,
          COUNT(CASE WHEN p.created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as payments_this_month,
          COUNT(CASE WHEN p.created_at >= DATE_TRUNC('year', CURRENT_DATE) THEN 1 END) as payments_this_year
        FROM user_payments p
      `;

      const result = await this.db.query(query, [userId]);
      const stats = result.rows[0] || {};

      // Get meter type distribution
      const meterTypeQuery = `
        SELECT m.meter_type, COUNT(*) as count
        FROM payments p
        JOIN meters m ON p.meter_id = m.meter_id
        WHERE p.user_id = $1 AND p.status = 'confirmed'
        GROUP BY m.meter_type
      `;
      const meterTypes = await this.db.query(meterTypeQuery, [userId]);

      const preferredMeterTypes: Record<string, number> = {};
      meterTypes.rows.forEach((row) => {
        preferredMeterTypes[row.meter_type] = parseInt(row.count);
      });

      // Get monthly spending trends
      const monthlyTrendQuery = `
        SELECT 
          TO_CHAR(payment_month, 'Mon YYYY') as period,
          SUM(amount) as value,
          COUNT(*) as count
        FROM (
          SELECT p.created_at, p.amount, DATE_TRUNC('month', p.created_at) as payment_month
          FROM payments p
          JOIN meters m ON p.meter_id = m.meter_id
          WHERE p.user_id = $1 AND p.status = 'confirmed'
        ) monthly_data
        GROUP BY payment_month
        ORDER BY payment_month DESC
        LIMIT 12
      `;
      const monthlyTrends = await this.db.query(monthlyTrendQuery, [userId]);

      const monthlySpending: AnalyticsTrendPoint[] = monthlyTrends.rows
        .reverse()
        .map((row) => ({
          label: row.label,
          value: parseFloat(row.value),
          count: parseInt(row.count),
        }));

      // Calculate payment frequency (payments per month)
      const firstPayment = await this.db.query(
        'SELECT MIN(created_at) as first_payment FROM payments WHERE user_id = $1 AND status = "confirmed"',
        [userId],
      );

      let paymentFrequency = 0;
      if (firstPayment.rows[0]?.first_payment) {
        const monthsDiff = Math.max(
          1,
          (Date.now() -
            new Date(firstPayment.rows[0].first_payment).getTime()) /
            (1000 * 60 * 60 * 24 * 30),
        );
        paymentFrequency = stats.total_payments / monthsDiff;
      }

      return {
        userId,
        totalPayments: parseInt(stats.total_payments) || 0,
        totalSpent: parseFloat(stats.total_spent) || 0,
        averagePayment: parseFloat(stats.avg_payment) || 0,
        paymentFrequency: Math.round(paymentFrequency * 10) / 10,
        lastPaymentDate: stats.last_payment_date,
        preferredMeterTypes,
        monthlySpending,
      };
    } catch (error) {
      logger.error("Failed to generate user analytics", { error, userId });
      throw new Error("Analytics generation failed");
    }
  }

  /**
   * Generate system-wide analytics
   */
  async generateSystemAnalytics(): Promise<SystemAnalytics> {
    try {
      const query = `
        SELECT 
          (SELECT COUNT(*) FROM users WHERE is_active = true) as total_users,
          (SELECT COUNT(*) FROM meters WHERE is_active = true) as total_meters,
          (SELECT COUNT(*) FROM payments WHERE status = 'confirmed') as total_payments,
          (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'confirmed') as total_volume
      `;

      const result = await this.db.query(query);
      const stats = result.rows[0];

      // Get network distribution
      const networkQuery = `
        SELECT blockchain_network, COUNT(*) as count
        FROM payments
        WHERE status = 'confirmed'
        GROUP BY blockchain_network
      `;
      const networks = await this.db.query(networkQuery);
      const networkDistribution: Record<string, number> = {};
      networks.rows.forEach((row) => {
        networkDistribution[row.blockchain_network] = parseInt(row.count);
      });

      // Get meter type distribution
      const meterTypeQuery = `
        SELECT m.meter_type, COUNT(p.id) as count
        FROM meters m
        LEFT JOIN payments p ON m.meter_id = p.meter_id AND p.status = 'confirmed'
        GROUP BY m.meter_type
      `;
      const meterTypes = await this.db.query(meterTypeQuery);
      const meterTypeDistribution: Record<string, number> = {};
      meterTypes.rows.forEach((row) => {
        meterTypeDistribution[row.meter_type] = parseInt(row.count);
      });

      // Get payment status distribution
      const statusQuery = `
        SELECT status, COUNT(*) as count
        FROM payments
        GROUP BY status
      `;
      const statuses = await this.db.query(statusQuery);
      const paymentStatusDistribution: Record<string, number> = {};
      statuses.rows.forEach((row) => {
        paymentStatusDistribution[row.status] = parseInt(row.count);
      });

      // Get monthly growth trends
      const growthQuery = `
        SELECT 
          TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as label,
          COUNT(*) as value
        FROM payments
        WHERE status = 'confirmed'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at) DESC
        LIMIT 12
      `;
      const growthData = await this.db.query(growthQuery);
      const monthlyGrowth: AnalyticsTrendPoint[] = growthData.rows
        .reverse()
        .map((row) => ({
          label: row.label,
          value: parseInt(row.value),
        }));

      return {
        totalUsers: parseInt(stats.total_users) || 0,
        totalMeters: parseInt(stats.total_meters) || 0,
        totalPayments: parseInt(stats.total_payments) || 0,
        totalVolume: parseFloat(stats.total_volume) || 0,
        networkDistribution,
        meterTypeDistribution,
        paymentStatusDistribution,
        monthlyGrowth,
      };
    } catch (error) {
      logger.error("Failed to generate system analytics", { error });
      throw new Error("System analytics generation failed");
    }
  }

  /**
   * Generate predictive insights for a user
   */
  async generatePredictiveInsights(
    userId: string,
  ): Promise<PredictiveInsights> {
    try {
      const userAnalytics = await this.generateUserAnalytics(userId);
      const monthlySpending = userAnalytics.monthlySpending;

      // Calculate trend based on last 3 months
      const recentMonths = monthlySpending.slice(-3);
      let spendingTrend: "increasing" | "decreasing" | "stable" = "stable";

      if (recentMonths.length >= 2) {
        const lastMonth = recentMonths[recentMonths.length - 1].value;
        const prevMonth = recentMonths[recentMonths.length - 2].value;
        const change = (lastMonth - prevMonth) / prevMonth;

        if (change > 0.1) spendingTrend = "increasing";
        else if (change < -0.1) spendingTrend = "decreasing";
      }

      // Predict next month spending (simple moving average with trend adjustment)
      let nextMonthPrediction =
        userAnalytics.averagePayment * userAnalytics.paymentFrequency;
      if (monthlySpending.length > 0) {
        const avgRecent =
          recentMonths.reduce((sum, month) => sum + month.value, 0) /
          recentMonths.length;
        nextMonthPrediction = avgRecent;

        // Apply trend adjustment
        if (spendingTrend === "increasing") nextMonthPrediction *= 1.05;
        else if (spendingTrend === "decreasing") nextMonthPrediction *= 0.95;
      }

      // Identify risk factors
      const riskFactors: string[] = [];
      if (userAnalytics.paymentFrequency > 10)
        riskFactors.push("High payment frequency may indicate budget issues");
      if (userAnalytics.averagePayment > 1000)
        riskFactors.push("High average payment amounts");
      if (spendingTrend === "increasing")
        riskFactors.push("Spending trend is increasing");

      // Generate recommendations
      const recommendations: string[] = [];
      if (
        userAnalytics.preferredMeterTypes.electricity >
        userAnalytics.preferredMeterTypes.water
      ) {
        recommendations.push(
          "Consider energy-saving measures to reduce electricity costs",
        );
      }
      if (spendingTrend === "increasing") {
        recommendations.push("Review recent payments for unusual activity");
        recommendations.push("Consider setting up payment alerts");
      }
      recommendations.push(
        "Regular payment schedule can help with budget planning",
      );

      return {
        nextMonthPrediction: Math.round(nextMonthPrediction * 100) / 100,
        spendingTrend,
        riskFactors,
        recommendations,
      };
    } catch (error) {
      logger.error("Failed to generate predictive insights", { error, userId });
      throw new Error("Predictive insights generation failed");
    }
  }

  /**
   * Get payment analytics for a specific meter
   */
  async getMeterAnalytics(meterId: string): Promise<PaymentAnalytics> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_payments,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(AVG(amount), 0) as average_payment,
          COUNT(CASE WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as payments_this_month,
          COUNT(CASE WHEN created_at >= DATE_TRUNC('year', CURRENT_DATE) THEN 1 END) as payments_this_year,
          COUNT(CASE WHEN status = 'confirmed' THEN 1 END) * 100.0 / COUNT(*) as success_rate,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) * 100.0 / COUNT(*) as failure_rate
        FROM payments
        WHERE meter_id = $1
      `;

      const result = await this.db.query(query, [meterId]);
      const stats = result.rows[0];

      return {
        totalPayments: parseInt(stats.total_payments) || 0,
        totalAmount: parseFloat(stats.total_amount) || 0,
        averagePayment: parseFloat(stats.average_payment) || 0,
        paymentsThisMonth: parseInt(stats.payments_this_month) || 0,
        paymentsThisYear: parseInt(stats.payments_this_year) || 0,
        successRate: parseFloat(stats.success_rate) || 0,
        failureRate: parseFloat(stats.failure_rate) || 0,
      };
    } catch (error) {
      logger.error("Failed to get meter analytics", { error, meterId });
      throw new Error("Meter analytics failed");
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  static generateReport(userId: string): any {
    // This method is deprecated. Use the new async methods instead.
    logger.warn("Using deprecated generateReport method");

    const base = Math.max(1, userId.length * 7);
    const totalSpendMonthly = Number((base * 12.4).toFixed(2));
    const totalSpendYearly = Number((totalSpendMonthly * 12).toFixed(2));
    const paymentsThisMonth = Math.max(3, Math.round(base / 2));
    const averagePayment = Number(
      (totalSpendMonthly / paymentsThisMonth).toFixed(2),
    );

    const monthlyTrend = Array.from({ length: 6 }, (_, idx) => ({
      label: `${6 - idx}m ago`,
      value: Number((totalSpendMonthly * (0.7 + idx * 0.05)).toFixed(2)),
    })).reverse();

    const yearlyTrend = Array.from({ length: 5 }, (_, idx) => ({
      label: `${new Date().getFullYear() - (4 - idx)}`,
      value: Number((totalSpendYearly * (0.78 + idx * 0.05)).toFixed(2)),
    }));

    const usageWeights = {
      water: Math.min(100, Math.max(0, Math.round(((base * 1.2) / 20) * 100))),
      electricity: Math.min(
        100,
        Math.max(0, Math.round(((base * 1.6) / 25) * 100)),
      ),
      waste: Math.min(100, Math.max(0, Math.round(((base * 0.9) / 15) * 100))),
      internet: Math.min(
        100,
        Math.max(0, Math.round(((base * 0.8) / 15) * 100)),
      ),
      gas: Math.min(100, Math.max(0, Math.round(((base * 1.1) / 25) * 100))),
    };

    const totalUsage =
      Object.values(usageWeights).reduce((sum, value) => sum + value, 0) || 1;
    const utilityUsageBreakdown = Object.fromEntries(
      Object.entries(usageWeights).map(([key, value]) => [
        key,
        Math.round((value / totalUsage) * 100),
      ]),
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
      predictiveInsight: `Spending is expected to remain ${paymentsThisMonth > 8 ? "stable" : "moderate"} over the next quarter with optimization opportunities on utility usage.`,
    };
  }
}
