export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export function assertJsonCompatible(value: unknown): asserts value is JsonValue {
  visit(value, new WeakSet<object>());
}

function visit(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON output contains a non-finite number.');
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError('JSON output contains an unsafe integer.');
    }
    return;
  }
  if (typeof value !== 'object') throw new TypeError(`JSON output contains unsupported type: ${typeof value}`);
  if (seen.has(value)) throw new TypeError('JSON output contains a cyclic value.');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) visit(item, seen);
    seen.delete(value);
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('JSON output contains a non-plain object.');
  }
  for (const entry of Object.values(value)) {
    if (entry === undefined) throw new TypeError('JSON output contains undefined.');
    visit(entry, seen);
  }
  seen.delete(value);
}
