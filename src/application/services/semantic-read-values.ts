import type { SemanticReadComponent } from '../dto/semantic-read.js';
import type { JsonValue } from '../../domain/json.js';

export function collectFieldValues(value: JsonValue, field: string, output: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value as readonly JsonValue[]) collectFieldValues(entry, field, output);
  } else if (isJsonObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (key === field) {
        const canonical = canonicalValue(entry);
        if (canonical !== null) output.add(canonical);
      }
      collectFieldValues(entry, field, output);
    }
  }
}

export function arrayResult(
  components: readonly SemanticReadComponent[],
  operationId: string,
): readonly JsonValue[] {
  const value = components.find((component) => component.operation_id === operationId)?.result;
  return Array.isArray(value) ? value as readonly JsonValue[] : [];
}

export function objectResult(
  components: readonly SemanticReadComponent[],
  operationId: string,
): Readonly<Record<string, JsonValue>> | null {
  const value = components.find((component) => component.operation_id === operationId)?.result;
  return value !== undefined && isJsonObject(value) ? value : null;
}

export function scalarResult(
  components: readonly SemanticReadComponent[],
  operationId: string,
): JsonValue | undefined {
  return components.find((component) => component.operation_id === operationId)?.result;
}

export function objectNumber(
  value: Readonly<Record<string, JsonValue>> | undefined,
  field: string,
): number | null {
  const entry = value?.[field];
  return typeof entry === 'number' && Number.isFinite(entry) ? entry : null;
}

export function canonicalValue(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

export function resultItemCount(value: JsonValue): number {
  if (Array.isArray(value)) return value.length;
  if (!isJsonObject(value)) return 1;
  const collection = Object.values(value).find(Array.isArray);
  return collection === undefined ? 1 : collection.length;
}

export function numericId(value: JsonValue | undefined): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(0|[1-9][0-9]{0,9})$/u.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export function isJsonObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
