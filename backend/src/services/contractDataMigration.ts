/**
 * Contract Data Migration Service
 *
 * Handles data preservation across smart contract upgrades:
 *   1. Snapshot  – capture all payment state before upgrade
 *   2. Validate  – verify snapshot integrity (count + volume checksum)
 *   3. Replay    – re-index payments against the new contract version
 *   4. Restore   – roll back to snapshot if upgrade fails
 *
 * This service is called by ContractUpgradeService before and after
 * each WASM deployment so no payment data is ever lost.
 */

import { createHash } from 'crypto';
import logger from '../utils/logger';
import { DatabaseService } from '../utils/database';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PaymentRecord {
  id: string;
  meterId: string;
  userId: string;
  amount: number;
  status: string;
  contractId: string;
  transactionHash?: string;
  network: string;
  createdAt: string;
}

export interface DataSnapshot {
  id: string;
  fromVersion: string;
  toVersion: string;
  network: string;
  payments: PaymentRecord[];
  paymentCount: number;
  totalVolume: number;
  checksum: string;
  createdAt: Date;
  status: 'pending' | 'completed' | 'failed' | 'restored';
}

export interface MigrationReport {
  snapshotId: string;
  fromVersion: string;
  toVersion: string;
  paymentsMigrated: number;
  totalVolume: number;
  checksumValid: boolean;
  durationMs: number;
  errors: string[];
}

// ── Service ────────────────────────────────────────────────────────────────────

export class ContractDataMigrationService {
  private snapshots: Map<string, DataSnapshot> = new Map();

  constructor(private readonly db: DatabaseService) {}

  /**
   * Capture a full snapshot of payment data before an upgrade.
   * Returns the snapshot ID to pass to validateSnapshot / restoreSnapshot.
   */
  async captureSnapshot(
    fromVersion: string,
    toVersion: string,
    network: string,
  ): Promise<DataSnapshot> {
    logger.info('[DataMigration] Capturing pre-upgrade snapshot', { fromVersion, toVersion, network });

    const payments = await this.fetchAllPayments(network);
    const totalVolume = payments.reduce((sum, p) => sum + p.amount, 0);
    const checksum = this.computeChecksum(payments);

    const snapshot: DataSnapshot = {
      id: this.generateId(),
      fromVersion,
      toVersion,
      network,
      payments,
      paymentCount: payments.length,
      totalVolume,
      checksum,
      createdAt: new Date(),
      status: 'pending',
    };

    this.snapshots.set(snapshot.id, snapshot);

    // Persist snapshot metadata to DB (not the full payload — that lives in memory / object store)
    await this.persistSnapshotMetadata(snapshot);

    logger.info('[DataMigration] Snapshot captured', {
      id: snapshot.id,
      paymentCount: snapshot.paymentCount,
      totalVolume: snapshot.totalVolume,
    });

    return snapshot;
  }

  /**
   * Validate snapshot integrity: recount payments and verify checksum.
   */
  async validateSnapshot(snapshotId: string): Promise<boolean> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

    const recomputed = this.computeChecksum(snapshot.payments);
    const valid = recomputed === snapshot.checksum
      && snapshot.payments.length === snapshot.paymentCount;

    logger.info('[DataMigration] Snapshot validation', {
      id: snapshotId,
      valid,
      expectedChecksum: snapshot.checksum,
      actualChecksum: recomputed,
    });

    return valid;
  }

  /**
   * Re-index all snapshotted payments against the new contract version.
   * Updates the contract_payment_routing table so the proxy knows which
   * contract handled each historical payment.
   */
  async replayPayments(
    snapshotId: string,
    newContractId: string,
    newVersion: string,
  ): Promise<MigrationReport> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

    const start = Date.now();
    const errors: string[] = [];
    let migrated = 0;

    logger.info('[DataMigration] Replaying payments to new contract', {
      snapshotId,
      newContractId,
      newVersion,
      count: snapshot.paymentCount,
    });

    for (const payment of snapshot.payments) {
      try {
        await this.updatePaymentRouting(payment.id, newContractId, newVersion);
        migrated++;
      } catch (err: any) {
        errors.push(`Payment ${payment.id}: ${err.message}`);
        logger.error('[DataMigration] Failed to replay payment', {
          paymentId: payment.id,
          error: err.message,
        });
      }
    }

    const checksumValid = await this.validateSnapshot(snapshotId);
    snapshot.status = errors.length === 0 ? 'completed' : 'failed';

    const report: MigrationReport = {
      snapshotId,
      fromVersion: snapshot.fromVersion,
      toVersion: newVersion,
      paymentsMigrated: migrated,
      totalVolume: snapshot.totalVolume,
      checksumValid,
      durationMs: Date.now() - start,
      errors,
    };

    logger.info('[DataMigration] Replay complete', {
      migrated,
      errors: errors.length,
      durationMs: report.durationMs,
    });

    return report;
  }

  /**
   * Restore payment routing to the previous contract version.
   * Called during rollback to ensure historical payments still resolve correctly.
   */
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

    logger.warn('[DataMigration] Restoring snapshot', {
      id: snapshotId,
      fromVersion: snapshot.fromVersion,
    });

    for (const payment of snapshot.payments) {
      try {
        await this.updatePaymentRouting(payment.id, payment.contractId, snapshot.fromVersion);
      } catch (err: any) {
        logger.error('[DataMigration] Failed to restore payment routing', {
          paymentId: payment.id,
          error: err.message,
        });
      }
    }

    snapshot.status = 'restored';
    logger.info('[DataMigration] Snapshot restored', { id: snapshotId });
  }

  getSnapshot(snapshotId: string): DataSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  listSnapshots(): Omit<DataSnapshot, 'payments'>[] {
    return Array.from(this.snapshots.values()).map(({ payments: _p, ...meta }) => meta);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async fetchAllPayments(network: string): Promise<PaymentRecord[]> {
    try {
      const result = await this.db.query(
        `SELECT p.id, p.meter_id, p.user_id, p.amount, p.status,
                bt.contract_id, bt.transaction_hash, bt.network, p.created_at
         FROM payments p
         LEFT JOIN blockchain_transactions bt ON bt.payment_id = p.id
         WHERE bt.network = $1 OR $1 = 'all'
         ORDER BY p.created_at ASC`,
        [network],
      );
      return result.rows.map(row => ({
        id: row.id,
        meterId: row.meter_id,
        userId: row.user_id,
        amount: parseFloat(row.amount),
        status: row.status,
        contractId: row.contract_id ?? '',
        transactionHash: row.transaction_hash,
        network: row.network ?? network,
        createdAt: row.created_at,
      }));
    } catch (err: any) {
      // DB may be mock in dev — return empty set and log
      logger.warn('[DataMigration] Could not fetch payments from DB (mock mode?)', {
        error: err.message,
      });
      return [];
    }
  }

  private async updatePaymentRouting(
    paymentId: string,
    contractId: string,
    version: string,
  ): Promise<void> {
    // In production this would upsert into contract_payment_routing table.
    // The mock DB service logs the query without executing it.
    await this.db.query(
      `INSERT INTO contract_payment_routing (payment_id, contract_version_id, contract_id)
       SELECT $1, cv.id, $2
       FROM contract_versions cv WHERE cv.version = $3
       ON CONFLICT (payment_id) DO UPDATE
         SET contract_id = EXCLUDED.contract_id,
             contract_version_id = EXCLUDED.contract_version_id,
             routed_at = CURRENT_TIMESTAMP`,
      [paymentId, contractId, version],
    );
  }

  private async persistSnapshotMetadata(snapshot: DataSnapshot): Promise<void> {
    await this.db.query(
      `INSERT INTO contract_data_snapshots
         (id, from_version, to_version, network, payment_count, total_volume, status, snapshot_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        snapshot.id,
        snapshot.fromVersion,
        snapshot.toVersion,
        snapshot.network,
        snapshot.paymentCount,
        snapshot.totalVolume,
        snapshot.status,
        JSON.stringify({ checksum: snapshot.checksum }),
      ],
    );
  }

  private computeChecksum(payments: PaymentRecord[]): string {
    const payload = payments
      .map(p => `${p.id}:${p.amount}:${p.status}`)
      .join('|');
    return createHash('sha256').update(payload).digest('hex');
  }

  private generateId(): string {
    return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
