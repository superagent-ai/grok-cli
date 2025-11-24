/**
 * Structured Logger for Grok CLI
 * Provides consistent logging across the application with levels and context
 */

import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  source?: string;
}

export interface LoggerOptions {
  level: LogLevel;
  enableColors: boolean;
  enableTimestamps: boolean;
  source?: string;
  silent?: boolean;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_LEVEL_COLORS: Record<LogLevel, (text: string) => string> = {
  debug: chalk.gray,
  info: chalk.blue,
  warn: chalk.yellow,
  error: chalk.red,
};

const LOG_LEVEL_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

/**
 * Structured Logger class
 */
export class Logger {
  private options: LoggerOptions;
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 1000;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      enableColors: process.stdout.isTTY ?? true,
      enableTimestamps: true,
      silent: process.env.NODE_ENV === 'test',
      ...options,
    };
  }

  /**
   * Create a child logger with additional context
   */
  child(source: string): Logger {
    return new Logger({
      ...this.options,
      source,
    });
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.options.level;
  }

  /**
   * Enable or disable silent mode
   */
  setSilent(silent: boolean): void {
    this.options.silent = silent;
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.options.level];
  }

  /**
   * Format timestamp
   */
  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Format log entry for output
   */
  private formatEntry(entry: LogEntry): string {
    const parts: string[] = [];
    const color = this.options.enableColors ? LOG_LEVEL_COLORS[entry.level] : (s: string) => s;
    const icon = LOG_LEVEL_ICONS[entry.level];

    // Timestamp
    if (this.options.enableTimestamps) {
      parts.push(chalk.gray(`[${entry.timestamp}]`));
    }

    // Level with icon
    parts.push(color(`${icon} ${entry.level.toUpperCase().padEnd(5)}`));

    // Source
    if (entry.source) {
      parts.push(chalk.cyan(`[${entry.source}]`));
    }

    // Message
    parts.push(entry.message);

    // Context
    if (entry.context && Object.keys(entry.context).length > 0) {
      const contextStr = JSON.stringify(entry.context);
      parts.push(chalk.gray(contextStr));
    }

    return parts.join(' ');
  }

  /**
   * Core log method
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
      context,
      source: this.options.source,
    };

    // Store in history
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    // Output
    if (!this.options.silent) {
      const formatted = this.formatEntry(entry);
      if (level === 'error') {
        console.error(formatted);
      } else if (level === 'warn') {
        console.warn(formatted);
      } else {
        console.log(formatted);
      }
    }
  }

  /**
   * Debug level log
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Info level log
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Warning level log
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Error level log
   */
  error(message: string, context?: LogContext): void;
  error(message: string, error: Error, context?: LogContext): void;
  error(message: string, errorOrContext?: Error | LogContext, context?: LogContext): void {
    let finalContext: LogContext = {};

    if (errorOrContext instanceof Error) {
      finalContext = {
        errorName: errorOrContext.name,
        errorMessage: errorOrContext.message,
        errorStack: errorOrContext.stack,
        ...context,
      };
    } else if (errorOrContext) {
      finalContext = errorOrContext;
    }

    this.log('error', message, finalContext);
  }

  /**
   * Log with timing
   */
  time(label: string): () => void {
    const start = Date.now();
    this.debug(`Timer started: ${label}`);

    return () => {
      const duration = Date.now() - start;
      this.debug(`Timer ended: ${label}`, { durationMs: duration });
    };
  }

  /**
   * Get log history
   */
  getHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  /**
   * Clear log history
   */
  clearHistory(): void {
    this.logHistory = [];
  }

  /**
   * Export logs as JSON
   */
  exportLogsAsJSON(): string {
    return JSON.stringify(this.logHistory, null, 2);
  }
}

// Default logger instance
let defaultLogger: Logger | null = null;

/**
 * Get the default logger instance
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger();
  }
  return defaultLogger;
}

/**
 * Create a new logger instance
 */
export function createLogger(options?: Partial<LoggerOptions>): Logger {
  return new Logger(options);
}

/**
 * Reset the default logger (for testing)
 */
export function resetLogger(): void {
  defaultLogger = null;
}

// Convenience exports for direct use
export const logger = {
  debug: (message: string, context?: LogContext) => getLogger().debug(message, context),
  info: (message: string, context?: LogContext) => getLogger().info(message, context),
  warn: (message: string, context?: LogContext) => getLogger().warn(message, context),
  error: (message: string, errorOrContext?: Error | LogContext, context?: LogContext) => {
    if (errorOrContext instanceof Error) {
      getLogger().error(message, errorOrContext, context);
    } else {
      getLogger().error(message, errorOrContext);
    }
  },
};
