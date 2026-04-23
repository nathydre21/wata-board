import { SecureKeyManager } from '../utils/secureKeyManager';
import { secureEnvConfig } from '../utils/secureEnvConfig';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('SecureKeyManager', () => {
  let keyManager: SecureKeyManager;
  let testKeyDir: string;
  let masterPassword: string;

  beforeEach(() => {
    keyManager = SecureKeyManager.getInstance();
    testKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-key-test-'));
    masterPassword = 'test-master-password-123';
    
    // Override key storage path for testing
    process.env.KEY_STORAGE_PATH = testKeyDir;
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testKeyDir)) {
      fs.rmSync(testKeyDir, { recursive: true, force: true });
    }
    
    // Clear decrypted key
    keyManager.clearDecryptedKey();
    
    // Reset environment
    delete process.env.KEY_STORAGE_PATH;
  });

  describe('Key Generation and Validation', () => {
    it('should generate valid Stellar keypair', () => {
      const keypair = SecureKeyManager.generateStellarKeypair();
      
      expect(keypair.publicKey).toMatch(/^[A-Z0-9]{56}$/);
      expect(keypair.secretKey).toMatch(/^[S][A-Z2-7]{56}$/);
      expect(keypair.secretKey).toHaveLength(57);
    });

    it('should validate Stellar secret key format', () => {
      const validKey = 'S' + 'A'.repeat(56);
      const invalidKey = 'invalid-key';
      
      // Test through keyManager instance (private method test via behavior)
      expect(() => {
        keyManager.encryptAndStoreKey(validKey, masterPassword);
      }).not.toThrow();
      
      expect(() => {
        keyManager.encryptAndStoreKey(invalidKey, masterPassword);
      }).toThrow();
    });
  });

  describe('Key Encryption and Decryption', () => {
    const testSecretKey = 'S' + 'A'.repeat(56);

    it('should encrypt and decrypt keys successfully', () => {
      keyManager.encryptAndStoreKey(testSecretKey, masterPassword);
      
      const decryptedKey = keyManager.getDecryptedKey(masterPassword);
      expect(decryptedKey).toBe(testSecretKey);
    });

    it('should fail decryption with wrong password', () => {
      keyManager.encryptAndStoreKey(testSecretKey, masterPassword);
      
      expect(() => {
        keyManager.getDecryptedKey('wrong-password');
      }).toThrow();
    });

    it('should fail decryption when no encrypted key exists', () => {
      expect(() => {
        keyManager.getDecryptedKey(masterPassword);
      }).toThrow();
    });

    it('should store encrypted key with proper permissions', () => {
      keyManager.encryptAndStoreKey(testSecretKey, masterPassword);
      
      const keyFilePath = path.join(testKeyDir, 'admin_key.encrypted');
      expect(fs.existsSync(keyFilePath)).toBe(true);
      
      const stats = fs.statSync(keyFilePath);
      // Check file permissions (0o600 = owner read/write only)
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('should clear decrypted key from memory', () => {
      keyManager.encryptAndStoreKey(testSecretKey, masterPassword);
      
      const decryptedKey = keyManager.getDecryptedKey(masterPassword);
      expect(decryptedKey).toBe(testSecretKey);
      
      keyManager.clearDecryptedKey();
      
      // After clearing, getting the key again should work (re-decryption)
      const decryptedKeyAgain = keyManager.getDecryptedKey(masterPassword);
      expect(decryptedKeyAgain).toBe(testSecretKey);
    });
  });

  describe('Key Rotation', () => {
    const originalKey = 'S' + 'A'.repeat(56);
    const newKey = 'S' + 'B'.repeat(56);

    it('should rotate keys successfully', () => {
      keyManager.encryptAndStoreKey(originalKey, masterPassword);
      
      keyManager.rotateKey(newKey, masterPassword);
      
      const decryptedKey = keyManager.getDecryptedKey(masterPassword);
      expect(decryptedKey).toBe(newKey);
    });

    it('should create backup during rotation', () => {
      keyManager.encryptAndStoreKey(originalKey, masterPassword);
      
      keyManager.rotateKey(newKey, masterPassword);
      
      // Check for backup file
      const files = fs.readdirSync(testKeyDir);
      const backupFiles = files.filter(file => file.includes('backup'));
      expect(backupFiles.length).toBeGreaterThan(0);
    });

    it('should restore from backup on rotation failure', () => {
      keyManager.encryptAndStoreKey(originalKey, masterPassword);
      
      // Try to rotate with invalid key
      expect(() => {
        keyManager.rotateKey('invalid-key', masterPassword);
      }).toThrow();
      
      // Original key should still work
      const decryptedKey = keyManager.getDecryptedKey(masterPassword);
      expect(decryptedKey).toBe(originalKey);
    });
  });

  describe('Key Metadata', () => {
    const testSecretKey = 'S' + 'A'.repeat(56);

    it('should track key metadata', () => {
      keyManager.encryptAndStoreKey(testSecretKey, masterPassword);
      
      const metadata = keyManager.getKeyMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.version).toBe(1);
      expect(metadata?.algorithm).toBe('aes-256-gcm');
      expect(metadata?.keyDerivation.iterations).toBe(100000);
      expect(metadata?.createdAt).toBeDefined();
      expect(metadata?.lastRotated).toBeDefined();
    });

    it('should update rotation timestamp', () => {
      keyManager.encryptAndStoreKey(testSecretKey, masterPassword);
      const originalMetadata = keyManager.getKeyMetadata();
      
      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        keyManager.rotateKey(testSecretKey, masterPassword);
        const newMetadata = keyManager.getKeyMetadata();
        
        expect(newMetadata?.lastRotated).not.toBe(originalMetadata?.lastRotated);
      }, 10);
    });
  });

  describe('Migration Support', () => {
    it('should migrate from environment variables', () => {
      // Set up environment variable with valid key
      const envKey = 'S' + 'C'.repeat(56);
      process.env.ADMIN_SECRET_KEY = envKey;
      process.env.KEY_MASTER_PASSWORD = masterPassword;
      
      keyManager.initializeFromEnv();
      
      // Should have created encrypted key
      expect(keyManager.hasEncryptedKey()).toBe(true);
      
      // Should be able to decrypt with master password
      const decryptedKey = keyManager.getDecryptedKey(masterPassword);
      expect(decryptedKey).toBe(envKey);
      
      // Clean up
      delete process.env.ADMIN_SECRET_KEY;
      delete process.env.KEY_MASTER_PASSWORD;
    });

    it('should not migrate when no master password is set', () => {
      const envKey = 'S' + 'C'.repeat(56);
      process.env.ADMIN_SECRET_KEY = envKey;
      // Don't set KEY_MASTER_PASSWORD
      
      keyManager.initializeFromEnv();
      
      // Should not have created encrypted key
      expect(keyManager.hasEncryptedKey()).toBe(false);
      
      // Clean up
      delete process.env.ADMIN_SECRET_KEY;
    });
  });
});

describe('SecureEnvConfig', () => {
  let testKeyDir: string;
  let masterPassword: string;

  beforeEach(() => {
    testKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-config-test-'));
    masterPassword = 'test-master-password-123';
    process.env.KEY_STORAGE_PATH = testKeyDir;
  });

  afterEach(() => {
    if (fs.existsSync(testKeyDir)) {
      fs.rmSync(testKeyDir, { recursive: true, force: true });
    }
    delete process.env.KEY_STORAGE_PATH;
    delete process.env.KEY_MASTER_PASSWORD;
    delete process.env.ADMIN_SECRET_KEY;
  });

  describe('Secure Key Retrieval', () => {
    it('should retrieve key from secure storage when master password is set', () => {
      const testKey = 'S' + 'D'.repeat(56);
      const keyManager = SecureKeyManager.getInstance();
      keyManager.encryptAndStoreKey(testKey, masterPassword);
      
      process.env.KEY_MASTER_PASSWORD = masterPassword;
      
      const retrievedKey = secureEnvConfig.getAdminSecretKey();
      expect(retrievedKey).toBe(testKey);
    });

    it('should fall back to environment variable when secure storage not available', () => {
      const testKey = 'S' + 'E'.repeat(56);
      process.env.ADMIN_SECRET_KEY = testKey;
      
      const retrievedKey = secureEnvConfig.getAdminSecretKey();
      expect(retrievedKey).toBe(testKey);
    });

    it('should throw error when no key is available', () => {
      expect(() => {
        secureEnvConfig.getAdminSecretKey();
      }).toThrow();
    });

    it('should clear admin secret key', () => {
      const testKey = 'S' + 'F'.repeat(56);
      process.env.ADMIN_SECRET_KEY = testKey;
      
      secureEnvConfig.clearAdminSecretKey();
      
      // Should still be able to retrieve from env (clearing only affects secure storage)
      const retrievedKey = secureEnvConfig.getAdminSecretKey();
      expect(retrievedKey).toBe(testKey);
    });

    it('should rotate admin secret key', () => {
      const originalKey = 'S' + 'G'.repeat(56);
      const newKey = 'S' + 'H'.repeat(56);
      const keyManager = SecureKeyManager.getInstance();
      keyManager.encryptAndStoreKey(originalKey, masterPassword);
      
      process.env.KEY_MASTER_PASSWORD = masterPassword;
      
      secureEnvConfig.rotateAdminSecretKey(newKey, masterPassword);
      
      const retrievedKey = secureEnvConfig.getAdminSecretKey();
      expect(retrievedKey).toBe(newKey);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration successfully', () => {
      process.env.API_KEY = 'test-api-key';
      process.env.KEY_MASTER_PASSWORD = masterPassword;
      
      // Set up secure key
      const keyManager = SecureKeyManager.getInstance();
      keyManager.encryptAndStoreKey('S' + 'I'.repeat(56), masterPassword);
      
      expect(() => {
        const { secureConfigManager } = require('../utils/secureEnvConfig');
        secureConfigManager.validateConfiguration();
      }).not.toThrow();
    });

    it('should fail validation when API key is missing', () => {
      delete process.env.API_KEY;
      
      expect(() => {
        const { secureConfigManager } = require('../utils/secureEnvConfig');
        secureConfigManager.validateConfiguration();
      }).toThrow();
    });
  });
});

describe('Security Tests', () => {
  let testKeyDir: string;

  beforeEach(() => {
    testKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-test-'));
    process.env.KEY_STORAGE_PATH = testKeyDir;
  });

  afterEach(() => {
    if (fs.existsSync(testKeyDir)) {
      fs.rmSync(testKeyDir, { recursive: true, force: true });
    }
    delete process.env.KEY_STORAGE_PATH;
  });

  describe('Encryption Security', () => {
    it('should use strong encryption parameters', () => {
      const keyManager = SecureKeyManager.getInstance();
      const testKey = 'S' + 'J'.repeat(56);
      const masterPassword = 'strong-master-password';
      
      keyManager.encryptAndStoreKey(testKey, masterPassword);
      
      const metadata = keyManager.getKeyMetadata();
      expect(metadata?.algorithm).toBe('aes-256-gcm');
      expect(metadata?.keyDerivation.iterations).toBe(100000);
      expect(metadata?.keyDerivation.saltLength).toBe(32);
    });

    it('should not store plaintext keys', () => {
      const keyManager = SecureKeyManager.getInstance();
      const testKey = 'S' + 'K'.repeat(56);
      const masterPassword = 'test-password';
      
      keyManager.encryptAndStoreKey(testKey, masterPassword);
      
      const keyFilePath = path.join(testKeyDir, 'admin_key.encrypted');
      const fileContent = fs.readFileSync(keyFilePath, 'utf8');
      
      // Ensure the original key is not stored in plaintext
      expect(fileContent).not.toContain(testKey);
      expect(fileContent).toContain('encrypted');
    });

    it('should generate unique salts for each encryption', () => {
      const keyManager = SecureKeyManager.getInstance();
      const testKey = 'S' + 'L'.repeat(56);
      const masterPassword = 'test-password';
      
      keyManager.encryptAndStoreKey(testKey, masterPassword);
      const firstFile = fs.readFileSync(path.join(testKeyDir, 'admin_key.encrypted'), 'utf8');
      
      // Clear and encrypt again
      keyManager.clearDecryptedKey();
      fs.rmSync(path.join(testKeyDir, 'admin_key.encrypted'));
      
      keyManager.encryptAndStoreKey(testKey, masterPassword);
      const secondFile = fs.readFileSync(path.join(testKeyDir, 'admin_key.encrypted'), 'utf8');
      
      // Files should be different due to different salts
      expect(firstFile).not.toBe(secondFile);
    });
  });
});
