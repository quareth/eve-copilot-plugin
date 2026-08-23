import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, getRuntimeInfo } from '../../../src/bootstrap/runtime-info.js';

describe('runtime information', () => {
  it('matches the package version and exposes no host identity', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { readonly version?: unknown };
    expect(APP_VERSION).toBe(packageJson.version);
    expect(getRuntimeInfo()).not.toHaveProperty('hostname');
  });
});
