import { MigrationRunner } from '../../migrations/MigrationRunner';
import { Database } from '../../migrations/Database';
import { Migration } from '../../migrations/Migration';

describe('MigrationRunner', () => {
  let runner: MigrationRunner;
  let mockPool: any;

  beforeEach(() => {
    // Mock database pool
    mockPool = {
      connect: jest.fn(),
      query: jest.fn()
    };

    runner = new MigrationRunner(mockPool);
  });

  describe('initialize', () => {
    it('should create migration table', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      mockPool.connect.mockResolvedValue(mockClient);

      await runner.initialize();

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
      );
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('registerMigration', () => {
    it('should register a migration successfully', () => {
      const migration: Migration = {
        id: 'test_migration',
        name: 'Test Migration',
        timestamp: new Date(),
        up: jest.fn().mockResolvedValue(undefined),
        down: jest.fn().mockResolvedValue(undefined)
      };

      runner.registerMigration(migration);
      const registered = runner.getRegisteredMigrations();

      expect(registered).toHaveLength(1);
      expect(registered[0].id).toBe('test_migration');
    });

    it('should throw error for duplicate migration ID', () => {
      const migration1: Migration = {
        id: 'duplicate_id',
        name: 'Test Migration 1',
        timestamp: new Date(),
        up: jest.fn().mockResolvedValue(undefined),
        down: jest.fn().mockResolvedValue(undefined)
      };

      const migration2: Migration = {
        id: 'duplicate_id',
        name: 'Test Migration 2',
        timestamp: new Date(),
        up: jest.fn().mockResolvedValue(undefined),
        down: jest.fn().mockResolvedValue(undefined)
      };

      runner.registerMigration(migration1);

      expect(() => runner.registerMigration(migration2)).toThrow(
        'Migration with id \'duplicate_id\' is already registered'
      );
    });
  });

  describe('executeMigration', () => {
    let mockClient: any;
    let migration: Migration;

    beforeEach(() => {
      mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };
      mockPool.connect.mockResolvedValue(mockClient);

      migration = {
        id: 'test_migration',
        name: 'Test Migration',
        timestamp: new Date(),
        up: jest.fn().mockResolvedValue(undefined),
        down: jest.fn().mockResolvedValue(undefined)
      };
    });

    it('should execute migration successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing migration
        .mockResolvedValueOnce({ rows: [] }); // Insert migration record

      const result = await runner.executeMigration(migration);

      expect(result.success).toBe(true);
      expect(result.migrationId).toBe('test_migration');
      expect(migration.up).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle migration execution failure', async () => {
      const error = new Error('Migration failed');
      migration.up.mockRejectedValue(error);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing migration
        .mockResolvedValueOnce({ rows: [] }); // Insert failed migration record

      const result = await runner.executeMigration(migration);

      expect(result.success).toBe(false);
      expect(result.migrationId).toBe('test_migration');
      expect(result.error).toBe(error);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should skip already executed migration', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ id: 'test_migration' }] // Migration already exists
      });

      const result = await runner.executeMigration(migration);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('already been executed');
      expect(migration.up).not.toHaveBeenCalled();
    });
  });

  describe('rollbackMigration', () => {
    let mockClient: any;
    let migration: Migration;

    beforeEach(() => {
      mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };
      mockPool.connect.mockResolvedValue(mockClient);

      migration = {
        id: 'test_migration',
        name: 'Test Migration',
        timestamp: new Date(),
        up: jest.fn().mockResolvedValue(undefined),
        down: jest.fn().mockResolvedValue(undefined)
      };
    });

    it('should rollback migration successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ 
          rows: [{ id: 'test_migration' }] // Migration exists and was successful
        })
        .mockResolvedValueOnce({ rows: [] }); // Delete migration record

      const result = await runner.rollbackMigration(migration);

      expect(result.success).toBe(true);
      expect(result.migrationId).toBe('test_migration');
      expect(migration.down).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle rollback failure', async () => {
      const error = new Error('Rollback failed');
      migration.down.mockRejectedValue(error);

      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'test_migration' }] // Migration exists
      });

      const result = await runner.rollbackMigration(migration);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('migrateUp', () => {
    it('should execute pending migrations in order', async () => {
      const migration1: Migration = {
        id: '001_test',
        name: 'Test Migration 1',
        timestamp: new Date('2025-01-01'),
        up: jest.fn().mockResolvedValue(undefined),
        down: jest.fn().mockResolvedValue(undefined)
      };

      const migration2: Migration = {
        id: '002_test',
        name: 'Test Migration 2',
        timestamp: new Date('2025-01-02'),
        up: jest.fn().mockResolvedValue(undefined),
        down: jest.fn().mockResolvedValue(undefined)
      };

      runner.registerMigration(migration1);
      runner.registerMigration(migration2);

      // Mock no executed migrations
      jest.spyOn(runner, 'getPendingMigrations').mockResolvedValue([migration1, migration2]);
      jest.spyOn(runner, 'executeMigration')
        .mockResolvedValueOnce({ success: true, migrationId: '001_test', duration: 100 })
        .mockResolvedValueOnce({ success: true, migrationId: '002_test', duration: 150 });

      const results = await runner.migrateUp();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(runner.executeMigration).toHaveBeenCalledTimes(2);
    });

    it('should stop on first failure', async () => {
      const migration1: Migration = {
        id: '001_test',
        name: 'Test Migration 1',
        timestamp: new Date('2025-01-01'),
        up: jest.fn().mockResolvedValue(undefined),
        down: jest.fn().mockResolvedValue(undefined)
      };

      const migration2: Migration = {
        id: '002_test',
        name: 'Test Migration 2',
        timestamp: new Date('2025-01-02'),
        up: jest.fn().mockResolvedValue(undefined),
        down: jest.fn().mockResolvedValue(undefined)
      };

      runner.registerMigration(migration1);
      runner.registerMigration(migration2);

      jest.spyOn(runner, 'getPendingMigrations').mockResolvedValue([migration1, migration2]);
      jest.spyOn(runner, 'executeMigration')
        .mockResolvedValueOnce({ success: true, migrationId: '001_test', duration: 100 })
        .mockResolvedValueOnce({ success: false, migrationId: '002_test', duration: 50, error: new Error('Failed') });

      const results = await runner.migrateUp();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(runner.executeMigration).toHaveBeenCalledTimes(2);
    });
  });
});
