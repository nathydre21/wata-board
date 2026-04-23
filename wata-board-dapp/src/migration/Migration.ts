/**
 * Data Migration System for Wata-Board
 * Handles automated data migration between versions
 */

export interface Migration {
  version: string;
  description: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
  dependencies?: string[];
}

export interface MigrationResult {
  success: boolean;
  version: string;
  error?: string;
  duration: number;
}

export class DataMigration {
  private migrations: Map<string, Migration> = new Map();
  private executedMigrations: Set<string> = new Set();
  private migrationLog: MigrationResult[] = [];

  constructor() {
    this.loadExecutedMigrations();
  }

  /**
   * Register a new migration
   */
  register(migration: Migration): void {
    if (this.migrations.has(migration.version)) {
      throw new Error(`Migration ${migration.version} already registered`);
    }
    this.migrations.set(migration.version, migration);
  }

  /**
   * Get all registered migrations in order
   */
  private getOrderedMigrations(): Migration[] {
    return Array.from(this.migrations.values())
      .sort((a, b) => this.compareVersions(a.version, b.version));
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart < bPart) return -1;
      if (aPart > bPart) return 1;
    }
    
    return 0;
  }

  /**
   * Check if migration dependencies are satisfied
   */
  private checkDependencies(migration: Migration): boolean {
    if (!migration.dependencies) return true;
    
    return migration.dependencies.every(dep => 
      this.executedMigrations.has(dep)
    );
  }

  /**
   * Execute a single migration
   */
  private async executeMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Executing migration ${migration.version}: ${migration.description}`);
      
      await migration.up();
      
      this.executedMigrations.add(migration.version);
      await this.saveExecutedMigrations();
      
      const duration = Date.now() - startTime;
      const result: MigrationResult = {
        success: true,
        version: migration.version,
        duration
      };
      
      this.migrationLog.push(result);
      console.log(`Migration ${migration.version} completed successfully in ${duration}ms`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: MigrationResult = {
        success: false,
        version: migration.version,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      };
      
      this.migrationLog.push(result);
      console.error(`Migration ${migration.version} failed:`, error);
      
      return result;
    }
  }

  /**
   * Migrate up to a specific version or latest
   */
  async migrate(targetVersion?: string): Promise<MigrationResult[]> {
    const orderedMigrations = this.getOrderedMigrations();
    const results: MigrationResult[] = [];
    
    for (const migration of orderedMigrations) {
      // Skip if already executed
      if (this.executedMigrations.has(migration.version)) {
        continue;
      }
      
      // Skip if target version specified and this migration is beyond it
      if (targetVersion && this.compareVersions(migration.version, targetVersion) > 0) {
        continue;
      }
      
      // Check dependencies
      if (!this.checkDependencies(migration)) {
        const result: MigrationResult = {
          success: false,
          version: migration.version,
          error: `Dependencies not satisfied: ${migration.dependencies?.join(', ')}`,
          duration: 0
        };
        results.push(result);
        continue;
      }
      
      const result = await this.executeMigration(migration);
      results.push(result);
      
      // Stop on failure
      if (!result.success) {
        break;
      }
    }
    
    return results;
  }

  /**
   * Rollback a migration
   */
  async rollback(version: string): Promise<MigrationResult> {
    const migration = this.migrations.get(version);
    if (!migration) {
      throw new Error(`Migration ${version} not found`);
    }
    
    if (!this.executedMigrations.has(version)) {
      throw new Error(`Migration ${version} has not been executed`);
    }
    
    const startTime = Date.now();
    
    try {
      console.log(`Rolling back migration ${version}: ${migration.description}`);
      
      await migration.down();
      
      this.executedMigrations.delete(version);
      await this.saveExecutedMigrations();
      
      const duration = Date.now() - startTime;
      const result: MigrationResult = {
        success: true,
        version: version,
        duration
      };
      
      console.log(`Rollback ${version} completed successfully in ${duration}ms`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: MigrationResult = {
        success: false,
        version: version,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      };
      
      console.error(`Rollback ${version} failed:`, error);
      
      return result;
    }
  }

  /**
   * Get migration status
   */
  getStatus(): {
    pending: string[];
    executed: string[];
    total: number;
    completed: number;
  } {
    const allVersions = Array.from(this.migrations.keys()).sort(this.compareVersions);
    const executed = Array.from(this.executedMigrations);
    const pending = allVersions.filter(v => !executed.includes(v));
    
    return {
      pending,
      executed,
      total: allVersions.length,
      completed: executed.length
    };
  }

  /**
   * Get migration log
   */
  getLog(): MigrationResult[] {
    return [...this.migrationLog];
  }

  /**
   * Load executed migrations from storage
   */
  private async loadExecutedMigrations(): Promise<void> {
    try {
      // In a real implementation, this would load from a database or file
      // For now, we'll use in-memory storage
      const stored = localStorage.getItem('wata-board-migrations');
      if (stored) {
        const migrations = JSON.parse(stored);
        this.executedMigrations = new Set(migrations);
      }
    } catch (error) {
      console.warn('Failed to load migration history:', error);
    }
  }

  /**
   * Save executed migrations to storage
   */
  private async saveExecutedMigrations(): Promise<void> {
    try {
      // In a real implementation, this would save to a database or file
      const migrations = Array.from(this.executedMigrations);
      localStorage.setItem('wata-board-migrations', JSON.stringify(migrations));
    } catch (error) {
      console.warn('Failed to save migration history:', error);
    }
  }

  /**
   * Reset migration history (for testing)
   */
  async reset(): Promise<void> {
    this.executedMigrations.clear();
    this.migrationLog = [];
    localStorage.removeItem('wata-board-migrations');
  }
}
