# Data Migration System

This directory contains the automated data migration system for the Wata Board application. The system provides a robust, version-controlled way to manage database schema changes and data migrations.

## Features

- **Automated Migration Execution**: Run migrations programmatically or via CLI
- **Version Control**: Track which migrations have been executed
- **Rollback Support**: Ability to rollback migrations when needed
- **Dependency Management**: Define migration dependencies to ensure proper execution order
- **Transaction Safety**: Each migration runs in a database transaction
- **Error Handling**: Comprehensive error reporting and recovery
- **CLI Interface**: Command-line tools for migration management

## Architecture

### Core Components

1. **Migration Interface**: Defines the structure of a migration
2. **MigrationRunner**: Executes migrations and tracks their status
3. **MigrationRegistry**: Manages registration and validation of migrations
4. **MigrationCLI**: Command-line interface for migration operations
5. **Database**: Database connection and configuration management

### Migration Files

Each migration file exports a `Migration` object with the following properties:

```typescript
export const migrationXXX: Migration = {
  id: '001_initial_schema',           // Unique identifier
  name: 'Initial Database Schema',      // Human-readable name
  timestamp: new Date('2025-03-25'), // Creation timestamp
  description: 'Creates initial schema',  // Optional description
  dependencies: ['previous_migration'],   // Optional dependencies
  up: async () => { /* Migration logic */ },
  down: async () => { /* Rollback logic */ }
};
```

## Usage

### CLI Commands

The migration system provides several CLI commands:

```bash
# Check migration status
npm run migrate:status

# Show pending migrations
npm run migrate:pending

# Run all pending migrations
npm run migrate:up

# Run specific migration
npm run migrate migrate 001_initial_schema

# Rollback last migration
npm run migrate:down

# Rollback to specific migration
npm run migrate rollback 002_indexes

# Reset all migrations (rollback all, then migrate all)
npm run migrate:reset
```

### Programmatic Usage

```typescript
import { MigrationRunner, Database, MigrationRegistry } from './migrations';

// Initialize
const db = Database.getInstance();
const runner = new MigrationRunner(db.getPool());
await runner.initialize();

// Register migrations
const migrations = MigrationRegistry.getAllMigrations();
for (const migration of migrations) {
  runner.registerMigration(migration);
}

// Run migrations
const results = await runner.migrateUp();
console.log('Migration results:', results);
```

## Migration Guidelines

### Creating New Migrations

1. **File Naming**: Use the format `XXX_description.ts` where XXX is a zero-padded number
2. **Migration ID**: Use the same ID as the filename (e.g., `005_new_feature`)
3. **Dependencies**: Always specify dependencies if the migration depends on previous ones
4. **Reversible**: Always implement both `up` and `down` methods
5. **Idempotent**: Migrations should be safe to run multiple times

### Best Practices

1. **Test Thoroughly**: Always test migrations on a copy of production data
2. **Backup First**: Create a database backup before running migrations
3. **Small Changes**: Keep migrations small and focused
4. **Data Safety**: Use transactions to ensure data consistency
5. **Performance**: Consider performance impact on large datasets

### SQL Migrations

For complex schema changes, you can use SQL files:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

export const migrationXXX: Migration = {
  id: '001_initial_schema',
  name: 'Initial Database Schema',
  timestamp: new Date('2025-03-25'),
  
  async up(): Promise<void> {
    const sqlPath = join(__dirname, '../../../database/migrations/001_initial_schema.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    // Execute SQL via database connection
  },
  
  async down(): Promise<void> {
    // Rollback SQL
  }
};
```

## Database Schema

### Migration Tracking Table

The system creates a `schema_migrations` table to track executed migrations:

```sql
CREATE TABLE schema_migrations (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(64) NOT NULL,
  execution_time_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT
);
```

## Error Handling

### Migration Failures

- Migrations run in transactions - failures are rolled back automatically
- Failed migrations are recorded in the tracking table
- Execution stops on first failure to prevent cascading issues

### Recovery

1. Fix the issue in the failed migration
2. Update the migration record to allow re-execution
3. Re-run the migration

## Environment Configuration

The migration system uses the following environment variables:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wata_board
DB_USER=postgres
DB_PASSWORD=password
DB_SSL=false
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000
```

## Testing

Run migration tests:

```bash
# Run all migration tests
npm run test -- --config jest.config.migrations.js

# Run with coverage
npm run test:coverage -- --config jest.config.migrations.js

# Run specific test file
npm run test migrations/MigrationRunner.test.ts
```

## Troubleshooting

### Common Issues

1. **Connection Errors**: Check database configuration and connectivity
2. **Permission Errors**: Ensure database user has required permissions
3. **Lock Errors**: Wait for existing migrations to complete
4. **Dependency Errors**: Verify all dependencies are properly defined

### Debug Mode

Enable debug logging:

```bash
DEBUG=migrations:* npm run migrate:status
```

## Migration History

| ID | Name | Date | Description |
|-----|------|------|-------------|
| 001 | Initial Schema | 2025-03-25 | Creates initial database schema |
| 002 | Indexes & Constraints | 2025-03-25 | Adds performance indexes and constraints |
| 003 | Blockchain Integration | 2025-03-25 | Adds blockchain-specific tables |
| 004 | Multi-Provider Support | 2025-04-18 | Adds support for multiple utility providers |

## Contributing

When adding new migrations:

1. Follow the naming conventions
2. Include comprehensive tests
3. Update this documentation
4. Test thoroughly before submitting PRs
5. Consider backward compatibility

## Security Considerations

- Validate all input parameters
- Use parameterized queries to prevent SQL injection
- Implement proper access controls
- Log migration activities for audit trails
- Encrypt sensitive data in migrations
