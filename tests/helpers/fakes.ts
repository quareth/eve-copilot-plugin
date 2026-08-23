import type { Clock } from '../../src/application/ports/clock.js';
import type { IdGenerator } from '../../src/application/ports/id-generator.js';

export class FixedClock implements Clock {
  readonly #date: Date;

  constructor(value = '2026-08-20T10:00:00.000Z') {
    this.#date = new Date(value);
  }

  now(): Date {
    return new Date(this.#date);
  }
}

export class FixedIdGenerator implements IdGenerator {
  readonly #value: string;

  constructor(value = '00000000-0000-4000-8000-000000000001') {
    this.#value = value;
  }

  next(): string {
    return this.#value;
  }
}
