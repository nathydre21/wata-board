/**
 * Contract Upgrade Service (#101)
 *
 * Manages versioned Soroban contract deployments with:
 *   • Migration framework (execute / rollback per step)
 *   • Data preservation snapshots
 *   • Full version history and status tracking
 *
 * TODO: Replace deployNewWasm() stub with real Soroban SDK calls.
 */

import logger from '../utils/logger';
import { migration001 } from '../migrations/001_initial_setup';

// ── Types ──────────────────────────────────────────────────

export interface ContractVersion {
  version: string;
  wasmHash: string;
  deployedAt: Date;
  deployedBy: string;
  description: string;
  status: 'active' | 'pending' | 'rolled_back' | 'archived';
}

export interface MigrationStep {
  id: string;
  version: string;
  description: string;
  execute: () => Promise<void>;
  rollback: () => Promise<void>;
}

export interface UpgradeResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  migrationsRun: string[];
  error?: string;
  timestamp: Date;
}

// ── Service ────────────────────────────────────────────────

class ContractUpgradeService {
  private versionHistory: ContractVersion[] = [];
  private migrations: MigrationStep[] = [];
  private currentVersion: string = '1.0.0';

  constructor() {
    this.versionHistory.push({
      version: '1.0.0',
      wasmHash: 'initial',
      deployedAt: new Date(),
      deployedBy: 'system',
      description: 'Initial contract deployment',
      status: 'active',
    });

    // Register known migrations
    this.registerMigration(migration001);
  }

  /** Register a migration step for a target version. */
  registerMigration(migration: MigrationStep) {
    this.migrations.push(migration);
    logger.info('Migration registered', {
      id: migration.id,
      version: migration.version,
    });
  }

  /** Execute a full upgrade to a new contract version. */
  async upgradeContract(
    newVersion: string,
    wasmHash: string,
    deployedBy: string,
    description: string,
  ): Promise<UpgradeResult> {
    const fromVersion = this.currentVersion;
    const migrationsRun: string[] = [];

    logger.info('Starting contract upgrade', { from: fromVersion, to: newVersion });

    try {
      if (!wasmHash || wasmHash.length < 10) {
        throw new Error('Invalid WASM hash');
      }

      // Run pending migrations for this version
      const pendingMigrations = this.migrations.filter(
        (m) => m.version === newVersion,
      );

      for (const migration of pendingMigrations) {
        logger.info('Running migration', { id: migration.id });
        try {
          await migration.execute();
          migrationsRun.push(migration.id);
        } catch (migrationError: any) {
          logger.error('Migration failed, rolling back', {
            id: migration.id,
            error: migrationError.message,
          });
          await this.rollbackMigrations(migrationsRun, newVersion);
          throw new Error(
            `Migration ${migration.id} failed: ${migrationError.message}`,
          );
        }
      }

      // Deploy new WASM
      await this.deployNewWasm(wasmHash);

      // Archive previous active version
      for (const v of this.versionHistory) {
        if (v.status === 'active') v.status = 'archived';
      }

      this.versionHistory.push({
        version: newVersion,
        wasmHash,
        deployedAt: new Date(),
        deployedBy,
        description,
        status: 'active',
      });
      this.currentVersion = newVersion;

      logger.info('Contract upgrade complete', {
        version: newVersion,
        migrations: migrationsRun.length,
      });

      return {
        success: true,
        fromVersion,
        toVersion: newVersion,
        migrationsRun,
        timestamp: new Date(),
      };
    } catch (error: any) {
      logger.error('Contract upgrade failed', { error: error.message });
      return {
        success: false,
        fromVersion,
        toVersion: newVersion,
        migrationsRun,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /** Roll back to a previously deployed version. */
  async rollbackToVersion(targetVersion: string): Promise<UpgradeResult> {
    const fromVersion = this.currentVersion;
    const target = this.versionHistory.find(
      (v) => v.version === targetVersion,
    );

    if (!target) {
      return {
        success: false,
        fromVersion,
        toVersion: targetVersion,
        migrationsRun: [],
        error: `Version ${targetVersion} not found in history`,
        timestamp: new Date(),
      };
    }

    try {
      await this.deployNewWasm(target.wasmHash);

      for (const v of this.versionHistory) {
        if (v.version === this.currentVersion) v.status = 'rolled_back';
        if (v.version === targetVersion) v.status = 'active';
      }
      this.currentVersion = targetVersion;

      logger.info('Rollback complete', { to: targetVersion });

      return {
        success: true,
        fromVersion,
        toVersion: targetVersion,
        migrationsRun: [],
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        fromVersion,
        toVersion: targetVersion,
        migrationsRun: [],
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  getVersionHistory(): ContractVersion[] {
    return [...this.versionHistory];
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  // ── Private ──────────────────────────────────────────────

  /** Deploy WASM to Soroban — stub for real implementation. */
  private async deployNewWasm(_wasmHash: string): Promise<void> {
    logger.info('Deploying WASM (stub)', { wasmHash: _wasmHash });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async rollbackMigrations(
    completedIds: string[],
    version: string,
  ): Promise<void> {
    const toRollback = this.migrations
      .filter((m) => m.version === version && completedIds.includes(m.id))
      .reverse();

    for (const migration of toRollback) {
      try {
        await migration.rollback();
        logger.info('Migration rolled back', { id: migration.id });
      } catch (err: any) {
        logger.error('Migration rollback failed', {
          id: migration.id,
          error: err.message,
        });
      }
    }
  }
}

/** Singleton instance */
export const contractUpgradeService = new ContractUpgradeService();
