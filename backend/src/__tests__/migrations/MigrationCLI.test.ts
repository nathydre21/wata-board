import { MigrationCLI } from '../../migrations/MigrationCLI';
import { Database } from '../../migrations/Database';
import { MigrationRegistry } from '../../migrations/MigrationRegistry';
import { Migration } from '../../migrations/Migration';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('MigrationCLI', () => {
  let cli: MigrationCLI;
  let mockRunner: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Database
    const mockDb = {
      getPool: jest.fn().mockReturnValue({
        connect: jest.fn(),
        query: jest.fn()
      })
    };

    // Mock MigrationRunner
    mockRunner = {
      initialize: jest.fn().mockResolvedValue(undefined),
      registerMigration: jest.fn(),
      getMigrationStatus: jest.fn(),
      migrateUp: jest.fn(),
      migrateDown: jest.fn(),
      reset: jest.fn()
    };

    // Mock MigrationRegistry
    jest.spyOn(MigrationRegistry, 'getAllMigrations').mockReturnValue([]);
    jest.spyOn(MigrationRegistry, 'validateMigrations').mockReturnValue([]);

    cli = new MigrationCLI();
    (cli as any).runner = mockRunner;
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await cli.initialize();
      expect(mockRunner.initialize).toHaveBeenCalled();
    });

    it('should throw error on validation failure', async () => {
      jest.spyOn(MigrationRegistry, 'validateMigrations').mockReturnValue(['Error 1', 'Error 2']);

      await expect(cli.initialize()).rejects.toThrow('Migration validation failed');
    });
  });

  describe('formatStatus', () => {
    it('should format migration status correctly', () => {
      const status = [
        {
          id: '001_initial',
          name: 'Initial Schema',
          status: 'executed' as const,
          executedAt: new Date('2025-01-01T00:00:00Z')
        },
        {
          id: '002_indexes',
          name: 'Add Indexes',
          status: 'pending' as const,
          executedAt: undefined
        }
      ];

      const output = cli.formatStatus(status);

      expect(output).toContain('001_initial');
      expect(output).toContain('Initial Schema');
      expect(output).toContain('executed');
      expect(output).toContain('pending');
      expect(output).toContain('Never');
    });
  });

  describe('formatResults', () => {
    it('should format migration results correctly', () => {
      const results = [
        {
          migrationId: '001_initial',
          success: true,
          duration: 150,
          error: undefined
        },
        {
          migrationId: '002_indexes',
          success: false,
          duration: 50,
          error: new Error('Migration failed')
        }
      ];

      const output = cli.formatResults(results);

      expect(output).toContain('001_initial');
      expect(output).toContain('Success');
      expect(output).toContain('150');
      expect(output).toContain('002_indexes');
      expect(output).toContain('Failed');
      expect(output).toContain('50');
      expect(output).toContain('Migration failed');
    });

    it('should handle empty results', () => {
      const output = cli.formatResults([]);
      expect(output).toBe('No migrations to execute.');
    });
  });

  describe('CLI commands', () => {
    beforeEach(async () => {
      await cli.initialize();
    });

    it('should handle status command', async () => {
      const mockStatus = [
        {
          id: '001_initial',
          name: 'Initial Schema',
          status: 'executed' as const,
          executedAt: new Date()
        }
      ];
      mockRunner.getMigrationStatus.mockResolvedValue(mockStatus);

      await (cli as any).handleCommand('status');

      expect(mockConsoleLog).toHaveBeenCalledWith('\n=== Migration Status ===');
      expect(mockRunner.getMigrationStatus).toHaveBeenCalled();
    });

    it('should handle migrate command', async () => {
      const mockResults = [
        {
          migrationId: '001_initial',
          success: true,
          duration: 150
        }
      ];
      mockRunner.migrateUp.mockResolvedValue(mockResults);

      await (cli as any).handleCommand('migrate');

      expect(mockRunner.migrateUp).toHaveBeenCalledWith(undefined);
      expect(mockConsoleLog).toHaveBeenCalledWith('\n=== Running Migrations ===');
    });

    it('should handle migrate command with target', async () => {
      const mockResults = [
        {
          migrationId: '001_initial',
          success: true,
          duration: 150
        }
      ];
      mockRunner.migrateUp.mockResolvedValue(mockResults);

      await (cli as any).handleCommand('migrate', ['001_initial']);

      expect(mockRunner.migrateUp).toHaveBeenCalledWith('001_initial');
    });

    it('should handle rollback command', async () => {
      const mockResults = [
        {
          migrationId: '001_initial',
          success: true,
          duration: 100
        }
      ];
      mockRunner.migrateDown.mockResolvedValue(mockResults);

      await (cli as any).handleCommand('rollback');

      expect(mockRunner.migrateDown).toHaveBeenCalledWith(undefined);
      expect(mockConsoleLog).toHaveBeenCalledWith('\n=== Rolling Back Migrations ===');
    });

    it('should handle reset command', async () => {
      const mockResults = [
        {
          migrationId: '001_initial',
          success: true,
          duration: 200
        }
      ];
      mockRunner.reset.mockResolvedValue(mockResults);

      await (cli as any).handleCommand('reset');

      expect(mockRunner.reset).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('\n=== Resetting Database ===');
    });

    it('should handle unknown command', async () => {
      await expect((cli as any).handleCommand('unknown')).rejects.toThrow();
      expect(mockConsoleError).toHaveBeenCalledWith('Unknown command: unknown');
    });
  });
});
