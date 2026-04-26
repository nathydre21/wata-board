import { MigrationRunner } from './MigrationRunner';
import { Database } from './Database';
import { MigrationRegistry } from './MigrationRegistry';
import { MigrationResult, MigrationStatus } from './Migration';

export class MigrationCLI {
  private runner: MigrationRunner;

  constructor() {
    const db = Database.getInstance();
    this.runner = new MigrationRunner(db.getPool());
  }

  async initialize(): Promise<void> {
    await this.runner.initialize();
    
    // Register all migrations
    const migrations = MigrationRegistry.getAllMigrations();
    for (const migration of migrations) {
      this.runner.registerMigration(migration);
    }

    // Validate migrations
    const errors = MigrationRegistry.validateMigrations();
    if (errors.length > 0) {
      throw new Error(`Migration validation failed:\n${errors.join('\n')}`);
    }
  }

  async status(): Promise<MigrationStatus[]> {
    return await this.runner.getMigrationStatus();
  }

  async pending(): Promise<MigrationStatus[]> {
    const allStatus = await this.status();
    return allStatus.filter(m => m.status === 'pending');
  }

  async migrate(targetId?: string): Promise<MigrationResult[]> {
    return await this.runner.migrateUp(targetId);
  }

  async rollback(targetId?: string): Promise<MigrationResult[]> {
    return await this.runner.migrateDown(targetId);
  }

  async reset(): Promise<MigrationResult[]> {
    return await this.runner.reset();
  }

  async list(): Promise<MigrationStatus[]> {
    return await this.status();
  }

  formatStatus(status: MigrationStatus[]): string {
    const header = [
      'ID'.padEnd(25),
      'Name'.padEnd(40),
      'Status'.padEnd(12),
      'Executed At'.padEnd(20)
    ].join(' | ');

    const separator = '-'.repeat(header.length);

    const rows = status.map(m => [
      m.id.padEnd(25),
      m.name.padEnd(40),
      m.status.padEnd(12),
      (m.executedAt ? m.executedAt.toISOString() : 'Never').padEnd(20)
    ].join(' | '));

    return [header, separator, ...rows].join('\n');
  }

  formatResults(results: MigrationResult[]): string {
    if (results.length === 0) {
      return 'No migrations to execute.';
    }

    const header = [
      'Migration ID'.padEnd(25),
      'Status'.padEnd(8),
      'Duration (ms)'.padEnd(15),
      'Error'.padEnd(50)
    ].join(' | ');

    const separator = '-'.repeat(header.length);

    const rows = results.map(r => [
      r.migrationId.padEnd(25),
      (r.success ? 'Success' : 'Failed').padEnd(8),
      r.duration.toString().padEnd(15),
      (r.error ? r.error.message : '').padEnd(50)
    ].join(' | '));

    return [header, separator, ...rows].join('\n');
  }
}

// CLI execution function
export async function runCLI(args: string[]): Promise<void> {
  const cli = new MigrationCLI();
  
  try {
    await cli.initialize();

    const command = args[0] || 'status';
    
    switch (command) {
      case 'status':
        console.log('\n=== Migration Status ===');
        const status = await cli.status();
        console.log(cli.formatStatus(status));
        break;

      case 'pending':
        console.log('\n=== Pending Migrations ===');
        const pending = await cli.pending();
        if (pending.length === 0) {
          console.log('No pending migrations.');
        } else {
          console.log(cli.formatStatus(pending));
        }
        break;

      case 'migrate':
      case 'up':
        console.log('\n=== Running Migrations ===');
        const targetId = args[1];
        const migrateResults = await cli.migrate(targetId);
        console.log(cli.formatResults(migrateResults));
        
        if (migrateResults.some(r => !r.success)) {
          process.exit(1);
        }
        break;

      case 'rollback':
      case 'down':
        console.log('\n=== Rolling Back Migrations ===');
        const rollbackTargetId = args[1];
        const rollbackResults = await cli.rollback(rollbackTargetId);
        console.log(cli.formatResults(rollbackResults));
        
        if (rollbackResults.some(r => !r.success)) {
          process.exit(1);
        }
        break;

      case 'reset':
        console.log('\n=== Resetting Database ===');
        const resetResults = await cli.reset();
        console.log(cli.formatResults(resetResults));
        
        if (resetResults.some(r => !r.success)) {
          process.exit(1);
        }
        break;

      case 'list':
        console.log('\n=== All Migrations ===');
        const list = await cli.list();
        console.log(cli.formatStatus(list));
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Available commands: status, pending, migrate [id], rollback [id], reset, list');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
