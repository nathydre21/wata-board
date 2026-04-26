import { Migration } from './Migration';
import { migration001 } from './migrations/001_initial_schema';
import { migration002 } from './migrations/002_indexes_constraints';
import { migration003 } from './migrations/003_blockchain_integration';
import { migration004 } from './migrations/004_multi_provider_support';

export class MigrationRegistry {
  private static migrations: Migration[] = [
    migration001,
    migration002,
    migration003,
    migration004,
  ];

  static getAllMigrations(): Migration[] {
    return [...this.migrations].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  static getMigrationById(id: string): Migration | undefined {
    return this.migrations.find(m => m.id === id);
  }

  static addMigration(migration: Migration): void {
    if (this.migrations.some(m => m.id === migration.id)) {
      throw new Error(`Migration with id '${migration.id}' already exists`);
    }
    this.migrations.push(migration);
  }

  static validateMigrations(): string[] {
    const errors: string[] = [];
    const migrationIds = new Set<string>();

    for (const migration of this.migrations) {
      // Check for duplicate IDs
      if (migrationIds.has(migration.id)) {
        errors.push(`Duplicate migration ID: ${migration.id}`);
      }
      migrationIds.add(migration.id);

      // Check dependencies
      if (migration.dependencies) {
        for (const dep of migration.dependencies) {
          if (!migrationIds.has(dep)) {
            errors.push(`Migration ${migration.id} depends on ${dep} which is not defined`);
          }
        }
      }
    }

    return errors;
  }
}
