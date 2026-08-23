import { describe, expect, it } from 'vitest';
import { assertJsonCompatible } from '../../../src/domain/json.js';
import { localResult } from '../../../src/domain/result.js';

describe('result contracts', () => {
  it('creates the stable local result envelope', () => {
    const result = localResult({
      requestId: 'request-1',
      retrievedAt: new Date('2026-08-20T10:00:00.000Z'),
      data: { ready: true },
    });
    expect(result).toEqual({
      schema_version: 1,
      request_id: 'request-1',
      character: null,
      data: { ready: true },
      source: { kind: 'local', name: 'EVE Copilot MCP' },
      retrieved_at: '2026-08-20T10:00:00.000Z',
      expires_at: null,
      cache: 'not_applicable',
      estimated: false,
      partial: false,
      warnings: [],
    });
    expect(() => { assertJsonCompatible(result); }).not.toThrow();
  });

  it('keeps estimated and partial independent', () => {
    const result = localResult({
      requestId: 'request-1',
      retrievedAt: new Date('2026-08-20T10:00:00.000Z'),
      data: {},
      partial: true,
    });
    expect(result.partial).toBe(true);
    expect(result.estimated).toBe(false);
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    1n,
    new Date(),
  ])('rejects unsupported JSON value %#', (value) => {
    expect(() => { assertJsonCompatible({ value }); }).toThrow();
  });

  it('rejects cycles', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => { assertJsonCompatible(value); }).toThrow(/cyclic/u);
  });
});
