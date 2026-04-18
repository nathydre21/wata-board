/**
 * Account Migration Service (Frontend)
 * Handles data export, encryption, and import functionality
 */

import { MigrationData, MigrationStatus, EncryptedMigrationData, DataValidationResult, MigrationConfig, RecoveryKey, EmergencyRecovery, ValidationError, ValidationWarning } from '../types/migration';

class MigrationService {
  private apiBaseUrl: string;
  private encryptionKey: CryptoKey | null = null;

  constructor() {
    this.apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  }

  /**
   * Export account data as encrypted JSON
   */
  async exportAccountData(config: MigrationConfig): Promise<EncryptedMigrationData> {
    try {
      // Fetch account data from backend
      const accountData = await this.fetchAccountData();
      
      // Prepare migration data
      const migrationData: MigrationData = {
        version: '1.0.0',
        timestamp: Date.now(),
        accountInfo: accountData.accountInfo,
        walletData: accountData.walletData,
        transactionHistory: config.includeTransactionHistory ? accountData.transactionHistory : [],
        preferences: config.includePreferences ? accountData.preferences : {} as any,
        metadata: {
          encryptionVersion: '1.0',
          encryptionAlgorithm: 'AES-256-GCM',
          checksum: '',
          schemaVersion: '1.0.0',
          exportedBy: 'wata-board-frontend',
          exportSource: 'web',
          includePrivateKeys: false
        }
      };

      // Calculate checksum
      migrationData.metadata.checksum = this.calculateChecksum(JSON.stringify(migrationData));

      // Compress if enabled
      let dataToEncrypt = JSON.stringify(migrationData);
      if (config.compressionEnabled) {
        dataToEncrypt = await this.compressData(dataToEncrypt);
      }

      // Encrypt data
      if (config.encryptionEnabled) {
        return await this.encryptData(dataToEncrypt, migrationData.metadata.encryptionAlgorithm);
      }

      // Return unencrypted (not recommended)
      return {
        encryptedData: Buffer.from(dataToEncrypt).toString('base64'),
        iv: '',
        salt: '',
        authTag: '',
        algorithm: 'none',
        version: '1.0'
      };
    } catch (error) {
      console.error('Export failed:', error);
      throw new Error('Failed to export account data: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Import encrypted account data
   */
  async importAccountData(encryptedData: EncryptedMigrationData, password: string): Promise<MigrationStatus> {
    const statusId = this.generateId();
    const status: MigrationStatus = {
      id: statusId,
      startedAt: Date.now(),
      status: 'in-progress',
      progress: 0,
      recordsProcessed: 0,
      totalRecords: 0
    };

    try {
      // Decrypt data
      const decryptedData = await this.decryptData(encryptedData, password);
      
      // Parse JSON
      const migrationData: MigrationData = JSON.parse(decryptedData);
      
      // Validate data
      const validation = await this.validateMigrationData(migrationData);
      if (!validation.isValid) {
        throw new Error('Invalid migration data: ' + validation.errors.map(e => e.message).join(', '));
      }

      // Import to backend
      const result = await this.importToBackend(migrationData);
      
      status.status = 'completed';
      status.completedAt = Date.now();
      status.progress = 100;
      status.recordsProcessed = result.recordsImported;
      status.totalRecords = result.totalRecords;

      return status;
    } catch (error) {
      status.status = 'failed';
      status.error = error instanceof Error ? error.message : String(error);
      status.completedAt = Date.now();
      return status;
    }
  }

  /**
   * Validate migration data integrity
   */
  async validateMigrationData(data: MigrationData): Promise<DataValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate account info
    if (!data.accountInfo?.publicKey) {
      errors.push({
        field: 'accountInfo.publicKey',
        message: 'Public key is required',
        severity: 'critical'
      });
    }

    // Validate schema version
    if (!data.metadata?.schemaVersion) {
      warnings.push({
        field: 'metadata.schemaVersion',
        message: 'Schema version not specified'
      });
    }

    // Validate checksum
    const dataWithoutChecksum = { ...data };
    const originalChecksum = dataWithoutChecksum.metadata.checksum;
    dataWithoutChecksum.metadata.checksum = '';
    const calculatedChecksum = this.calculateChecksum(JSON.stringify(dataWithoutChecksum));
    const checksumMatch = originalChecksum === calculatedChecksum;

    if (!checksumMatch) {
      warnings.push({
        field: 'metadata.checksum',
        message: 'Checksum mismatch - data may be corrupted'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      checksumMatch
    };
  }

  /**
   * Create emergency recovery keys
   */
  async createEmergencyRecovery(): Promise<EmergencyRecovery> {
    const recoveryPhrase = this.generateRecoveryPhrase();
    const backupKeys = this.generateRecoveryKeys(5);

    const recovery: EmergencyRecovery = {
      recoveryPhrase,
      backupKeys,
      createdAt: Date.now(),
      numberOfUses: 0
    };

    // Store recovery in secure storage
    await this.storeRecoverySecurely(recovery);

    return recovery;
  }

  /**
   * Recover account using emergency recovery key
   */
  async recoverAccountWithKey(recoveryCode: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/migration/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryCode, timestamp: Date.now() })
      });

      if (!response.ok) {
        throw new Error('Recovery failed');
      }

      const result = await response.json();
      
      // Store recovered account data
      if (result.accountData) {
        localStorage.setItem('recovered_account_data', JSON.stringify(result.accountData));
      }

      return true;
    } catch (error) {
      console.error('Recovery error:', error);
      return false;
    }
  }

  /**
   * Get migration history
   */
  async getMigrationHistory(): Promise<MigrationStatus[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/migration/history`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch migration history');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching migration history:', error);
      return [];
    }
  }

  /**
   * Encryption Methods
   */
  private async encryptData(data: string, algorithm: string): Promise<EncryptedMigrationData> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Derive key from password
    const key = await this.deriveKey(salt);

    // Encrypt data
    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const encryptedData = new Uint8Array(encrypted);
    const authTag = encryptedData.slice(-16);
    const ciphertext = encryptedData.slice(0, -16);

    return {
      encryptedData: this.bytesToBase64(ciphertext),
      iv: this.bytesToBase64(iv),
      salt: this.bytesToBase64(salt),
      authTag: this.bytesToBase64(authTag),
      algorithm,
      version: '1.0'
    };
  }

  private async decryptData(encryptedData: EncryptedMigrationData, password: string): Promise<string> {
    const salt = this.base64ToBytes(encryptedData.salt);
    const iv = this.base64ToBytes(encryptedData.iv);
    const authTag = this.base64ToBytes(encryptedData.authTag);
    const ciphertext = this.base64ToBytes(encryptedData.encryptedData);

    // Derive key from password
    const key = await this.deriveKey(salt, password);

    // Combine ciphertext with auth tag
    const encrypted = new Uint8Array([...ciphertext, ...authTag]);

    // Decrypt data
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  private async deriveKey(salt: Uint8Array, password?: string): Promise<CryptoKey> {
    // Use a secure password from user input or stored key
    const pwd = password || (await this.getStoredPassword());
    const encoder = new TextEncoder();
    const data = encoder.encode(pwd);

    // PBKDF2 key derivation
    const baseKey = await crypto.subtle.importKey('raw', data, 'PBKDF2', false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      256
    );

    return crypto.subtle.importKey('raw', derivedBits, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  /**
   * Utility Methods
   */
  private async getStoredPassword(): Promise<string> {
    // This should prompt user for password or retrieve from secure storage
    return prompt('Enter migration password:') || '';
  }

  private calculateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode.apply(null, Array.from(bytes)));
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private generateRecoveryPhrase(): string {
    const words = ['account', 'backup', 'crypto', 'data', 'export', 'import', 'key', 'migrate', 'recover', 'secure', 'stellar', 'wallet'];
    const phrase = [];
    for (let i = 0; i < 12; i++) {
      phrase.push(words[Math.floor(Math.random() * words.length)]);
    }
    return phrase.join(' ');
  }

  private generateRecoveryKeys(count: number): RecoveryKey[] {
    const keys: RecoveryKey[] = [];
    for (let i = 0; i < count; i++) {
      const code = this.generateId();
      keys.push({
        id: this.generateId(),
        createdAt: Date.now(),
        code,
        hash: this.hashCode(code)
      });
    }
    return keys;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private async compressData(data: string): Promise<string> {
    // Simple compression using JSON stringification
    // In production, use a proper compression library like pako
    return Buffer.from(data).toString('base64');
  }

  private async fetchAccountData(): Promise<any> {
    // Fetch from backend API
    const response = await fetch(`${this.apiBaseUrl}/api/account/data`, {
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to fetch account data');
    return response.json();
  }

  private async importToBackend(data: MigrationData): Promise<{ recordsImported: number; totalRecords: number }> {
    const response = await fetch(`${this.apiBaseUrl}/api/migration/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to import data');
    return response.json();
  }

  private async storeRecoverySecurely(recovery: EmergencyRecovery): Promise<void> {
    // Store in browser's secure storage (IndexedDB)
    const db = await this.openIndexedDB();
    const tx = db.transaction('recovery', 'readwrite');
    const store = tx.objectStore('recovery');
    await store.put(recovery);
  }

  private async openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('wata-board-migration', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('recovery', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const migrationService = new MigrationService();
