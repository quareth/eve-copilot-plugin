import type { CallToolResult } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { assertJsonCompatible } from '../domain/json.js';

export const MAX_TOOL_RESULT_BYTES = 512 * 1024;

export function presentResult(
  schema: z.ZodType,
  value: unknown,
): CallToolResult {
  const parsed = schema.parse(value);
  assertJsonCompatible(parsed);
  const text = JSON.stringify(parsed);
  if (Buffer.byteLength(text, 'utf8') > MAX_TOOL_RESULT_BYTES) {
    throw new RangeError('Tool result exceeds the configured output limit.');
  }
  return {
    content: [{ type: 'text', text }],
    structuredContent: parsed,
    isError: false,
  };
}
