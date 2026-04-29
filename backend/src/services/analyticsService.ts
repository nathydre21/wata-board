import {
  PaymentRequest,
  PaymentResponse,
  RateLimitInfo,
  createApiResponse,
} from "../../shared/types";
import { DatabaseService } from "../utils/database";
import { cacheService } from "./cacheService";
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
    const cacheKey = `user_analytics_${userId}`;
    
    return cacheService.getOrSet(cacheKey, async () => {
      try {
        // Optimized single query to get all user analytics data
        const optimizedQuery = `
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
          user_stats AS (
            SELECT 
              COUNT(*) as total_payments,
              COALESCE(SUM(p.amount), 0) as total_spent,
              COALESCE(AVG(p.amount), 0) as avg_payment,
              MAX(p.created_at) as last_payment_date,
              MIN(p.created_at) as first_payment_date,
              COUNT(CASE WHEN p.created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as payments_this_month,
              COUNT(CASE WHEN p.created_at >= DATE_TRUNC('year', CURRENT_DATE) THEN 1 END) as payments_this_year
            FROM user_payments p
          ),
          meter_types AS (
            SELECT m.meter_type, COUNT(*) as count
            FROM user_payments p
            GROUP BY p.meter_type
          ),
          monthly_trends AS (
            SELECT 
              TO_CHAR(payment_month, 'Mon YYYY') as period,
              SUM(amount) as value,
              COUNT(*) as count
            FROM user_payments
            GROUP BY payment_month
            ORDER BY payment_month DESC
            LIMIT 12
          )
          SELECT 
            s.*,
            (SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'meter_type', mt.meter_type,
                'count', mt.count
              )
            ) FROM meter_types mt) as meter_type_distribution,
            (SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'period', mt.period,
                'value', mt.value,
                'count', mt.count
              ) ORDER BY mt.period) FROM monthly_trends mt) as monthly_spending
          FROM user_stats s
        `;

        const result = await this.db.query(optimizedQuery, [userId]);
        const stats = result.rows[0] || {};

        // Parse meter type distribution
        const preferredMeterTypes: Record<string, number> = {};
        if (stats.meter_type_distribution) {
          const meterTypes = JSON.parse(stats.meter_type_distribution);
          meterTypes.forEach((item: any) => {
            preferredMeterTypes[item.meter_type] = parseInt(item.count);
          });
        }

        // Parse monthly spending trends
        const monthlySpending: AnalyticsTrendPoint[] = [];
        if (stats.monthly_spending) {
          const trends = JSON.parse(stats.monthly_spending);
          trends.reverse().forEach((item: any) => {
            monthlySpending.push({
              label: item.period,
              value: parseFloat(item.value),
              count: parseInt(item.count),
            });
          });
        }

        // Calculate payment frequency (payments per month)
        let paymentFrequency = 0;
        if (stats.first_payment_date) {
          const monthsDiff = Math.max(
            1,
            (Date.now() -
              new Date(stats.first_payment_date).getTime()) /
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
    }, 10 * 60 * 1000); // Cache for 10 minutes
  }

  /**
   * Generate system-wide analytics
   */
  async generateSystemAnalytics(): Promise<SystemAnalytics> {
    const cacheKey = 'system_analytics';
    
    return cacheService.getOrSet(cacheKey, async () => {
      try {
        // Optimized single query for all system analytics
        const optimizedQuery = `
          WITH system_stats AS (
            SELECT 
              (SELECT COUNT(*) FROM users WHERE is_active = true) as total_users,
              (SELECT COUNT(*) FROM meters WHERE is_active = true) as total_meters,
              (SELECT COUNT(*) FROM payments WHERE status = 'confirmed') as total_payments,
              (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'confirmed') as total_volume
          ),
          network_distribution AS (
            SELECT blockchain_network, COUNT(*) as count
            FROM payments
            WHERE status = 'confirmed'
            GROUP BY blockchain_network
          ),
          meter_type_distribution AS (
            SELECT m.meter_type, COUNT(p.id) as count
            FROM meters m
            LEFT JOIN payments p ON m.meter_id = p.meter_id AND p.status = 'confirmed'
            GROUP BY m.meter_type
          ),
          payment_status_distribution AS (
            SELECT status, COUNT(*) as count
            FROM payments
            GROUP BY status
          ),
          monthly_growth AS (
            SELECT 
              TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as label,
              COUNT(*) as value
            FROM payments
            WHERE status = 'confirmed'
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY DATE_TRUNC('month', created_at) DESC
            LIMIT 12
          )
          SELECT 
            s.*,
            (SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'blockchain_network', nd.blockchain_network,
                'count', nd.count
              )
            ) FROM network_distribution nd) as network_distribution,
            (SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'meter_type', mtd.meter_type,
                'count', mtd.count
              )
            ) FROM meter_type_distribution mtd) as meter_type_distribution,
            (SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'status', psd.status,
                'count', psd.count
              )
            ) FROM payment_status_distribution psd) as payment_status_distribution,
            (SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'label', mg.label,
                'value', mg.value
              ) ORDER BY mg.label) FROM monthly_growth mg) as monthly_growth
          FROM system_stats s
        `;

        const result = await this.db.query(optimizedQuery);
        const stats = result.rows[0];

        // Parse distributions
        const networkDistribution: Record<string, number> = {};
        if (stats.network_distribution) {
          const networks = JSON.parse(stats.network_distribution);
          networks.forEach((item: any) => {
            networkDistribution[item.blockchain_network] = parseInt(item.count);
          });
        }

        const meterTypeDistribution: Record<string, number> = {};
        if (stats.meter_type_distribution) {
          const meterTypes = JSON.parse(stats.meter_type_distribution);
          meterTypes.forEach((item: any) => {
            meterTypeDistribution[item.meter_type] = parseInt(item.count);
          });
        }

        const paymentStatusDistribution: Record<string, number> = {};
        if (stats.payment_status_distribution) {
          const statuses = JSON.parse(stats.payment_status_distribution);
          statuses.forEach((item: any) => {
            paymentStatusDistribution[item.status] = parseInt(item.count);
          });
        }

        const monthlyGrowth: AnalyticsTrendPoint[] = [];
        if (stats.monthly_growth) {
          const growth = JSON.parse(stats.monthly_growth);
          growth.reverse().forEach((item: any) => {
            monthlyGrowth.push({
              label: item.label,
              value: parseInt(item.value),
            });
          });
        }

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
    }, 15 * 60 * 1000); // Cache for 15 minutes
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
