import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ContinuationTokenCodec } from '../application/ports/continuation-token-codec.js';
import { AppError } from '../domain/errors.js';

export class HmacContinuationTokenCodec implements ContinuationTokenCodec {
  readonly #key: Uint8Array;

  constructor(secret: string) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(secret)) throw new TypeError('Continuation secret is invalid.');
    this.#key = Buffer.from(secret, 'base64url');
  }

  encode(continuationId: string): string {
    const payload = Buffer.from(continuationId, 'utf8').toString('base64url');
    return `${payload}.${this.#signature(payload)}`;
  }

  decode(token: string): string {
    if (!/^[A-Za-z0-9_-]{1,256}\.[A-Za-z0-9_-]{43}$/u.test(token)) throw invalidContinuation();
    const [payload, supplied] = token.split('.');
    if (payload === undefined || supplied === undefined) throw invalidContinuation();
    const expected = Buffer.from(this.#signature(payload), 'base64url');
    const actual = Buffer.from(supplied, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalidContinuation();
    const continuationId = Buffer.from(payload, 'base64url').toString('utf8');
    if (!/^[A-Za-z0-9-]{1,128}$/u.test(continuationId)) throw invalidContinuation();
    return continuationId;
  }

  #signature(payload: string): string {
    return createHmac('sha256', this.#key).update(payload).digest('base64url');
  }
}

function invalidContinuation(): AppError {
  return new AppError({
    code: 'INVALID_CONTINUATION',
    safeMessage: 'The EVE continuation token is invalid.',
    details: { next_step: 'Start the capability call again without a continuation token.' },
  });
}
