import { createHash, timingSafeEqual } from 'node:crypto';
import type { Digest } from '../application/ports/digest.js';

export class Sha256Digest implements Digest {
  hex(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  matches(value: string, expectedHex: string): boolean {
    if (!/^[a-f0-9]{64}$/u.test(expectedHex)) return false;
    const actual = Buffer.from(this.hex(value), 'hex');
    const expected = Buffer.from(expectedHex, 'hex');
    return timingSafeEqual(actual, expected);
  }
}
