import { createHash, timingSafeEqual } from 'node:crypto';
import type { OAuthStateHasher } from '../application/ports/oauth-state-hasher.js';

export class Sha256OAuthStateHasher implements OAuthStateHasher {
  digest(state: string): Uint8Array {
    return createHash('sha256').update(state, 'utf8').digest();
  }

  matches(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength
      && timingSafeEqual(Buffer.from(left), Buffer.from(right));
  }
}
