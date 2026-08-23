import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../../src/domain/errors.js';
import { presentError } from '../../../src/mcp/error-presenter.js';
import { MAX_TOOL_RESULT_BYTES, presentResult } from '../../../src/mcp/result-presenter.js';

describe('MCP result presenters', () => {
  it('emits identical structured and text content after validation', () => {
    const result = presentResult(z.object({ value: z.string() }).strict(), { value: 'safe' });
    expect(result.structuredContent).toEqual({ value: 'safe' });
    expect(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')).toEqual(
      result.structuredContent,
    );
  });

  it('rejects invalid and oversized output', () => {
    expect(() => presentResult(z.object({ value: z.string() }).strict(), { value: 1 })).toThrow();
    expect(() => presentResult(
      z.object({ value: z.string() }).strict(),
      { value: 'x'.repeat(MAX_TOOL_RESULT_BYTES) },
    )).toThrow('output limit');
  });

  it('maps operational and unexpected errors without leaking causes', () => {
    const expected = presentError(new AppError({
      code: 'AMBIGUOUS_INPUT',
      safeMessage: 'Choose one matching item.',
      cause: new Error('secret-token'),
    }), '00000000-0000-4000-8000-000000000001');
    expect(expected.isError).toBe(true);
    expect(JSON.stringify(expected)).not.toContain('secret-token');

    const unexpected = presentError(
      new Error('database path and secret'),
      '00000000-0000-4000-8000-000000000002',
    );
    expect(unexpected.structuredContent).toMatchObject({
      error: { code: 'INTERNAL_ERROR', retryable: false },
    });
    expect(JSON.stringify(unexpected)).not.toContain('database path and secret');
  });
});
