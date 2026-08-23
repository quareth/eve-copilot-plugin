#!/usr/bin/env node
/* global fetch, AbortSignal */

import { createHash } from 'node:crypto';

const compatibilityDate = '2026-08-18';
const expectedBytes = 614466;
const expectedHash = '1d7bf362256bff980f72e4dd0aa7917da9431383b0b29f6fbc44f30b1d1d0b02';
const response = await fetch('https://esi.evetech.net/meta/openapi.json', {
  headers: {
    accept: 'application/json',
    'user-agent': 'eve-copilot-mcp-openapi-drift-check',
    'x-compatibility-date': compatibilityDate,
  },
  redirect: 'error',
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`Official ESI OpenAPI drift check returned HTTP ${String(response.status)}.`);
const bytes = new Uint8Array(await response.arrayBuffer());
const hash = createHash('sha256').update(bytes).digest('hex');
if (bytes.byteLength !== expectedBytes || hash !== expectedHash) {
  throw new Error(
    `Official ESI contract drifted for ${compatibilityDate}; review and regenerate before merging. `
    + `Expected ${String(expectedBytes)} bytes/${expectedHash}, received ${String(bytes.byteLength)} bytes/${hash}.`,
  );
}
