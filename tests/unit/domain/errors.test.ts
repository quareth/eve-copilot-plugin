import { describe, expect, it } from 'vitest';
import { AppError, isRetryableError, throwIfAborted, type ErrorCode } from '../../../src/domain/errors.js';

describe('domain errors', () => {
  it('retains a safe contract separately from the cause', () => {
    const error = new AppError({
      code: 'DATABASE_UNAVAILABLE',
      safeMessage: 'Database unavailable.',
      cause: new Error('private/path.db failed'),
    });
    expect(error.code).toBe('DATABASE_UNAVAILABLE');
    expect(error.safeMessage).toBe('Database unavailable.');
    expect(error.cause).toBeInstanceOf(Error);
  });

  it.each<readonly [ErrorCode, boolean]>([
    ['RATE_LIMITED', true],
    ['ESI_UNAVAILABLE', true],
    ['UPSTREAM_SERVICE_FAILED', true],
    ['MISSING_SCOPE', false],
    ['CANCELLED', false],
    ['INTERNAL_ERROR', false],
  ])('maps retryability for %s', (code, expected) => {
    expect(isRetryableError(code)).toBe(expected);
  });

  it('only retries identified transient database failures', () => {
    expect(isRetryableError('DATABASE_UNAVAILABLE')).toBe(false);
    expect(isRetryableError('DATABASE_UNAVAILABLE', true)).toBe(true);
  });

  it('maps cancellation to a stable error', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => { throwIfAborted(controller.signal); }).toThrow(
      expect.objectContaining({ code: 'CANCELLED' }),
    );
  });
});
