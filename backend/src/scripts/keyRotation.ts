#!/usr/bin/env ts-node

import { SecureKeyManager } from '../utils/secureKeyManager';
import { secureConfigManager } from '../utils/secureEnvConfig';
import readline from 'readline';

interface RotationOptions {
  dryRun?: boolean;
  force?: boolean;
  backupPath?: string;
}

class KeyRotationService {
  private keyManager: SecureKeyManager;
  private rl: readline.Interface;

  constructor() {
    this.keyManager = SecureKeyManager.getInstance();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Perform key rotation with proper validation and backup
   */
  public async rotateKey(options: RotationOptions = {}): Promise<void> {
    console.log('=== Admin Secret Key Rotation ===\n');

    try {
      // Validate current configuration
      this.validateCurrentSetup();

      // Get current key info
      const currentMetadata = this.keyManager.getKeyMetadata();
      if (currentMetadata) {
        console.log('Current key metadata:');
        console.log(`  Version: ${currentMetadata.version}`);
        console.log(`  Created: ${currentMetadata.createdAt}`);
        console.log(`  Last Rotated: ${currentMetadata.lastRotated || 'Never'}`);
        console.log(`  Algorithm: ${currentMetadata.algorithm}`);
        console.log('');
      }

      if (options.dryRun) {
        console.log('DRY RUN: Key rotation simulation - no changes will be made');
        return;
      }

      // Get master password
      const masterPassword = await this.promptPassword('Enter master password: ');
      
      // Verify current key can be decrypted
      console.log('Verifying current key...');
      const currentKey = this.keyManager.getDecryptedKey(masterPassword);
      console.log('Current key verified successfully');

      // Generate new key or use provided one
      const newKey = await this.getNewKey();

      // Confirm rotation
      if (!options.force) {
        const confirmed = await this.promptConfirmation(
          'Are you sure you want to rotate the admin secret key? This will affect all contract operations. (yes/no): '
        );
        
        if (confirmed !== 'yes') {
          console.log('Key rotation cancelled');
          return;
        }
      }

      // Perform rotation
      console.log('Performing key rotation...');
      this.keyManager.rotateKey(newKey, masterPassword);
      
      console.log('Key rotation completed successfully!');
      console.log('New key metadata:');
      const newMetadata = this.keyManager.getKeyMetadata();
      if (newMetadata) {
        console.log(`  Version: ${newMetadata.version}`);
        console.log(`  Rotated: ${newMetadata.lastRotated}`);
      }

      // Show new public key for verification
      const { Keypair } = await import('@stellar/stellar-sdk');
      const newKeypair = Keypair.fromSecret(newKey);
      console.log(`  Public Key: ${newKeypair.publicKey()}`);

      // Clear sensitive data
      this.clearSensitiveData();

    } catch (error) {
      console.error('Key rotation failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  /**
   * Schedule automatic key rotation
   */
  public scheduleRotation(intervalDays: number): void {
    console.log(`Scheduling automatic key rotation every ${intervalDays} days`);
    
    // In a production environment, this would integrate with a job scheduler
    // For now, we'll just log the recommendation
    const nextRotation = new Date();
    nextRotation.setDate(nextRotation.getDate() + intervalDays);
    
    console.log(`Next scheduled rotation: ${nextRotation.toISOString()}`);
    console.log('Note: Implement this with your preferred job scheduler (cron, systemd timer, etc.)');
  }

  /**
   * Validate current setup before rotation
   */
  private validateCurrentSetup(): void {
    if (!this.keyManager.hasEncryptedKey()) {
      throw new Error('No encrypted key file found. Please set up secure key management first.');
    }

    const masterPassword = process.env.KEY_MASTER_PASSWORD;
    if (!masterPassword) {
      console.warn('WARNING: KEY_MASTER_PASSWORD not set in environment variables');
      console.warn('You will need to enter the master password manually');
    }
  }

  /**
   * Get new key from user input or generate one
   */
  private async getNewKey(): Promise<string> {
    const choice = await this.promptChoice(
      'Do you want to (1) generate a new key or (2) provide an existing key? ',
      ['1', '2']
    );

    if (choice === '1') {
      console.log('Generating new Stellar keypair...');
      const newKeypair = SecureKeyManager.generateStellarKeypair();
      
      console.log(`New Public Key: ${newKeypair.publicKey}`);
      console.log(`New Secret Key: ${newKeypair.secretKey}`);
      
      const confirmed = await this.promptConfirmation('Save this new keypair for rotation? (yes/no): ');
      if (confirmed !== 'yes') {
        throw new Error('Key generation cancelled');
      }

      return newKeypair.secretKey;
    } else {
      const secretKey = await this.promptPassword('Enter the new Stellar secret key: ');
      
      // Validate format
      if (!/^[S][A-Z2-7]{56}$/.test(secretKey)) {
        throw new Error('Invalid Stellar secret key format');
      }

      return secretKey;
    }
  }

  /**
   * Prompt for password input
   */
  private async promptPassword(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      // Hide password input
      const stdin = process.stdin;
      stdin.setRawMode(true);
      
      let password = '';
      process.stdout.write(prompt);
      
      stdin.on('data', function(char) {
        char = char.toString();
        
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl+D
            stdin.setRawMode(false);
            stdin.removeAllListeners('data');
            console.log();
            resolve(password);
            break;
          case '\u0003': // Ctrl+C
            console.log('\nOperation cancelled');
            process.exit(1);
            break;
          default:
            password += char;
            break;
        }
      });
    });
  }

  /**
   * Prompt for confirmation
   */
  private async promptConfirmation(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.toLowerCase().trim());
      });
    });
  }

  /**
   * Prompt for choice
   */
  private async promptChoice(prompt: string, validChoices: string[]): Promise<string> {
    return new Promise((resolve) => {
      const ask = () => {
        this.rl.question(prompt, (answer) => {
          const choice = answer.trim();
          if (validChoices.includes(choice)) {
            resolve(choice);
          } else {
            console.log(`Please choose from: ${validChoices.join(', ')}`);
            ask();
          }
        });
      };
      ask();
    });
  }

  /**
   * Clear sensitive data from memory
   */
  private clearSensitiveData(): void {
    this.keyManager.clearDecryptedKey();
    secureConfigManager.getConfig().clearAdminSecretKey();
  }

  /**
   * Generate rotation report
   */
  public generateRotationReport(): void {
    const metadata = this.keyManager.getKeyMetadata();
    
    if (!metadata) {
      console.log('No encrypted key found');
      return;
    }

    console.log('=== Key Rotation Report ===');
    console.log(`Key Version: ${metadata.version}`);
    console.log(`Created: ${metadata.createdAt}`);
    console.log(`Last Rotated: ${metadata.lastRotated || 'Never'}`);
    console.log(`Algorithm: ${metadata.algorithm}`);
    console.log(`Key Derivation: ${metadata.keyDerivation.hashFunction}`);
    console.log(`Iterations: ${metadata.keyDerivation.iterations}`);
    
    // Calculate days since last rotation
    if (metadata.lastRotated) {
      const lastRotated = new Date(metadata.lastRotated);
      const daysSinceRotation = Math.floor((Date.now() - lastRotated.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`Days since last rotation: ${daysSinceRotation}`);
      
      if (daysSinceRotation > 90) {
        console.log('WARNING: Key should be rotated (recommended: every 90 days)');
      }
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const rotationService = new KeyRotationService();

  try {
    if (args.includes('--help') || args.includes('-h')) {
      console.log('Admin Secret Key Rotation Tool');
      console.log('');
      console.log('Usage:');
      console.log('  npm run rotate-key                    # Interactive rotation');
      console.log('  npm run rotate-key -- --dry-run       # Simulation mode');
      console.log('  npm run rotate-key -- --force         # Skip confirmation');
      console.log('  npm run rotate-key -- --report        # Show rotation report');
      console.log('  npm run rotate-key -- --schedule 30   # Schedule rotation (30 days)');
      console.log('');
      return;
    }

    if (args.includes('--report')) {
      rotationService.generateRotationReport();
      return;
    }

    if (args.includes('--schedule')) {
      const scheduleIndex = args.indexOf('--schedule');
      const interval = parseInt(args[scheduleIndex + 1]);
      
      if (isNaN(interval) || interval < 1) {
        console.error('Invalid interval. Please provide a positive number of days.');
        process.exit(1);
      }
      
      rotationService.scheduleRotation(interval);
      return;
    }

    const options: RotationOptions = {
      dryRun: args.includes('--dry-run'),
      force: args.includes('--force')
    };

    await rotationService.rotateKey(options);

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default KeyRotationService;
