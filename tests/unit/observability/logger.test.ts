import { describe, expect, it } from 'vitest';
import { createLogger } from '../../../src/observability/logger.js';

describe('createLogger', () => {
  it('emits structured redacted JSON with inherited context', () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: 'info',
      format: 'json',
      now: () => new Date('2026-08-20T10:00:00.000Z'),
      write: (line) => lines.push(line),
    });
    logger.child({ component: 'test' }).info('tool_call_completed', {
      request_id: 'request-1',
      token: 'secret',
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toEqual({
      timestamp: '2026-08-20T10:00:00.000Z',
      level: 'info',
      event: 'tool_call_completed',
      component: 'test',
      request_id: 'request-1',
      token: '[redacted]',
    });
  });

  it('filters messages below the configured level', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'warn', format: 'json', write: (line) => lines.push(line) });
    logger.info('ignored');
    logger.warn('included');
    expect(lines).toHaveLength(1);
  });
});
