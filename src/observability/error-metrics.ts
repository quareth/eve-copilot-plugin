import type { Clock } from '../application/ports/clock.js';
import { AppError } from '../domain/errors.js';

export interface ErrorCategoryMetric {
  readonly code: string;
  readonly count: number;
  readonly last_seen_at: string;
}

export class ErrorMetrics {
  readonly #clock: Clock;
  readonly #categories = new Map<string, { count: number; lastSeenAt: string }>();

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  record(error: unknown): void {
    const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
    const current = this.#categories.get(code);
    this.#categories.set(code, {
      count: (current?.count ?? 0) + 1,
      lastSeenAt: this.#clock.now().toISOString(),
    });
    if (this.#categories.size > 50) {
      const oldest = [...this.#categories.entries()]
        .sort((left, right) => left[1].lastSeenAt.localeCompare(right[1].lastSeenAt))[0];
      if (oldest !== undefined) this.#categories.delete(oldest[0]);
    }
  }

  snapshot(limit = 20): readonly ErrorCategoryMetric[] {
    return Object.freeze([...this.#categories.entries()]
      .sort((left, right) => right[1].lastSeenAt.localeCompare(left[1].lastSeenAt)
        || left[0].localeCompare(right[0]))
      .slice(0, Math.max(0, Math.min(limit, 20)))
      .map(([code, value]) => Object.freeze({
        code,
        count: value.count,
        last_seen_at: value.lastSeenAt,
      })));
  }
}
