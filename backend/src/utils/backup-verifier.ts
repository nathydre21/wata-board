import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Backup Verifier
 * Implements integrity checks for database backups to mitigate data corruption risk.
 */
export class BackupVerifier {
  private backupDir: string;
  private verificationLogPath: string;

  constructor(backupDir: string = './backups', logPath: string = './logs/backup-verification.log') {
    this.backupDir = backupDir;
    this.verificationLogPath = logPath;
    
    // Ensure log directory exists
    const logDir = path.dirname(this.verificationLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Verifies the integrity of the latest backup
   */
  public async verifyLatestBackup(): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return { success: false, message: `Backup directory not found: ${this.backupDir}` };
      }

      const files = fs.readdirSync(this.backupDir)
        // `.gpg`/`.enc` cover the encrypted dumps produced by backup-postgres.sh
        // when BACKUP_ENCRYPTION_PASSPHRASE is set — otherwise the verifier would
        // silently skip every real (encrypted) backup and report "none found".
        .filter(f => f.endsWith('.sql') || f.endsWith('.dump') || f.endsWith('.gz') || f.endsWith('.gpg') || f.endsWith('.enc'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          mtime: fs.statSync(path.join(this.backupDir, f)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (files.length === 0) {
        return { success: false, message: 'No backup files found to verify.' };
      }

      const latestBackup = files[0];
      const stats = fs.statSync(latestBackup.path);

      // Check 1: Size check (must be > 1KB)
      if (stats.size < 1024) {
        return this.logAndReturn(false, `Backup file ${latestBackup.name} is too small (${stats.size} bytes). Potential corruption.`);
      }

      // Check 2: Checksum verification (if a .sha256 file exists)
      const checksumPath = `${latestBackup.path}.sha256`;
      if (fs.existsSync(checksumPath)) {
        const storedChecksum = fs.readFileSync(checksumPath, 'utf8').trim();
        const actualChecksum = await this.calculateChecksum(latestBackup.path);
        
        if (storedChecksum !== actualChecksum) {
          return this.logAndReturn(false, `Checksum mismatch for ${latestBackup.name}. File may be corrupted.`);
        }
      }

      // Check 3: Content sanity check (e.g., look for common SQL markers if it's a text file)
      if (latestBackup.name.endsWith('.sql')) {
        const contentSample = fs.readFileSync(latestBackup.path, { encoding: 'utf8', flag: 'r' }).substring(0, 1000);
        const hasSqlMarkers = contentSample.includes('CREATE TABLE') || contentSample.includes('-- PostgreSQL') || contentSample.includes('INSERT INTO');
        
        if (!hasSqlMarkers) {
          return this.logAndReturn(false, `Backup file ${latestBackup.name} does not appear to be a valid SQL dump.`);
        }
      }

      return this.logAndReturn(true, `Backup ${latestBackup.name} verified successfully.`, {
        size: stats.size,
        timestamp: latestBackup.mtime
      });

    } catch (error: any) {
      return this.logAndReturn(false, `Verification failed with error: ${error.message}`);
    }
  }

  private calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', err => reject(err));
    });
  }

  private logAndReturn(success: boolean, message: string, details?: any) {
    const timestamp = new Date().toISOString();
    const status = success ? 'SUCCESS' : 'FAILED';
    const logEntry = `[${timestamp}] [${status}] ${message} ${details ? JSON.stringify(details) : ''}\n`;
    
    fs.appendFileSync(this.verificationLogPath, logEntry);
    
    return { success, message, details };
  }
}

// Example usage if run directly:
//   ts-node backup-verifier.ts [backupDir]
// The directory may also be supplied via BACKUP_VERIFY_DIR, or derived from
// BACKUP_DIR (the container writes dumps to $BACKUP_DIR/daily), so the same
// entrypoint works for the CI drill and the production sidecar.
if (require.main === module) {
  const targetDir =
    process.argv[2] ||
    process.env.BACKUP_VERIFY_DIR ||
    (process.env.BACKUP_DIR ? path.join(process.env.BACKUP_DIR, 'daily') : undefined);
  const verifier = targetDir ? new BackupVerifier(targetDir) : new BackupVerifier();
  verifier.verifyLatestBackup().then(result => {
    console.log(result.message);
    process.exit(result.success ? 0 : 1);
  });
}
