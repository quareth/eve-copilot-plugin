import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const paths = [
  'src/capabilities/generated/esi-operation-facts.ts',
  'src/capabilities/generated/coverage-summary.ts',
  'src/capabilities/generated/scope-bundles.ts',
  'src/capabilities/generated/semantic-tools.ts',
  'src/capabilities/generated/semantic-capabilities.ts',
  'docs/esi-coverage.json',
  'docs/esi-coverage.md',
  'docs/capability-catalog.md',
  'docs/scope-bundles.md',
];
// JavaScript build script: callers always pass a Buffer from readFileSync.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const normalizeGeneratedText = (contents) => contents
  .toString('utf8')
  .replace(/^\uFEFF/u, '')
  .replace(/\r\n?/gu, '\n');
const before = new Map(paths.map((path) => [path, normalizeGeneratedText(readFileSync(path))]));
execFileSync(process.execPath, ['scripts/generate-esi-coverage.mjs'], { stdio: 'pipe' });
for (const path of paths) {
  const prior = before.get(path);
  const current = normalizeGeneratedText(readFileSync(path));
  if (prior === undefined || prior !== current) {
    throw new Error(`Generated ESI artifact is stale or non-deterministic: ${path}`);
  }
}
