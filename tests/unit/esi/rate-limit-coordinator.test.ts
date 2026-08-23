import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../src/application/ports/clock.js';
import type { Delay } from '../../../src/application/ports/delay.js';
import { InMemoryEsiRateLimitCoordinator } from '../../../src/infrastructure/esi/rate-limit-coordinator.js';

const signal = new AbortController().signal;
const policy = Object.freeze({ group: 'test-group', 'max-tokens': 20, 'window-size': '1m' });

describe('InMemoryEsiRateLimitCoordinator', () => {
  it('reserves conservatively and delays before exceeding a descriptor bucket', async () => {
    const clock = new MutableClock();
    const delay = new AdvancingDelay(clock);
    const coordinator = new InMemoryEsiRateLimitCoordinator({ clock, delay });
    for (let index = 0; index < 7; index += 1) {
      const lease = await coordinator.acquire({
        operationId: 'GetStatus',
        policy,
        characterId: null,
        signal,
      });
      coordinator.observe(lease, new Response('{}', { status: 200 }));
    }
    expect(delay.waits).toEqual([60_000]);
    expect(coordinator.snapshot()).toMatchObject({
      delayedRequests: 1,
      totalDelayMs: 60_000,
      groups: [{
        group: 'test-group',
        delayedRequests: 1,
        totalDelayMs: 60_000,
      }],
    });
  });

  it('honors Retry-After and the legacy global error budget across groups', async () => {
    const clock = new MutableClock();
    const delay = new AdvancingDelay(clock);
    const coordinator = new InMemoryEsiRateLimitCoordinator({ clock, delay });
    const limited = await coordinator.acquire({
      operationId: 'GetStatus', policy, characterId: 42, signal,
    });
    coordinator.observe(limited, new Response('{}', {
      status: 429,
      headers: { 'retry-after': '3' },
    }));
    await coordinator.acquire({ operationId: 'GetStatus', policy, characterId: 42, signal });
    expect(delay.waits).toEqual([3_000]);

    const errorBudget = await coordinator.acquire({
      operationId: 'GetUniverseSystems', policy: null, characterId: null, signal,
    });
    coordinator.observe(errorBudget, new Response('{}', {
      status: 404,
      headers: {
        'x-esi-error-limit-remain': '10',
        'x-esi-error-limit-reset': '7',
      },
    }));
    await coordinator.acquire({
      operationId: 'GetMarketsPrices', policy: null, characterId: 99, signal,
    });
    expect(delay.waits).toEqual([3_000, 7_000]);
  });

  it('learns valid response bucket headers and ignores malformed values safely', async () => {
    const clock = new MutableClock();
    const delay = new AdvancingDelay(clock);
    const coordinator = new InMemoryEsiRateLimitCoordinator({ clock, delay });
    const learned = await coordinator.acquire({
      operationId: 'GetMarketsRegionIdOrders', policy: null, characterId: 7, signal,
    });
    coordinator.observe(learned, new Response('{}', {
      status: 200,
      headers: {
        'x-ratelimit-group': 'market-order',
        'x-ratelimit-limit': '150/15m',
        'x-ratelimit-remaining': 'not-a-number',
        'x-esi-error-limit-remain': '-1',
      },
    }));
    const next = await coordinator.acquire({
      operationId: 'GetMarketsRegionIdOrders', policy: null, characterId: 7, signal,
    });
    expect(next.bucketKey).toBe('market-order:character:7');
    expect(delay.waits).toEqual([]);
  });
});

class MutableClock implements Clock {
  #time = Date.parse('2026-08-20T10:00:00.000Z');
  now(): Date { return new Date(this.#time); }
  advance(milliseconds: number): void { this.#time += milliseconds; }
}

class AdvancingDelay implements Delay {
  readonly waits: number[] = [];
  readonly #clock: MutableClock;
  constructor(clock: MutableClock) { this.#clock = clock; }
  wait(milliseconds: number, _signal: AbortSignal): Promise<void> {
    this.waits.push(milliseconds);
    this.#clock.advance(milliseconds);
    return Promise.resolve();
  }
}
