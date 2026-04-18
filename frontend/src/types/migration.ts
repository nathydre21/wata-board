/**
 * Account Migration Types
 * Defines data structures for account migration and data export/import
 */

export interface MigrationData {
  version: string;
  timestamp: number;
  accountInfo: AccountInfo;
  walletData: WalletData;
  transactionHistory: TransactionRecord[];
  preferences: UserPreferences;
  metadata: MigrationMetadata;
}

export interface AccountInfo {
  publicKey: string;
  accountName?: string;
  createdAt: number;
  lastUpdated: number;
  network: 'mainnet' | 'testnet';
}

export interface WalletData {
  balances: {
    xlm: number;
    other: Record<string, number>;
  };
  assets: AssetBalance[];
  signers: Signer[];
}

export interface AssetBalance {
  asset: string;
  balance: number;
  issuer?: string;
  limit?: number;
}

export interface Signer {
  key: string;
  weight: number;
  type: 'ed25519PublicKey' | 'sha256Hash' | 'preAuthTx';
}

export interface TransactionRecord {
  id: string;
  hash: string;
  timestamp: number;
  type: string;
  status: 'success' | 'failed' | 'pending';
  amount?: number;
  fee: number;
  source: string;
  destination?: string;
  memo?: string;
  metadata?: Record<string, any>;
}

export interface UserPreferences {
  language: string;
  theme: 'light' | 'dark' | 'auto';
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  privacy: {
    allowAnalytics: boolean;
    allowMarketing: boolean;
  };
  customSettings: Record<string, any>;
}

export interface MigrationMetadata {
  encryptionVersion: string;
  encryptionAlgorithm: 'AES-256-GCM' | 'AES-256-CBC';
  checksum: string;
  schemaVersion: string;
  exportedBy: string;
  exportSource: 'web' | 'mobile' | 'desktop';
  includePrivateKeys: boolean;
}

export interface MigrationStatus {
  id: string;
  startedAt: number;
  completedAt?: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  sourceDevice?: string;
  targetDevice?: string;
  progress: number;
  error?: string;
  recordsProcessed: number;
  totalRecords: number;
}

export interface EncryptedMigrationData {
  encryptedData: string;
  iv: string;
  salt: string;
  authTag: string;
  algorithm: string;
  version: string;
}

export interface DataValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  checksumMatch: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface MigrationConfig {
  includeTransactionHistory: boolean;
  includePreferences: boolean;
  includeAssets: boolean;
  encryptionEnabled: boolean;
  compressionEnabled: boolean;
  backupBeforeMigration: boolean;
}

export interface RecoveryKey {
  id: string;
  createdAt: number;
  expiresAt?: number;
  usedAt?: number;
  code: string;
  hash: string;
}

export interface EmergencyRecovery {
  recoveryPhrase: string;
  backupKeys: RecoveryKey[];
  createdAt: number;
  lastVerified?: number;
  numberOfUses: number;
}
