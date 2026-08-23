import { readFileSync } from 'node:fs';

const coverage = JSON.parse(readFileSync('docs/esi-coverage.json', 'utf8'));
const operations = coverage.operations ?? [];
const operationIds = new Set(operations.map((entry) => entry.operation_id));
if (operations.length !== 233 || operationIds.size !== 233) {
  throw new Error('Coverage must account for exactly 233 unique pinned ESI operations.');
}
const closedDispositions = new Set([
  'implemented_semantic',
  'implemented_bounded_low_level',
  'excluded_policy',
]);
const unresolved = operations.filter((entry) => !closedDispositions.has(entry.disposition));
if (unresolved.length > 0) {
  throw new Error(`ESI coverage is not closed; unresolved operations: ${unresolved.map((entry) => entry.operation_id).join(', ')}`);
}
if (coverage.summary?.accounted?.percent !== 100
  || coverage.summary?.allowed_execution?.percent !== 100
  || coverage.summary?.dispositions?.planned !== 0) {
  throw new Error('Coverage summary does not prove 100% accounted and allowed execution coverage.');
}
