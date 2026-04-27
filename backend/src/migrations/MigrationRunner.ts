import { Pool, PoolClient } from 'pg';
import { Migration, MigrationResult, MigrationStatus } from './Migration';
import { createHash } from 'crypto';

export class MigrationRunner {
  private pool: Pool;
  private migrations: Map<string, Migration> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async initialize(): Promise<void> {
    await this.createMigrationTable();
  }

  private async createMigrationTable(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64) NOT NULL,
          execution_time_ms INTEGER,
          success BOOLEAN NOT NULL DEFAULT true,
          error_message TEXT
        );
        
        CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at 
        ON schema_migrations(executed_at);
      `);
    } finally {
      client.release();
    }
  }

  registerMigration(migration: Migration): void {
    if (this.migrations.has(migration.id)) {
      throw new Error(`Migration with id '${migration.id}' is already registered`);
    }
    this.migrations.set(migration.id, migration);
  }

  getRegisteredMigrations(): Migration[] {
    return Array.from(this.migrations.values()).sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  async getExecutedMigrations(): Promise<MigrationStatus[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT id, name, executed_at, 
               CASE WHEN success THEN 'executed' ELSE 'failed' END as status,
               checksum
        FROM schema_migrations 
        ORDER BY executed_at
      `);
      
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        executedAt: row.executed_at,
        status: row.status as 'pending' | 'executed' | 'failed',
        checksum: row.checksum
      }));
    } finally {
      client.release();
    }
  }

  async getPendingMigrations(): Promise<Migration[]> {
    const executed = await this.getExecutedMigrations();
    const executedIds = new Set(executed.map(m => m.id));
    
    return this.getRegisteredMigrations().filter(migration => 
      !executedIds.has(migration.id)
    );
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    const registered = this.getRegisteredMigrations();
    const executed = await this.getExecutedMigrations();
    const executedMap = new Map(executed.map(e => [e.id, e]));

    return registered.map(migration => {
      const executed = executedMap.get(migration.id);
      return {
        id: migration.id,
        name: migration.name,
        executedAt: executed?.executedAt,
        status: executed ? executed.status : 'pending',
        checksum: executed?.checksum
      };
    });
  }

  private calculateMigrationChecksum(migration: Migration): string {
    const content = `${migration.id}:${migration.name}:${migration.timestamp.getTime()}`;
    return createHash('sha256').update(content).digest('hex');
  }

  private async validateDependencies(migration: Migration): Promise<void> {
    if (!migration.dependencies || migration.dependencies.length === 0) {
      return;
    }

    const executed = await this.getExecutedMigrations();
    const executedIds = new Set(executed.map(m => m.id));

    for (const depId of migration.dependencies) {
      if (!executedIds.has(depId)) {
        throw new Error(`Migration '${migration.id}' depends on '${depId}' which has not been executed`);
      }
    }
  }

  async executeMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();
    const checksum = this.calculateMigrationChecksum(migration);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Validate dependencies
      await this.validateDependencies(migration);

      // Check if migration already exists
      const existingResult = await client.query(
        'SELECT id FROM schema_migrations WHERE id = $1',
        [migration.id]
      );

      if (existingResult.rows.length > 0) {
        throw new Error(`Migration '${migration.id}' has already been executed`);
      }

      // Execute the migration
      await migration.up();

      // Record successful execution
      const duration = Date.now() - startTime;
      await client.query(`
        INSERT INTO schema_migrations 
        (id, name, checksum, execution_time_ms, success)
        VALUES ($1, $2, $3, $4, $5)
      `, [migration.id, migration.name, checksum, duration, true]);

      await client.query('COMMIT');

      return {
        success: true,
        migrationId: migration.id,
        duration
      };
    } catch (error) {
      await client.query('ROLLBACK');
      
      // Record failed execution
      try {
        await client.query(`
          INSERT INTO schema_migrations 
          (id, name, checksum, execution_time_ms, success, error_message)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [migration.id, migration.name, checksum, Date.now() - startTime, false, 
            error instanceof Error ? error.message : String(error)]);
      } catch (recordError) {
        // If we can't record the error, log it but don't throw
        console.error('Failed to record migration error:', recordError);
      }

      return {
        success: false,
        migrationId: migration.id,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    } finally {
      client.release();
    }
  }

  async rollbackMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check if migration was executed
      const existingResult = await client.query(
        'SELECT id FROM schema_migrations WHERE id = $1 AND success = true',
        [migration.id]
      );

      if (existingResult.rows.length === 0) {
        throw new Error(`Migration '${migration.id}' was not successfully executed or does not exist`);
      }

      // Execute rollback
      await migration.down();

      // Remove from executed migrations
      await client.query('DELETE FROM schema_migrations WHERE id = $1', [migration.id]);

      await client.query('COMMIT');

      return {
        success: true,
        migrationId: migration.id,
        duration: Date.now() - startTime
      };
    } catch (error) {
      await client.query('ROLLBACK');
      
      return {
        success: false,
        migrationId: migration.id,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    } finally {
      client.release();
    }
  }

  async migrateUp(targetMigrationId?: string): Promise<MigrationResult[]> {
    const pending = await this.getPendingMigrations();
    const toExecute = targetMigrationId 
      ? pending.filter(m => m.id <= targetMigrationId)
      : pending;

    if (toExecute.length === 0) {
      return [];
    }

    const results: MigrationResult[] = [];
    for (const migration of toExecute) {
      const result = await this.executeMigration(migration);
      results.push(result);
      
      if (!result.success) {
        // Stop execution on first failure
        break;
      }
    }

    return results;
  }

  async migrateDown(targetMigrationId?: string): Promise<MigrationResult[]> {
    const executed = await this.getExecutedMigrations();
    const successfulExecuted = executed
      .filter(m => m.status === 'executed')
      .map(m => this.migrations.get(m.id))
      .filter((m): m is Migration => m !== undefined)
      .reverse();

    const toRollback = targetMigrationId
      ? successfulExecuted.filter(m => m.id >= targetMigrationId)
      : successfulExecuted.slice(0, 1); // Default to rolling back last migration

    if (toRollback.length === 0) {
      return [];
    }

    const results: MigrationResult[] = [];
    for (const migration of toRollback) {
      const result = await this.rollbackMigration(migration);
      results.push(result);
      
      if (!result.success) {
        // Stop execution on first failure
        break;
      }
    }

    return results;
  }

  async reset(): Promise<MigrationResult[]> {
    const results = await this.migrateDown();
    if (results.some(r => !r.success)) {
      return results;
    }
    
    return await this.migrateUp();
  }
}
