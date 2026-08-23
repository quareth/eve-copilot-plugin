import type { Clock } from '../../application/ports/clock.js';
import type { Delay } from '../../application/ports/delay.js';
import type {
  EsiRateLimitCoordinator,
  EsiRateLimitLease,
  EsiRateLimitSnapshot,
} from '../../application/ports/rate-limit-coordinator.js';
import { throwIfAborted } from '../../domain/errors.js';
import type { JsonValue } from '../../domain/json.js';

const RESERVED_COST = 5;

interface RatePolicy {
  readonly group: string;
  readonly maximumTokens: number;
  readonly windowMs: number;
}

interface TokenEvent {
  readonly leaseId: number;
  cost: number;
  readonly expiresAt: number;
}

interface Bucket {
  policy: RatePolicy;
  readonly events: TokenEvent[];
  blockedUntil: number;
}

interface GroupDelayTotals {
  delayedRequests: number;
  totalDelayMs: number;
}

export class InMemoryEsiRateLimitCoordinator implements EsiRateLimitCoordinator {
  readonly #clock: Clock;
  readonly #delay: Delay;
  readonly #policies = new Map<string, RatePolicy>();
  readonly #buckets = new Map<string, Bucket>();
  readonly #leases = new Map<number, { readonly bucketKey: string | null; readonly event: TokenEvent | null }>();
  #nextLeaseId = 1;
  #globalBlockedUntil = 0;
  #delayedRequests = 0;
  #totalDelayMs = 0;
  readonly #groupDelays = new Map<string, GroupDelayTotals>();

  constructor(input: { readonly clock: Clock; readonly delay: Delay }) {
    this.#clock = input.clock;
    this.#delay = input.delay;
  }

  async acquire(input: {
    readonly operationId: string;
    readonly policy: JsonValue;
    readonly characterId: number | null;
    readonly signal: AbortSignal;
  }): Promise<EsiRateLimitLease> {
    throwIfAborted(input.signal);
    const descriptorPolicy = parseDescriptorPolicy(input.policy);
    if (descriptorPolicy !== null) this.#policies.set(input.operationId, descriptorPolicy);
    const policy = descriptorPolicy ?? this.#policies.get(input.operationId) ?? null;
    const identityKey = input.characterId === null ? 'public' : `character:${String(input.characterId)}`;
    const bucketKey = policy === null ? null : `${policy.group}:${identityKey}`;
    const now = this.#clock.now().getTime();
    let waitMs = Math.max(this.#globalBlockedUntil - now, 0);
    let bucket: Bucket | null = null;
    if (bucketKey !== null && policy !== null) {
      bucket = this.#bucket(bucketKey, policy);
      prune(bucket, now);
      waitMs = Math.max(waitMs, bucket.blockedUntil - now, requiredWait(bucket, now));
    }
    if (waitMs > 0) {
      this.#delayedRequests += 1;
      this.#totalDelayMs += waitMs;
      if (policy !== null) {
        const totals = this.#groupDelays.get(policy.group) ?? { delayedRequests: 0, totalDelayMs: 0 };
        totals.delayedRequests += 1;
        totals.totalDelayMs += waitMs;
        this.#groupDelays.set(policy.group, totals);
      }
      await this.#delay.wait(Math.min(waitMs, 300_000), input.signal);
      throwIfAborted(input.signal);
      if (bucket !== null) prune(bucket, this.#clock.now().getTime());
    }
    const leaseId = this.#nextLeaseId;
    this.#nextLeaseId += 1;
    const reservedAt = this.#clock.now().getTime();
    const event = bucket === null ? null : {
      leaseId,
      cost: RESERVED_COST,
      expiresAt: reservedAt + bucket.policy.windowMs,
    };
    if (event !== null && bucket !== null) bucket.events.push(event);
    this.#leases.set(leaseId, { bucketKey, event });
    return Object.freeze({ id: leaseId, operationId: input.operationId, identityKey, bucketKey });
  }

  observe(lease: EsiRateLimitLease, response: Response): void {
    const now = this.#clock.now().getTime();
    const learnedPolicy = parseHeadersPolicy(response.headers);
    if (learnedPolicy !== null) this.#policies.set(lease.operationId, learnedPolicy);
    const state = this.#leases.get(lease.id);
    this.#leases.delete(lease.id);
    const actualCost = responseCost(response.status);
    if (state?.event !== null && state?.event !== undefined) state.event.cost = actualCost;
    if ((state?.event === null || state === undefined) && learnedPolicy !== null && actualCost > 0) {
      const key = `${learnedPolicy.group}:${lease.identityKey}`;
      this.#bucket(key, learnedPolicy).events.push({
        leaseId: lease.id,
        cost: actualCost,
        expiresAt: now + learnedPolicy.windowMs,
      });
    }
    const retryAfter = retryAfterMs(response.headers, now);
    if (response.status === 420) this.#globalBlockedUntil = Math.max(this.#globalBlockedUntil, now + retryAfter);
    if (response.status === 429) {
      const key = state?.bucketKey
        ?? (learnedPolicy === null ? null : `${learnedPolicy.group}:${lease.identityKey}`);
      if (key !== null) {
        const policy = learnedPolicy ?? this.#policies.get(lease.operationId);
        if (policy !== undefined) this.#bucket(key, policy).blockedUntil = Math.max(
          this.#bucket(key, policy).blockedUntil,
          now + retryAfter,
        );
      }
    }
    const errorRemaining = boundedInteger(response.headers.get('x-esi-error-limit-remain'), 0, 100);
    const errorResetSeconds = boundedInteger(response.headers.get('x-esi-error-limit-reset'), 0, 300);
    if (errorRemaining !== null && errorRemaining <= 10 && errorResetSeconds !== null) {
      this.#globalBlockedUntil = Math.max(this.#globalBlockedUntil, now + errorResetSeconds * 1_000);
    }
  }

  snapshot(): EsiRateLimitSnapshot {
    const now = this.#clock.now().getTime();
    for (const bucket of this.#buckets.values()) prune(bucket, now);
    const groups = new Map<string, {
      activeBuckets: number;
      reservedTokens: number;
      blockedUntil: number;
    }>();
    for (const bucket of this.#buckets.values()) {
      const active = bucket.events.length > 0 || bucket.blockedUntil > now;
      const current = groups.get(bucket.policy.group) ?? {
        activeBuckets: 0,
        reservedTokens: 0,
        blockedUntil: 0,
      };
      if (active) current.activeBuckets += 1;
      current.reservedTokens += bucket.events.reduce((sum, event) => sum + event.cost, 0);
      current.blockedUntil = Math.max(current.blockedUntil, bucket.blockedUntil);
      groups.set(bucket.policy.group, current);
    }
    for (const group of this.#groupDelays.keys()) {
      if (!groups.has(group)) groups.set(group, { activeBuckets: 0, reservedTokens: 0, blockedUntil: 0 });
    }
    return Object.freeze({
      delayedRequests: this.#delayedRequests,
      totalDelayMs: this.#totalDelayMs,
      activeBuckets: [...this.#buckets.values()].filter((bucket) => bucket.events.length > 0 || bucket.blockedUntil > now).length,
      globallyBlockedUntil: this.#globalBlockedUntil > now
        ? new Date(this.#globalBlockedUntil).toISOString()
        : null,
      groups: Object.freeze([...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([group, aggregate]) => {
          const delays = this.#groupDelays.get(group) ?? { delayedRequests: 0, totalDelayMs: 0 };
          return Object.freeze({
            group,
            activeBuckets: aggregate.activeBuckets,
            reservedTokens: aggregate.reservedTokens,
            delayedRequests: delays.delayedRequests,
            totalDelayMs: delays.totalDelayMs,
            blockedUntil: aggregate.blockedUntil > now
              ? new Date(aggregate.blockedUntil).toISOString()
              : null,
          });
        })),
    });
  }

  #bucket(key: string, policy: RatePolicy): Bucket {
    const existing = this.#buckets.get(key);
    if (existing !== undefined) {
      existing.policy = policy;
      return existing;
    }
    const created: Bucket = { policy, events: [], blockedUntil: 0 };
    this.#buckets.set(key, created);
    return created;
  }
}

function requiredWait(bucket: Bucket, now: number): number {
  const safetyReserve = Math.max(RESERVED_COST, Math.ceil(bucket.policy.maximumTokens * 0.02));
  let used = bucket.events.reduce((sum, event) => sum + event.cost, 0);
  if (used + RESERVED_COST <= bucket.policy.maximumTokens - safetyReserve) return 0;
  for (const event of [...bucket.events].sort((left, right) => left.expiresAt - right.expiresAt)) {
    used -= event.cost;
    if (used + RESERVED_COST <= bucket.policy.maximumTokens - safetyReserve) {
      return Math.max(event.expiresAt - now, 0);
    }
  }
  return bucket.policy.windowMs;
}

function prune(bucket: Bucket, now: number): void {
  let remove = 0;
  while (remove < bucket.events.length && (bucket.events[remove]?.expiresAt ?? Infinity) <= now) remove += 1;
  if (remove > 0) bucket.events.splice(0, remove);
  if (bucket.blockedUntil <= now) bucket.blockedUntil = 0;
}

function parseDescriptorPolicy(value: JsonValue): RatePolicy | null {
  if (!isObject(value)) return null;
  const group = value.group;
  const maximumTokens = value['max-tokens'];
  const windowSize = value['window-size'];
  if (typeof group !== 'string' || !/^[a-z0-9_-]{1,64}$/iu.test(group)
    || typeof maximumTokens !== 'number' || !Number.isSafeInteger(maximumTokens) || maximumTokens < 10
    || typeof windowSize !== 'string') return null;
  const windowMs = parseWindow(windowSize);
  return windowMs === null ? null : Object.freeze({ group, maximumTokens, windowMs });
}

function parseHeadersPolicy(headers: Headers): RatePolicy | null {
  const group = headers.get('x-ratelimit-group');
  const limit = headers.get('x-ratelimit-limit');
  const match = limit === null ? null : /^([1-9][0-9]{0,8})\/([1-9][0-9]{0,5}[mh])$/u.exec(limit);
  if (group === null || !/^[a-z0-9_-]{1,64}$/iu.test(group) || match === null) return null;
  const maximumTokens = Number(match[1]);
  const windowMs = parseWindow(match[2] ?? '');
  return windowMs === null ? null : Object.freeze({ group, maximumTokens, windowMs });
}

function parseWindow(value: string): number | null {
  const match = /^([1-9][0-9]{0,5})([mh])$/u.exec(value);
  if (match === null) return null;
  const amount = Number(match[1]);
  return amount * (match[2] === 'h' ? 3_600_000 : 60_000);
}

function responseCost(status: number): number {
  if (status === 429 || status >= 500) return 0;
  if (status >= 400) return 5;
  if (status >= 300) return 1;
  if (status >= 200) return 2;
  return RESERVED_COST;
}

function retryAfterMs(headers: Headers, now: number): number {
  const raw = headers.get('retry-after');
  if (raw === null) return 1_000;
  if (/^[0-9]{1,6}$/u.test(raw)) return Math.min(Number(raw) * 1_000, 300_000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.min(Math.max(date - now, 0), 300_000) : 1_000;
}

function boundedInteger(value: string | null, minimum: number, maximum: number): number | null {
  if (value === null || !/^[0-9]{1,9}$/u.test(value)) return null;
  const parsed = Number(value);
  return parsed >= minimum && parsed <= maximum ? parsed : null;
}

function isObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
