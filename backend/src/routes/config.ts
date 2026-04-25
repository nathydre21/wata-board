/**
 * Configuration Version API Route
 *
 * GET /api/config/version  – returns the current config version, hash, and changelog
 * GET /api/config/snapshot – returns the full sanitised config snapshot (admin only)
 */

import { Router, Request, Response } from 'express';
import { CONFIG_VERSION, CONFIG_CHANGELOG, getLatestChange } from '../config/configVersion';
import { getCurrentSnapshot } from '../utils/configSnapshot';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/config/version
 * Public endpoint – returns version metadata and changelog.
 */
router.get('/version', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      configVersion: CONFIG_VERSION,
      latestChange: getLatestChange(),
      changelog: CONFIG_CHANGELOG,
    },
  });
});

/**
 * GET /api/config/snapshot
 * Returns the live sanitised config snapshot.
 * Restricted to requests that supply the API key header.
 */
router.get('/snapshot', (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    logger.warn('ConfigRoute: unauthorised snapshot request', { ip: req.ip });
    return res.status(401).json({ success: false, error: 'Unauthorised' });
  }

  try {
    const snapshot = getCurrentSnapshot();
    return res.status(200).json({ success: true, data: snapshot });
  } catch (err) {
    logger.error('ConfigRoute: failed to build snapshot', { error: err });
    return res.status(500).json({ success: false, error: 'Failed to retrieve config snapshot' });
  }
});

export default router;
