export interface MigrationAccountInfo {
  publicKey: string;
  [key: string]: unknown;
}

export interface MigrationData {
  userId?: string;
  records?: Array<Record<string, unknown>>;
  source?: string;
  version?: string;
  timestamp?: number;
  accountInfo?: MigrationAccountInfo;
  walletData?: Record<string, unknown>;
  transactionHistory?: Array<Record<string, unknown>>;
  preferences?: Record<string, unknown>;
}
