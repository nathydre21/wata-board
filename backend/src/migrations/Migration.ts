export interface Migration {
  id: string;
  name: string;
  timestamp: Date;
  up: () => Promise<void>;
  down: () => Promise<void>;
  description?: string;
  dependencies?: string[];
}

export interface MigrationResult {
  success: boolean;
  migrationId: string;
  duration: number;
  error?: Error;
}

export interface MigrationStatus {
  id: string;
  name: string;
  executedAt?: Date;
  status: 'pending' | 'executed' | 'failed';
  checksum?: string;
}
