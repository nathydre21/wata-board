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

export interface PaymentDashboardAnalytics {
  totalPayments: number;
  totalVolume: number;
  averagePayment: number;
  successRate: number;
  failureRate: number;
  pendingRate: number;
  monthlyTrend: AnalyticsTrendPoint[];
  statusDistribution: Record<string, number>;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  insights: string[];
}

const API_BASE = '/api';

export async function fetchUserAnalytics(userId: string): Promise<AnalyticsReport> {
  const response = await fetch(`${API_BASE}/analytics/${encodeURIComponent(userId)}`);
  if (!response.ok) {
    throw new Error("Couldn't load your analytics data. Please refresh and try again.");
  }

  const data = await response.json();
  return data as AnalyticsReport;
}

export async function fetchPaymentDashboardAnalytics(): Promise<PaymentDashboardAnalytics> {
  const response = await fetch(`${API_BASE}/analytics/payments/dashboard`);
  if (!response.ok) {
    throw new Error("Couldn't load payment analytics. Please refresh and try again.");
  }

  const payload = await response.json();
  return payload.data as PaymentDashboardAnalytics;
}

export function formatCurrency(value: number): string {
  return `${value.toFixed(2)} XLM`;
}
