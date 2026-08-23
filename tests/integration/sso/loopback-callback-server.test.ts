import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { LoopbackCallbackServer } from '../../../src/infrastructure/sso/loopback-callback-server.js';

const listeners: LoopbackCallbackServer[] = [];

afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.close()));
});

describe('LoopbackCallbackServer', () => {
  it('accepts one bounded code/state callback and returns a static safe page', async () => {
    const redirectUri = await unusedRedirectUri();
    const callbacks: unknown[] = [];
    const listener = new LoopbackCallbackServer({
      redirectUri,
      handler(input) {
        callbacks.push(input);
        return Promise.resolve();
      },
    });
    listeners.push(listener);
    await listener.ensureListening(new AbortController().signal);
    const response = await fetch(`${redirectUri}?state=opaque-state&code=one-time-code`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('one-time-code');
    expect(callbacks).toEqual([{ state: 'opaque-state', code: 'one-time-code', providerError: null }]);
  });

  it.each([
    '?state=one&state=two&code=code',
    '?state=one&code=code&error=denied',
    '?code=code',
    '?state=one',
  ])('rejects ambiguous callback parameters: %s', async (query) => {
    const redirectUri = await unusedRedirectUri();
    let called = false;
    const listener = new LoopbackCallbackServer({
      redirectUri,
      handler() {
        called = true;
        return Promise.resolve();
      },
    });
    listeners.push(listener);
    await listener.ensureListening(new AbortController().signal);
    const response = await fetch(`${redirectUri}${query}`);
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });
});

function unusedRedirectUri(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a loopback test port.'));
        return;
      }
      server.close((error) => {
        if (error === undefined) resolve(`http://127.0.0.1:${String(address.port)}/oauth/callback`);
        else reject(error);
      });
    });
  });
}
