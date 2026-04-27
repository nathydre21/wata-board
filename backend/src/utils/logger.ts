import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import https from 'https';
import http from 'http';
import Transport from 'winston-transport';

// Ships log entries to an external aggregation endpoint (ELK, Loki, Splunk, etc.)
// Activated only when LOG_AGGREGATION_URL is set. Failures are silently swallowed
// so that a dead aggregator never crashes the application.
class HttpAggregationTransport extends Transport {
  private aggregationUrl: URL;

  constructor(opts: ConstructorParameters<typeof Transport>[0] & { url: string }) {
    super(opts);
    this.aggregationUrl = new URL(opts.url);
  }

  log(info: Record<string, unknown>, callback: () => void): void {
    setImmediate(() => this.emit('logged', info));

    const body = JSON.stringify(info);
    const isHttps = this.aggregationUrl.protocol === 'https:';
    const options: http.RequestOptions = {
      hostname: this.aggregationUrl.hostname,
      port: this.aggregationUrl.port || (isHttps ? 443 : 80),
      path: this.aggregationUrl.pathname + this.aggregationUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(process.env.LOG_AGGREGATION_API_KEY && {
          Authorization: `Bearer ${process.env.LOG_AGGREGATION_API_KEY}`,
        }),
      },
    };

    const transport = isHttps ? https : http;
    const req = transport.request(options);
    req.on('error', () => {});
    req.write(body);
    req.end();

    callback();
  }
}

const logFormat = winston.format.printf(({ timestamp, level, message, ...metadata }) => {
  let msg = `${timestamp} [${level}] : ${message} `;
  if (Object.keys(metadata).length > 0) {
    msg += JSON.stringify(metadata);
  }
  return msg;
});

const transports: winston.transport[] = [
  // Console — colorized for local dev, readable by container orchestrators (Docker/K8s)
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      logFormat
    ),
  }),

  // Combined — single stream with all levels for easy local debugging
  new DailyRotateFile({
    filename: path.join('logs', 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
  }),

  // Application — info and above
  new DailyRotateFile({
    filename: path.join('logs', 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    level: 'info',
  }),

  // Error — errors only, longer retention
  new DailyRotateFile({
    filename: path.join('logs', 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
  }),

  // Audit — security-sensitive events, 1-year retention
  new DailyRotateFile({
    filename: path.join('logs', 'audit-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '50m',
    maxFiles: '365d',
    level: 'info',
  }),
];

// Opt-in external aggregation: set LOG_AGGREGATION_URL to enable
if (process.env.LOG_AGGREGATION_URL) {
  transports.push(
    new HttpAggregationTransport({ url: process.env.LOG_AGGREGATION_URL })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
    winston.format.json()
  ),
  defaultMeta: { service: 'wata-board-api' },
  transports,
});

export const auditLogger = {
  log: (message: string, meta?: Record<string, unknown>) => {
    logger.info(`[AUDIT] ${message}`, {
      ...meta,
      audit: true,
      event_timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  },
};

export default logger;
