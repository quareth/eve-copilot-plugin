import { describe, expect, it } from 'vitest';
import { redactString, redactValue } from '../../../src/observability/redaction.js';

describe('redaction', () => {
  it('redacts authentication values and sensitive assignments', () => {
    expect(redactString('Authorization: Bearer abc.def and Basic Zm9vOmJhcg=='))
      .toBe('Authorization: Bearer [redacted] and Basic [redacted]');
    expect(redactString('https://user:pass@example.test/?refresh_token=secret&safe=yes'))
      .toBe('https://user:[redacted]@example.test/?refresh_token=[redacted]&safe=yes');
  });

  it('redacts nested sensitive properties and errors', () => {
    const error = new Error('Bearer secret-token');
    const redacted = redactValue({
      accessToken: 'secret',
      nested: [{ safe: 'value', cookie: 'session' }],
      error,
    });
    expect(redacted).toMatchObject({
      accessToken: '[redacted]',
      nested: [{ safe: 'value', cookie: '[redacted]' }],
      error: { message: 'Bearer [redacted]' },
    });
  });

  it('handles cyclic values', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(redactValue(cyclic)).toEqual({ self: '[circular]' });
    const cyclicArray: unknown[] = [];
    cyclicArray.push(cyclicArray);
    expect(redactValue(cyclicArray)).toEqual(['[circular]']);
  });
});
