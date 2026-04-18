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

import { Router, Request, Response } from 'express';
import { monitoringService } from '../services/monitoringService';
import { tieredRateLimiter } from '../middleware/rateLimiter';
import { userTierService } from '../services/userTierService';

const router = Router();

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
router.get('/rate-limit-status', (req: Request, res: Response) => {
  const userId =
    (req.headers['x-user-id'] as string) || req.ip || 'unknown';
  const status = tieredRateLimiter.getStatus(userId);
  const tierInfo = userTierService.getUserTierInfo(userId);
  res.json({ ...status, ...tierInfo });
});

/** POST /api/monitoring/alerts/config */
router.post('/alerts/config', (req: Request, res: Response) => {
  monitoringService.setAlertConfig(req.body);
  res.json({ message: 'Alert configuration updated' });
});

/** POST /api/monitoring/verify-user */
router.post('/verify-user', async (req: Request, res: Response) => {
  try {
    const { userId, walletAddress, signature } = req.body;
    if (!userId || !walletAddress || !signature) {
      return res.status(400).json({ error: 'Missing required fields: userId, walletAddress, signature' });
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
