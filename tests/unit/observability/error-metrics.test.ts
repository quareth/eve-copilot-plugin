import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/domain/errors.js';
import { ErrorMetrics } from '../../../src/observability/error-metrics.js';
import { FixedClock } from '../../helpers/fakes.js';

describe('ErrorMetrics', () => {
  it('records only bounded stable categories and counts, never error details', () => {
    const metrics = new ErrorMetrics(new FixedClock());
    metrics.record(new AppError({
      code: 'MISSING_SCOPE',
      safeMessage: 'Do not retain this message.',
      details: { next_step: 'not-a-real-token' },
    }));
    metrics.record(new AppError({ code: 'MISSING_SCOPE', safeMessage: 'Again.' }));
    metrics.record(new Error('private implementation detail'));
    expect(metrics.snapshot()).toEqual([
      {
        code: 'INTERNAL_ERROR',
        count: 1,
        last_seen_at: '2026-08-20T10:00:00.000Z',
      },
      {
        code: 'MISSING_SCOPE',
        count: 2,
        last_seen_at: '2026-08-20T10:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(metrics.snapshot())).not.toContain('not-a-real-token');
    expect(JSON.stringify(metrics.snapshot())).not.toContain('private implementation detail');
  });
});
