import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { envConfig } from './env';

export interface KeyMetadata {
  version: number;
  algorithm: string;
  keyDerivation: {
    iterations: number;
    saltLength: number;
    hashFunction: string;
  };
  createdAt: string;
  lastRotated?: string;
}

export interface EncryptedKeyData {
  metadata: KeyMetadata;
  encrypted: {
    data: string;
    iv: string;
    tag: string;
    salt: string;
  };
}

export class SecureKeyManager {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_DERIVATION_ITERATIONS = 100000;
  private static readonly SALT_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;
  private static readonly KEY_LENGTH = 32;

  private static instance: SecureKeyManager;
  private decryptedKey: string | null = null;
  private keyMetadata: KeyMetadata | null = null;

  private constructor() { }

  public static getInstance(): SecureKeyManager {
    if (!SecureKeyManager.instance) {
      SecureKeyManager.instance = new SecureKeyManager();
    }
    return SecureKeyManager.instance;
  }

  /**
   * Encrypt and store the admin secret key securely
   */
  public encryptAndStoreKey(adminSecretKey: string, masterPassword: string): void {
    if (!adminSecretKey || !masterPassword) {
      throw new Error('Both admin secret key and master password are required');
    }

    // Validate Stellar secret key format
    if (!this.isValidStellarSecretKey(adminSecretKey)) {
      throw new Error('Invalid Stellar secret key format');
    }

    const salt = crypto.randomBytes(SecureKeyManager.SALT_LENGTH);
    const iv = crypto.randomBytes(SecureKeyManager.IV_LENGTH);

    // Derive encryption key from master password
    const encryptionKey = crypto.pbkdf2Sync(
      masterPassword,
      salt,
      SecureKeyManager.KEY_DERIVATION_ITERATIONS,
      SecureKeyManager.KEY_LENGTH,
      'sha256'
    );

    // Create cipher
    const cipher = crypto.createCipher(SecureKeyManager.ALGORITHM, encryptionKey);
    cipher.setAAD(Buffer.from('admin-key', 'utf8'));

    // Encrypt the secret key
    let encrypted = cipher.update(adminSecretKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    // Create metadata
    const metadata: KeyMetadata = {
      version: 1,
      algorithm: SecureKeyManager.ALGORITHM,
      keyDerivation: {
        iterations: SecureKeyManager.KEY_DERIVATION_ITERATIONS,
        saltLength: SecureKeyManager.SALT_LENGTH,
        hashFunction: 'sha256'
      },
      createdAt: new Date().toISOString(),
      lastRotated: new Date().toISOString()
    };

    // Prepare encrypted data
    const encryptedData: EncryptedKeyData = {
      metadata,
      encrypted: {
        data: encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        salt: salt.toString('hex')
      }
    };

    // Store to file
    const keyFilePath = this.getKeyFilePath();
    fs.writeFileSync(keyFilePath, JSON.stringify(encryptedData, null, 2), { mode: 0o600 });

    // Clear sensitive data from memory
    encryptionKey.fill(0);
    cipher.final();
  }

  /**
   * Decrypt and return the admin secret key
   */
  public getDecryptedKey(masterPassword: string): string {
    if (this.decryptedKey) {
      return this.decryptedKey;
    }

    const keyFilePath = this.getKeyFilePath();

    if (!fs.existsSync(keyFilePath)) {
      throw new Error('Encrypted key file not found. Please encrypt and store the key first.');
    }

    try {
      const encryptedData: EncryptedKeyData = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
      this.keyMetadata = encryptedData.metadata;

      const { data, iv, tag, salt } = encryptedData.encrypted;

      // Derive decryption key from master password
      const decryptionKey = crypto.pbkdf2Sync(
        masterPassword,
        Buffer.from(salt, 'hex'),
        encryptedData.metadata.keyDerivation.iterations,
        SecureKeyManager.KEY_LENGTH,
        encryptedData.metadata.keyDerivation.hashFunction as crypto.BinaryToTextEncoding
      );

      // Create decipher
      const decipher = crypto.createDecipher(encryptedData.metadata.algorithm, decryptionKey);
      decipher.setAAD(Buffer.from('admin-key', 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));

      // Decrypt the secret key
      let decrypted = decipher.update(data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Validate the decrypted key
      if (!this.isValidStellarSecretKey(decrypted)) {
        throw new Error('Decrypted key is not a valid Stellar secret key');
      }

      // Cache the decrypted key in memory
      this.decryptedKey = decrypted;

      // Clear sensitive data from memory
      decryptionKey.fill(0);
      decipher.final();

      return decrypted;
    } catch (error) {
      throw new Error(`Failed to decrypt admin secret key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rotate the admin secret key
   */
  public rotateKey(newAdminSecretKey: string, masterPassword: string): void {
    if (!this.isValidStellarSecretKey(newAdminSecretKey)) {
      throw new Error('Invalid Stellar secret key format');
    }

    // Backup current encrypted key
    const keyFilePath = this.getKeyFilePath();
    const backupPath = `${keyFilePath}.backup.${Date.now()}`;

    if (fs.existsSync(keyFilePath)) {
      fs.copyFileSync(keyFilePath, backupPath);
    }

    try {
      // Encrypt and store the new key
      this.encryptAndStoreKey(newAdminSecretKey, masterPassword);

      // Clear cached decrypted key
      this.clearDecryptedKey();

      console.log(`Key rotated successfully. Backup saved to: ${backupPath}`);
    } catch (error) {
      // Restore from backup if rotation failed
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, keyFilePath);
        fs.unlinkSync(backupPath);
      }
      throw error;
    }
  }

  /**
   * Clear decrypted key from memory
   */
  public clearDecryptedKey(): void {
    if (this.decryptedKey) {
      // Overwrite the string memory (best effort)
      this.decryptedKey = '';
      this.decryptedKey = null;
    }
  }

  /**
   * Get key metadata
   */
  public getKeyMetadata(): KeyMetadata | null {
    if (!this.keyMetadata) {
      const keyFilePath = this.getKeyFilePath();
      if (fs.existsSync(keyFilePath)) {
        try {
          const encryptedData: EncryptedKeyData = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
          this.keyMetadata = encryptedData.metadata;
        } catch (error) {
          console.error('Failed to read key metadata:', error);
        }
      }
    }
    return this.keyMetadata;
  }

  /**
   * Check if encrypted key file exists
   */
  public hasEncryptedKey(): boolean {
    return fs.existsSync(this.getKeyFilePath());
  }

  /**
   * Validate Stellar secret key format
   */
  private isValidStellarSecretKey(secretKey: string): boolean {
    // Stellar secret keys start with 'S' followed by 56 base32 characters
    return /^[S][A-Z2-7]{56}$/.test(secretKey);
  }

  /**
   * Get the path to the encrypted key file
   */
  private getKeyFilePath(): string {
    const keyDir = process.env.KEY_STORAGE_PATH || path.join(process.cwd(), '.keys');

    // Ensure directory exists
    if (!fs.existsSync(keyDir)) {
      fs.mkdirSync(keyDir, { mode: 0o700 });
    }

    return path.join(keyDir, 'admin_key.encrypted');
  }

  /**
   * Generate a new Stellar keypair
   */
  public static generateStellarKeypair(): { publicKey: string; secretKey: string } {
    const { Keypair } = require('@stellar/stellar-sdk');
    const keypair = Keypair.random();

    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret()
    };
  }

  /**
   * Initialize key manager from environment variables (fallback for migration)
   */
  public initializeFromEnv(): void {
    const adminSecretKey = process.env.ADMIN_SECRET_KEY || process.env.SECRET_KEY;

    if (adminSecretKey && adminSecretKey !== 'your_stellar_secret_key_here') {
      console.warn('WARNING: Admin secret key found in environment variables. Consider using secure key management.');

      if (!this.hasEncryptedKey()) {
        console.log('Migrating admin secret key to secure storage...');
        const masterPassword = process.env.KEY_MASTER_PASSWORD;

        if (masterPassword) {
          try {
            this.encryptAndStoreKey(adminSecretKey, masterPassword);
            console.log('Admin secret key successfully migrated to secure storage');
          } catch (error) {
            console.error('Failed to migrate admin secret key:', error);
          }
        } else {
          console.warn('KEY_MASTER_PASSWORD not set. Cannot migrate admin secret key to secure storage.');
        }
      }
    }
  }
}

export default SecureKeyManager;
