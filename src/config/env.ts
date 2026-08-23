export type EnvSource = Readonly<Record<string, string | undefined>>;

const INTEGER_PATTERN = /^[+-]?\d+$/u;

export function readOptionalString(env: EnvSource, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  return raw.trim();
}

export function readOptionalInteger(
  env: EnvSource,
  name: string,
  bounds: { readonly min: number; readonly max: number },
): number | undefined {
  const raw = readOptionalString(env, name);
  if (raw === undefined) return undefined;
  if (!INTEGER_PATTERN.test(raw)) {
    throw new Error(`Environment variable ${name} must be an integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < bounds.min || value > bounds.max) {
    throw new Error(
      `Environment variable ${name} must be an integer between ${String(bounds.min)} and ${String(bounds.max)}.`,
    );
  }
  return value;
}

export function assertKnownProjectEnv(env: EnvSource, allowed: ReadonlySet<string>): void {
  const unknown = Object.keys(env)
    .filter((name) => name.startsWith('EVE_COPILOT_') && !allowed.has(name))
    .sort();
  if (unknown.length > 0) {
    throw new Error(`Unknown EVE Copilot environment variable(s): ${unknown.join(', ')}`);
  }
}
