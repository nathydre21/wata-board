import logger from "./logger";

// Mock database service for development without PostgreSQL
// In production, this would be replaced with actual PostgreSQL implementation
export interface QueryResult {
  rows: any[];
  rowCount: number | null;
}

export class DatabaseService {
  /**
   * Mock query execution - returns sample data for analytics
   */
  async query(text: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();

    // Simulate database delay using a simple timeout
    const startMs = Date.now();
    while (Date.now() - startMs < 10) {
      // Simple busy wait to simulate delay
    }

    const duration = Date.now() - start;
    logger.debug("Mock database query executed", {
      query: text.substring(0, 100),
      duration: `${duration}ms`,
      params: params?.length || 0,
    });

    // Return mock data based on query patterns
    if (
      text.includes("user_payments") ||
      text.includes("payments WHERE user_id")
    ) {
      return this.generateMockUserData(params?.[0]);
    } else if (text.includes("COUNT(*) FROM users")) {
      return { rows: [{ total_users: 150 }], rowCount: 1 };
    } else if (text.includes("COUNT(*) FROM meters")) {
      return { rows: [{ total_meters: 450 }], rowCount: 1 };
    } else if (text.includes("COUNT(*) FROM payments WHERE status")) {
      return { rows: [{ total_payments: 2500 }], rowCount: 1 };
    } else if (text.includes("SUM(amount) FROM payments")) {
      return { rows: [{ total_volume: 125000.5 }], rowCount: 1 };
    } else if (text.includes("blockchain_network")) {
      return {
        rows: [
          { blockchain_network: "testnet", count: 2000 },
          { blockchain_network: "mainnet", count: 500 },
        ],
        rowCount: 2,
      };
    } else if (text.includes("meter_type")) {
      return {
        rows: [
          { meter_type: "electricity", count: 200 },
          { meter_type: "water", count: 150 },
          { meter_type: "gas", count: 100 },
        ],
        rowCount: 3,
      };
    } else if (text.includes("status") && text.includes("GROUP BY status")) {
      return {
        rows: [
          { status: "confirmed", count: 2200 },
          { status: "pending", count: 200 },
          { status: "failed", count: 100 },
        ],
        rowCount: 3,
      };
    }

    // Default empty result
    return { rows: [], rowCount: 0 };
  }

  /**
   * Generate mock user data for analytics
   */
  private generateMockUserData(userId: string): QueryResult {
    const seed = userId.length + userId.charCodeAt(0);
    const totalPayments = Math.max(5, (seed * 3) % 50);
    const totalSpent = Math.round(seed * 123.45 * 100) / 100;
    const avgPayment = Math.round((totalSpent / totalPayments) * 100) / 100;

    // Generate monthly spending data
    const monthlyData = [];
    const currentDate = new Date();
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - i,
        1,
      );
      const monthValue =
        Math.round(avgPayment * (2 + Math.random() * 3) * 100) / 100;
      monthlyData.push({
        period: monthDate.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
        value: monthValue,
        count: Math.floor(2 + Math.random() * 4),
      });
    }

    return {
      rows: [
        {
          total_payments: totalPayments,
          total_spent: totalSpent,
          avg_payment: avgPayment,
          last_payment_date: new Date(
            Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          payments_this_month: Math.floor(1 + Math.random() * 5),
          payments_this_year: totalPayments,
          monthly_data: monthlyData,
        },
      ],
      rowCount: 1,
    };
  }

  /**
   * Mock transaction support
   */
  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    // For mock implementation, just execute the callback
    return callback(null);
  }

  /**
   * Mock connection test
   */
  async testConnection(): Promise<boolean> {
    logger.info("Mock database connection test successful");
    return true;
  }

  /**
   * Mock close method
   */
  async close(): Promise<void> {
    logger.info("Mock database connection closed");
  }
}

// Export singleton instance
export const database = new DatabaseService();
