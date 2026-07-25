import express from "express";
import { AnalyticsService } from "../services/analyticsService";
import logger from "../utils/logger";
import {
  sanitizeAlphanumeric,
  sanitizeMeterId,
  sanitizeString,
  sanitizePositiveNumber,
  sanitizeInteger,
  validationError,
  type ValidationError,
} from "../utils/sanitize";

const router = express.Router();
const analyticsService = new AnalyticsService();

/**
 * GET /api/analytics/user/:userId
 * Get comprehensive analytics for a specific user
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Invalid User ID format",
      });
    }

    const analytics = await analyticsService.generateUserAnalytics(userId);

    logger.info("User analytics retrieved", { userId });
    return res.status(200).json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to retrieve user analytics", {
      error,
      userId: req.params.userId,
    });
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve user analytics",
    });
  }
});

/**
 * GET /api/analytics/system
 * Get system-wide analytics (admin only)
 * Query params: page (default 1), limit (default 12)
 */
router.get("/system", async (req, res) => {
  try {
    const errors: ValidationError[] = [];

    const rawPage  = sanitizeInteger(req.query.page  ?? '1',  1, 10_000);
    const rawLimit = sanitizeInteger(req.query.limit ?? '12', 1, 100);

    if (req.query.page  !== undefined && Number.isNaN(rawPage))  errors.push(validationError('page',  'page must be a positive integer (1–10000)'));
    if (req.query.limit !== undefined && Number.isNaN(rawLimit)) errors.push(validationError('limit', 'limit must be an integer between 1 and 100'));
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const page  = Number.isNaN(rawPage)  ? 1  : rawPage;
    const limit = Number.isNaN(rawLimit) ? 12 : rawLimit;

    // TODO: Add admin authentication check
    const analytics = await analyticsService.generateSystemAnalytics();

    // Paginate monthlyGrowth
    const all = analytics.monthlyGrowth;
    const total = all.length;
    const offset = (page - 1) * limit;
    const pagedGrowth = all.slice(offset, offset + limit);

    logger.info("System analytics retrieved", { page, limit });
    return res.status(200).json({
      success: true,
      data: {
        ...analytics,
        monthlyGrowth: pagedGrowth,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: offset + limit < total,
        hasPreviousPage: page > 1,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to retrieve system analytics", { error });
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve system analytics",
    });
  }
});

/**
 * GET /api/analytics/monthly-growth
 * Get paginated monthly growth data
 * Query params: page (default 1), limit (default 12)
 */
router.get("/monthly-growth", async (req, res) => {
  try {
    const errors: ValidationError[] = [];

    const rawPage  = sanitizeInteger(req.query.page  ?? '1',  1, 10_000);
    const rawLimit = sanitizeInteger(req.query.limit ?? '12', 1, 100);

    if (req.query.page  !== undefined && Number.isNaN(rawPage))  errors.push(validationError('page',  'page must be a positive integer (1–10000)'));
    if (req.query.limit !== undefined && Number.isNaN(rawLimit)) errors.push(validationError('limit', 'limit must be an integer between 1 and 100'));
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const page  = Number.isNaN(rawPage)  ? 1  : rawPage;
    const limit = Number.isNaN(rawLimit) ? 12 : rawLimit;

    const result = await analyticsService.getPaginatedMonthlyGrowth({ page, limit });

    logger.info("Monthly growth analytics retrieved", { page, limit });
    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to retrieve monthly growth analytics", { error });
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve monthly growth analytics",
    });
  }
});

/**
 * GET /api/analytics/payments/dashboard
 * Get payment analytics dashboard insights
 */
router.get("/payments/dashboard", async (_req, res) => {
  try {
    const analytics = await analyticsService.getPaymentDashboardAnalytics();

    logger.info("Payment dashboard analytics retrieved");
    return res.status(200).json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to retrieve payment dashboard analytics", { error });
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve payment dashboard analytics",
    });
  }
});

/**
 * GET /api/analytics/predictive/:userId
 * Get predictive insights for a user
 */
router.get("/predictive/:userId", async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Invalid User ID format",
      });
    }

    const insights = await analyticsService.generatePredictiveInsights(userId);

    logger.info("Predictive insights retrieved", { userId });
    return res.status(200).json({
      success: true,
      data: insights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to retrieve predictive insights", {
      error,
      userId: req.params.userId,
    });
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve predictive insights",
    });
  }
});

/**
 * GET /api/analytics/meter/:meterId
 * Get analytics for a specific meter
 */
router.get("/meter/:meterId", async (req, res) => {
  try {
    const meterId = sanitizeMeterId(req.params.meterId);
    if (!meterId) {
      return res.status(400).json({
        success: false,
        error: "meterId must be 3-50 alphanumeric characters (hyphens and underscores allowed)",
      });
    }

    const analytics = await analyticsService.getMeterAnalytics(meterId);

    logger.info("Meter analytics retrieved", { meterId });
    return res.status(200).json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to retrieve meter analytics", {
      error,
      meterId: req.params.meterId,
    });
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve meter analytics",
    });
  }
});

/**
 * GET /api/analytics/summary/:userId
 * Get a quick summary of user analytics (lightweight endpoint)
 */
router.get("/summary/:userId", async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Invalid User ID format",
      });
    }

    // Get user analytics (this is cached in the service)
    const userAnalytics = await analyticsService.generateUserAnalytics(userId);

    // Create a lightweight summary
    const summary = {
      userId: userAnalytics.userId,
      totalPayments: userAnalytics.totalPayments,
      totalSpent: userAnalytics.totalSpent,
      averagePayment: userAnalytics.averagePayment,
      paymentsThisMonth: userAnalytics.monthlySpending.slice(-1)[0]?.value || 0,
      paymentFrequency: userAnalytics.paymentFrequency,
      lastPaymentDate: userAnalytics.lastPaymentDate,
    };

    logger.info("User analytics summary retrieved", { userId });
    return res.status(200).json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to retrieve user analytics summary", {
      error,
      userId: req.params.userId,
    });
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve analytics summary",
    });
  }
});

/**
 * GET /api/analytics/trends/:userId
 * Get spending trends for a user
 */
router.get("/trends/:userId", async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Invalid User ID format",
      });
    }

    const userAnalytics = await analyticsService.generateUserAnalytics(userId);

    // Return only the trend data
    const trends = {
      monthlySpending: userAnalytics.monthlySpending,
      preferredMeterTypes: userAnalytics.preferredMeterTypes,
    };

    logger.info("User spending trends retrieved", { userId });
    return res.status(200).json({
      success: true,
      data: trends,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to retrieve user spending trends", {
      error,
      userId: req.params.userId,
    });
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve spending trends",
    });
  }
});

/**
 * GET /api/analytics/health
 * Health check for analytics service
 */
router.get("/health", async (req, res) => {
  try {
    // Simple health check for analytics service
    return res.status(200).json({
      success: true,
      data: {
        status: "healthy",
        service: "analytics",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Analytics health check failed", { error });
    return res.status(500).json({
      success: false,
      error: "Analytics service health check failed",
    });
  }
});

export default router;
