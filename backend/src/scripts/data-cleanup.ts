import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

/**
 * Data Cleanup Script
 * Enforces the Data Retention Policy by removing old logs and temporary data.
 */

const LOG_DIR = path.join(process.cwd(), 'logs');
const MAX_AUDIT_LOG_AGE_DAYS = 365;
const MAX_APP_LOG_AGE_DAYS = 14;

async function cleanupLogs() {
  if (!fs.existsSync(LOG_DIR)) {
    logger.info('Log directory does not exist, skipping cleanup', { path: LOG_DIR });
    return;
  }

  const files = fs.readdirSync(LOG_DIR);
  const now = Date.now();

  for (const file of files) {
    const filePath = path.join(LOG_DIR, file);
    const stats = fs.statSync(filePath);
    const ageInDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);

    let shouldDelete = false;

    if (file.startsWith('audit-') && ageInDays > MAX_AUDIT_LOG_AGE_DAYS) {
      shouldDelete = true;
    } else if (file.startsWith('application-') && ageInDays > MAX_APP_LOG_AGE_DAYS) {
      shouldDelete = true;
    } else if (file.startsWith('error-') && ageInDays > 30) {
      shouldDelete = true;
    }

    if (shouldDelete) {
      try {
        fs.unlinkSync(filePath);
        logger.info(`Deleted old log file: ${file}`, { ageInDays });
      } catch (error) {
        logger.error(`Failed to delete log file: ${file}`, { error });
      }
    }
  }
}

async function runCleanup() {
  logger.info('Starting scheduled data cleanup...');
  try {
    await cleanupLogs();
    // Add other cleanup tasks here (e.g. database pruning)
    logger.info('Data cleanup completed successfully.');
  } catch (error) {
    logger.error('Data cleanup failed', { error });
  }
}

// Run if called directly
if (require.main === module) {
  runCleanup();
}

export { runCleanup };
