/**
 * Contract Upgrade API Routes
 *
 * GET  /api/upgrade/version          – current contract version
 * GET  /api/upgrade/history          – full version history
 * GET  /api/upgrade/proxy/status     – proxy routing + circuit breaker state
 * GET  /api/upgrade/snapshots        – list data snapshots
 * POST /api/upgrade/execute          – deploy a new contract version (admin)
 * POST /api/upgrade/rollback         – rollback to a previous version (admin)
 * POST /api/upgrade/snapshot         – manually trigger a data snapshot (admin)
 */

import { Router, Request, Response } from 'express';
import { contractUpgradeService } from '../services/contractUpgradeService';
import { sanitizeVersion, sanitizeHex, sanitizeDescription, sanitizeAlphanumeric } from '../utils/sanitize';

const router = Router();

/** GET /api/upgrade/version */
router.get('/version', (_req: Request, res: Response) => {
  res.json({ currentVersion: contractUpgradeService.getCurrentVersion() });
});

/** GET /api/upgrade/history */
router.get('/history', (_req: Request, res: Response) => {
  res.json(contractUpgradeService.getVersionHistory());
});

/** GET /api/upgrade/proxy/status */
router.get('/proxy/status', (_req: Request, res: Response) => {
  res.json(contractUpgradeService.getProxyStatus());
});

/** GET /api/upgrade/snapshots */
router.get('/snapshots', (_req: Request, res: Response) => {
  const snapshots = contractUpgradeService.getDataMigrationService().listSnapshots();
  res.json(snapshots);
});

/** POST /api/upgrade/execute */
router.post('/execute', async (req: Request, res: Response): Promise<void> => {
  const version     = sanitizeVersion(req.body.version);
  const wasmHash    = sanitizeHex(req.body.wasmHash, 64);
  const description = sanitizeDescription(req.body.description, 500);
  const contractId  = typeof req.body.contractId === 'string' ? req.body.contractId.trim() : undefined;
  const network     = req.body.network === 'mainnet' ? 'mainnet' : 'testnet';
  const rawUser     = (req.headers['x-user-id'] as string) || 'unknown-admin';
  const deployedBy  = sanitizeAlphanumeric(rawUser, 100) || 'unknown-admin';

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
    contractId,
    network,
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

/** POST /api/upgrade/snapshot */
router.post('/snapshot', async (req: Request, res: Response): Promise<void> => {
  const fromVersion = sanitizeVersion(req.body.fromVersion) ?? contractUpgradeService.getCurrentVersion();
  const toVersion   = sanitizeVersion(req.body.toVersion);
  const network     = req.body.network === 'mainnet' ? 'mainnet' : 'testnet';

  if (!toVersion) {
    res.status(400).json({ error: 'toVersion is required' });
    return;
  }

  try {
    const snapshot = await contractUpgradeService
      .getDataMigrationService()
      .captureSnapshot(fromVersion, toVersion, network);

    const valid = await contractUpgradeService
      .getDataMigrationService()
      .validateSnapshot(snapshot.id);

    res.json({
      snapshotId: snapshot.id,
      paymentCount: snapshot.paymentCount,
      totalVolume: snapshot.totalVolume,
      checksumValid: valid,
      createdAt: snapshot.createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
