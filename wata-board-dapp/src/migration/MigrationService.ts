import { DataMigration, MigrationResult } from './Migration';
import { initialSchemaMigration } from './migrations/001-initial-schema';
import { addPaymentStatusMigration } from './migrations/002-add-payment-status';

export class MigrationService {
  private migration: DataMigration;

  constructor() {
    this.migration = new DataMigration();
    this.registerMigrations();
  }

  private registerMigrations(): void {
    this.migration.register(initialSchemaMigration);
    this.migration.register(addPaymentStatusMigration);
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<MigrationResult[]> {
    console.log('Starting data migration process...');
    
    try {
      const results = await this.migration.migrate();
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      console.log(`Migration completed: ${successCount} successful, ${failureCount} failed`);
      
      if (failureCount > 0) {
        console.error('Failed migrations:', results.filter(r => !r.success));
      }
      
      return results;
    } catch (error) {
      console.error('Migration process failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  getStatus() {
    return this.migration.getStatus();
  }

  /**
   * Get migration log
   */
  getLog(): MigrationResult[] {
    return this.migration.getLog();
  }

  /**
   * Rollback a specific migration
   */
  async rollback(version: string): Promise<MigrationResult> {
    console.log(`Rolling back migration ${version}...`);
    
    try {
      const result = await this.migration.rollback(version);
      
      if (result.success) {
        console.log(`Rollback ${version} completed successfully`);
      } else {
        console.error(`Rollback ${version} failed:`, result.error);
      }
      
      return result;
    } catch (error) {
      console.error(`Rollback ${version} failed:`, error);
      throw error;
    }
  }

  /**
   * Reset all migrations (for development/testing)
   */
  async reset(): Promise<void> {
    console.log('Resetting all migrations...');
    await this.migration.reset();
    console.log('Migration history reset completed');
  }
}
