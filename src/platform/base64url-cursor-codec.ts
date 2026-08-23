import { Buffer } from 'node:buffer';
import type { CursorCodec } from '../application/ports/cursor-codec.js';

export class Base64UrlCursorCodec implements CursorCodec {
  encode(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  decode(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }
}
