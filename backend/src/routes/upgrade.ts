/**
 * Contract Upgrade API Routes (#101)
 *
 * /api/upgrade/version   – current contract version
 * /api/upgrade/history   – full version history
 * /api/upgrade/execute   – deploy a new contract version (admin)
 * /api/upgrade/rollback  – rollback to a previous version (admin)
 */

import { Router, Request, Response } from 'express';
import { contractUpgradeService } from '../services/contractUpgradeService';
import { sanitizeVersion, sanitizeHex, sanitizeDescription, sanitizeAlphanumeric } from '../utils/sanitize';

const router = Router();

/** GET /api/upgrade/version */
router.get('/version', (_req: Request, res: Response) => {
  res.json({
    currentVersion: contractUpgradeService.getCurrentVersion(),
  });
});

/** GET /api/upgrade/history */
router.get('/history', (_req: Request, res: Response) => {
  res.json(contractUpgradeService.getVersionHistory());
});

/** POST /api/upgrade/execute */
router.post('/execute', async (req: Request, res: Response): Promise<void> => {
  const version = sanitizeVersion(req.body.version);
  const wasmHash = sanitizeHex(req.body.wasmHash, 64);
  const description = sanitizeDescription(req.body.description, 500);
  const rawDeployedBy = (req.headers['x-user-id'] as string) || 'unknown-admin';
  const deployedBy = sanitizeAlphanumeric(rawDeployedBy, 100) || 'unknown-admin';

  if (!version) {
    res.status(400).json({ error: 'version must be a valid semver string (e.g. 1.2.3)' });
    return;
  }
  if (!wasmHash) {
    res.status(400).json({ error: 'wasmHash must be a 64-character hex string' });
    return;
  }

  const result = await contractUpgradeService.upgradeContract(
    version,
    wasmHash,
    deployedBy,
    description,
  );

  res.status(result.success ? 200 : 500).json(result);
});

/** POST /api/upgrade/rollback */
router.post('/rollback', async (req: Request, res: Response): Promise<void> => {
  const targetVersion = sanitizeVersion(req.body.targetVersion);

  if (!targetVersion) {
    res.status(400).json({ error: 'targetVersion must be a valid semver string (e.g. 1.2.3)' });
    return;
  }

  const result = await contractUpgradeService.rollbackToVersion(targetVersion);

  res.status(result.success ? 200 : 500).json(result);
});

export default router;
