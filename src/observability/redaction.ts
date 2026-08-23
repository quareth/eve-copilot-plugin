const SENSITIVE_KEY = /(?:token|secret|password|authorization|cookie|api[_-]?key)/iu;
const BEARER_OR_BASIC = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/giu;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu;
const SENSITIVE_ASSIGNMENT = /\b(access_token|refresh_token|id_token|api_key|apikey|authorization|cookie)=([^&\s]+)/giu;
const URL_CREDENTIALS = /\/\/([^:\s/@]+):([^@\s/]+)@/gu;

export function redactValue(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(value.stack === undefined ? {} : { stack: redactString(value.stack) }),
    };
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (Array.isArray(value)) {
      const output = value.map((entry) => redactValue(entry, seen));
      seen.delete(value);
      return output;
    }
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactValue(entry, seen);
    }
    seen.delete(value);
    return output;
  }
  return value;
}

export function redactString(value: string): string {
  return value
    .replace(BEARER_OR_BASIC, (match) => `${match.slice(0, match.indexOf(' '))} [redacted]`)
    .replace(JWT, '[redacted]')
    .replace(SENSITIVE_ASSIGNMENT, '$1=[redacted]')
    .replace(URL_CREDENTIALS, '//$1:[redacted]@');
}
