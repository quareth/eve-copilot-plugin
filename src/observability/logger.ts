import type { LogFormat, LogLevel } from '../config/config-schema.js';
import { redactValue } from './redaction.js';

export interface LogContext {
  readonly request_id?: string;
  readonly component?: string;
  readonly capability_id?: string;
  readonly character_id?: number;
  readonly duration_ms?: number;
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(event: string, context?: LogContext): void;
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

interface LoggerOptions {
  readonly level: LogLevel;
  readonly format: LogFormat;
  readonly now?: () => Date;
  readonly write?: (line: string) => void;
  readonly context?: LogContext;
}

const LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? (() => new Date());
  const write = options.write ?? ((line: string) => process.stderr.write(`${line}\n`));
  const base = options.context ?? {};

  const emit = (level: LogLevel, event: string, context: LogContext = {}): void => {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[options.level]) return;
    const safe = redactValue({ ...base, ...context }) as Record<string, unknown>;
    if (options.format === 'json') {
      write(JSON.stringify({ timestamp: now().toISOString(), level, event, ...safe }));
      return;
    }
    const detail = Object.keys(safe).length === 0 ? '' : ` ${JSON.stringify(safe)}`;
    write(`${now().toISOString()} ${level.toUpperCase()} ${event}${detail}`);
  };

  return {
    debug: (event, context) => { emit('debug', event, context); },
    info: (event, context) => { emit('info', event, context); },
    warn: (event, context) => { emit('warn', event, context); },
    error: (event, context) => { emit('error', event, context); },
    child: (context) => createLogger({ ...options, now, write, context: { ...base, ...context } }),
  };
}
