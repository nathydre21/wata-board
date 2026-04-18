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
router.post('/execute', async (req: Request, res: Response) => {
  const { version, wasmHash, description } = req.body;
  const deployedBy =
    (req.headers['x-user-id'] as string) || 'unknown-admin';

  if (!version || !wasmHash) {
    return res
      .status(400)
      .json({ error: 'version and wasmHash are required' });
  }

  const result = await contractUpgradeService.upgradeContract(
    version,
    wasmHash,
    deployedBy,
    description || '',
  );

  res.status(result.success ? 200 : 500).json(result);
});

/** POST /api/upgrade/rollback */
router.post('/rollback', async (req: Request, res: Response) => {
  const { targetVersion } = req.body;

  if (!targetVersion) {
    return res.status(400).json({ error: 'targetVersion is required' });
  }

  const result =
    await contractUpgradeService.rollbackToVersion(targetVersion);

  res.status(result.success ? 200 : 500).json(result);
});

export default router;
