/**
 * Monitoring API Routes (#99)
 *
 * /api/monitoring/health          – system health
 * /api/monitoring/dashboard       – full dashboard snapshot
 * /api/monitoring/rate-limit-status – per-user rate-limit state
 * /api/monitoring/alerts/config   – update alert thresholds (admin)
 * /api/monitoring/verify-user     – wallet-based tier upgrade (#85)
 * /api/monitoring/users           – list all user tiers (admin)
 */

import { Request, Response, Router } from 'express';
import {
  allowKeys,
  sanitizeAlphanumeric,
  sanitizeString,
  sanitizeWalletAddress,
} from '../utils/sanitize';

import type { AlertConfig as MonitoringAlertConfig } from '../services/monitoringService';
import { metricsCollector } from '../middleware/metrics';
import { monitoringService } from '../services/monitoringService';
import { tieredRateLimiter } from '../middleware/rateLimiter';
import { userTierService } from '../services/userTierService';

const router = Router();

/** GET /api/monitoring/prometheus - Prometheus metrics export */
router.get('/prometheus', (_req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(metricsCollector.getPrometheusMetrics());
});

/** GET /api/monitoring/health */
router.get('/health', (_req: Request, res: Response) => {
  const snapshot = monitoringService.getSnapshot();
  res.json(snapshot.health);
});

/** GET /api/monitoring/dashboard */
router.get('/dashboard', (_req: Request, res: Response) => {
  const snapshot = monitoringService.getSnapshot();
  res.json(snapshot);
});

/** GET /api/monitoring/rate-limit-status */
router.get('/rate-limit-status', async (req: Request, res: Response) => {
  const rawId = (req.headers['x-user-id'] as string) || req.ip || 'unknown';
  const userId = sanitizeAlphanumeric(rawId, 100) || 'unknown';
  const status = await tieredRateLimiter.getStatus(userId);
  const tierInfo = userTierService.getUserTierInfo(userId);
  res.json({ ...status, ...tierInfo });
});

/** POST /api/monitoring/alerts/config */
router.post('/alerts/config', (req: Request, res: Response) => {
  // Only allow known numeric threshold fields
  const safe = allowKeys<MonitoringAlertConfig>(req.body, [
    'errorRateThreshold',
    'requestsPerMinuteThreshold',
    'responseTimeMsThreshold',
  ]);

  // Validate each field is a positive finite number
  const validated: Partial<MonitoringAlertConfig> = {};
  for (const [key, val] of Object.entries(safe)) {
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) {
      (validated as any)[key] = n;
    }
  }

  monitoringService.setAlertConfig(validated);
  res.json({ message: 'Alert configuration updated' });
});

/** POST /api/monitoring/verify-user */
router.post('/verify-user', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = sanitizeAlphanumeric(req.body.userId, 100);
    const walletAddress = sanitizeWalletAddress(req.body.walletAddress);
    const signature = sanitizeString(req.body.signature, 256);

    if (!userId || !walletAddress || !signature) {
      res.status(400).json({
        error: 'Missing or invalid required fields: userId (alphanumeric), walletAddress (Stellar public key), signature',
      });
      return;
    }

    const info = await userTierService.verifyUser(userId, walletAddress, signature);
    res.json(info);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** GET /api/monitoring/users */
router.get('/users', (_req: Request, res: Response) => {
  const users = userTierService.listAllUsers();
  res.json(users);
});

export default router;
