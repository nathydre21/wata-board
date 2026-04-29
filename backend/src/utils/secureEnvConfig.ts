import { SecureKeyManager } from './secureKeyManager';

export interface SecureEnvConfig {
  PORT: number;
  NODE_ENV: string;
  HTTPS_ENABLED: boolean;
  SSL_KEY_PATH?: string;
  SSL_CERT_PATH?: string;
  SSL_CA_PATH?: string;
  ALLOWED_ORIGINS: string[];
  FRONTEND_URL?: string;
  NETWORK: 'testnet' | 'mainnet';
  
  NETWORK_PASSPHRASE_MAINNET: string;
  CONTRACT_ID_MAINNET: string;
  RPC_URL_MAINNET: string;
  
  NETWORK_PASSPHRASE_TESTNET: string;
  CONTRACT_ID_TESTNET: string;
  RPC_URL_TESTNET: string;

  API_KEY: string;
  
  // Secure admin key management
  getAdminSecretKey: () => string;
  clearAdminSecretKey: () => void;
  rotateAdminSecretKey: (newKey: string, masterPassword: string) => void;
}

class SecureEnvConfigManager {
  private static instance: SecureEnvConfigManager;
  private keyManager: SecureKeyManager;
  private config: SecureEnvConfig;

  private constructor() {
    this.keyManager = SecureKeyManager.getInstance();
    this.config = this.initializeConfig();
  }

  public static getInstance(): SecureEnvConfigManager {
    if (!SecureEnvConfigManager.instance) {
      SecureEnvConfigManager.instance = new SecureEnvConfigManager();
    }
    return SecureEnvConfigManager.instance;
  }

  private initializeConfig(): SecureEnvConfig {
    const NODE_ENV = process.env.NODE_ENV || 'development';
    const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
    const NETWORK = (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';
    const PORT = parseInt(process.env.PORT || '3001', 10);

    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error('CRITICAL: API_KEY is missing from environment variables.');
    }

    const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
      : [];

    // Initialize secure key manager
    this.keyManager.initializeFromEnv();

    return {
      PORT,
      NODE_ENV,
      HTTPS_ENABLED,
      SSL_KEY_PATH: process.env.SSL_KEY_PATH,
      SSL_CERT_PATH: process.env.SSL_CERT_PATH,
      SSL_CA_PATH: process.env.SSL_CA_PATH,
      ALLOWED_ORIGINS,
      FRONTEND_URL: process.env.FRONTEND_URL,
      NETWORK,
      API_KEY,
      
      NETWORK_PASSPHRASE_MAINNET: process.env.NETWORK_PASSPHRASE_MAINNET || 'Public Global Stellar Network ; September 2015',
      CONTRACT_ID_MAINNET: process.env.CONTRACT_ID_MAINNET || '',
      RPC_URL_MAINNET: process.env.RPC_URL_MAINNET || 'https://soroban.stellar.org',
      
      NETWORK_PASSPHRASE_TESTNET: process.env.NETWORK_PASSPHRASE_TESTNET || 'Test SDF Network ; September 2015',
      CONTRACT_ID_TESTNET: process.env.CONTRACT_ID_TESTNET || 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
      RPC_URL_TESTNET: process.env.RPC_URL_TESTNET || 'https://soroban-testnet.stellar.org',

      // Secure admin key methods
      getAdminSecretKey: (): string => {
        const masterPassword = process.env.KEY_MASTER_PASSWORD;
        
        if (!masterPassword) {
          // Fallback to environment variable for backward compatibility
          const envKey = process.env.ADMIN_SECRET_KEY || process.env.SECRET_KEY;
          if (envKey && envKey !== 'your_stellar_secret_key_here') {
            console.warn('WARNING: Using admin secret key from environment variables. Consider using secure key management.');
            return envKey;
          }
          
          throw new Error('CRITICAL: KEY_MASTER_PASSWORD environment variable is required for secure key management. ' +
                        'Alternatively, set ADMIN_SECRET_KEY for backward compatibility (not recommended).');
        }

        try {
          return this.keyManager.getDecryptedKey(masterPassword);
        } catch (error) {
          throw new Error(`Failed to retrieve admin secret key: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },

      clearAdminSecretKey: (): void => {
        this.keyManager.clearDecryptedKey();
      },

      rotateAdminSecretKey: (newKey: string, masterPassword: string): void => {
        this.keyManager.rotateKey(newKey, masterPassword);
      }
    };
  }

  public getConfig(): SecureEnvConfig {
    return this.config;
  }

  public validateConfiguration(): void {
    const config = this.config;
    
    // Validate network configuration
    if (config.NETWORK === 'mainnet' && !config.CONTRACT_ID_MAINNET) {
      throw new Error('CONTRACT_ID_MAINNET is required when NETWORK is mainnet');
    }

    // Validate secure key management
    const masterPassword = process.env.KEY_MASTER_PASSWORD;
    if (!masterPassword) {
      const envKey = process.env.ADMIN_SECRET_KEY || process.env.SECRET_KEY;
      if (!envKey || envKey === 'your_stellar_secret_key_here') {
        throw new Error('Either KEY_MASTER_PASSWORD (for secure key management) or ADMIN_SECRET_KEY (fallback) must be set');
      }
    } else if (!this.keyManager.hasEncryptedKey()) {
      throw new Error('KEY_MASTER_PASSWORD is set but no encrypted key file exists. Please encrypt and store the admin key first.');
    }

    console.log(`Configuration validated successfully for ${config.NODE_ENV} environment`);
    console.log(`Network: ${config.NETWORK}`);
    console.log(`Secure key management: ${this.keyManager.hasEncryptedKey() ? 'Enabled' : 'Fallback to environment variables'}`);
  }

  public getKeyManager(): SecureKeyManager {
    return this.keyManager;
  }
}

// Export singleton instance
export const secureEnvConfig = SecureEnvConfigManager.getInstance().getConfig();
export const secureConfigManager = SecureEnvConfigManager.getInstance();


