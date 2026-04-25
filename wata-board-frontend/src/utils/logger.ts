/**
 * Log levels for the frontend logger
 */
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  AUDIT: 'AUDIT',
} as const;

export type LogLevelType = typeof LogLevel[keyof typeof LogLevel];

interface LogEntry {
  timestamp: string;
  level: LogLevelType;
  message: string;
  context?: Record<string, any>;
  error?: any;
}

/**
 * Structured logger for the frontend.
 * Provides consistent formatting and the ability to route logs to different destinations.
 */
class Logger {
  private minLevel: LogLevelType = LogLevel.INFO;

  constructor() {
    // Vite uses import.meta.env instead of process.env
    const isDev = (import.meta as any).env?.DEV || (import.meta as any).env?.MODE === 'development';
    if (isDev) {
      this.minLevel = LogLevel.DEBUG;
    }
  }

  private isLevelEnabled(level: LogLevelType): boolean {
    const levels: LogLevelType[] = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.AUDIT];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private format(level: LogLevelType, message: string, context?: Record<string, any>, error?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
    };
  }

  private log(entry: LogEntry) {
    if (!this.isLevelEnabled(entry.level)) return;

    // Standard console output with color for easy debugging
    const color = this.getColorForLevel(entry.level);
    const label = `%c[${entry.level}]`;
    const style = `color: ${color}; font-weight: bold;`;

    if (entry.level === LogLevel.ERROR) {
      console.error(label, style, entry.message, entry.context || '', entry.error || '');
    } else if (entry.level === LogLevel.WARN) {
      console.warn(label, style, entry.message, entry.context || '');
    } else {
      console.log(label, style, entry.message, entry.context || '');
    }
  }

  private getColorForLevel(level: LogLevelType): string {
    switch (level) {
      case LogLevel.DEBUG: return '#94a3b8'; // Slate-400
      case LogLevel.INFO: return '#0ea5e9';  // Sky-500
      case LogLevel.WARN: return '#f59e0b';  // Amber-500
      case LogLevel.ERROR: return '#ef4444'; // Red-500
      case LogLevel.AUDIT: return '#a855f7'; // Purple-500
      default: return '#ffffff';
    }
  }

  debug(message: string, context?: Record<string, any>) {
    this.log(this.format(LogLevel.DEBUG, message, context));
  }

  info(message: string, context?: Record<string, any>) {
    this.log(this.format(LogLevel.INFO, message, context));
  }

  warn(message: string, context?: Record<string, any>) {
    this.log(this.format(LogLevel.WARN, message, context));
  }

  error(message: string, error?: any, context?: Record<string, any>) {
    this.log(this.format(LogLevel.ERROR, message, context, error));
  }

  audit(message: string, context?: Record<string, any>) {
    this.log(this.format(LogLevel.AUDIT, message, context));
  }
}

export const logger = new Logger();
