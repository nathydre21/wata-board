import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

/**
 * Custom log format including timestamp, level, message, and structured context.
 */
const logFormat = winston.format.printf(({ timestamp, level, message, ...metadata }) => {
  let msg = `${timestamp} [${level}] : ${message} `;
  if (Object.keys(metadata).length > 0) {
    msg += JSON.stringify(metadata);
  }
  return msg;
});

/**
 * Production-grade logger for the backend.
 * Features:
 * - JSON output for machine readability (e.g., Splunk, ELK)
 * - Daily file rotation for logs to prevent disk space issues
 * - Multi-transport: Console and File
 * - Context/Metadata support
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
    winston.format.json()
  ),
  defaultMeta: { service: 'wata-board-api' },
  transports: [
    // Console transport for development and container orchestration (Docker/K8s)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      )
    }),
    
    // File rotation for persisting info level and above
    new DailyRotateFile({
      filename: path.join('logs', 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info'
    }),

    // Separate file for persistent error logs
    new DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error'
    })
  ]
});

/**
 * Convenience logger for audit-specific events (security sensitive).
 */
export const auditLogger = {
  log: (message: string, meta?: any) => {
    logger.info(`[AUDIT] ${message}`, { ...meta, audit: true });
  }
};

export default logger;
