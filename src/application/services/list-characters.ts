import type { CharacterSummary } from '../dto/identity.js';
import { toCharacterSummary } from '../dto/identity.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { CursorCodec } from '../ports/cursor-codec.js';
import { localResult, type ResultEnvelope } from '../../domain/result.js';
import type { RequestContext } from './use-case.js';

export interface ListCharactersData {
  readonly characters: readonly CharacterSummary[];
  readonly next_cursor: string | null;
}

export class ListCharacters {
  readonly #clock: Clock;
  readonly #characters: CharacterRepository;
  readonly #cursorCodec: CursorCodec;

  constructor(input: {
    readonly clock: Clock;
    readonly characters: CharacterRepository;
    readonly cursorCodec: CursorCodec;
  }) {
    this.#clock = input.clock;
    this.#characters = input.characters;
    this.#cursorCodec = input.cursorCodec;
  }

  execute(
    input: { readonly limit: number; readonly cursor?: string },
    context: RequestContext,
  ): Promise<ResultEnvelope<ListCharactersData>> {
    const all = this.#characters.list();
    const offset = input.cursor === undefined ? 0 : decodeCursor(input.cursor, this.#cursorCodec);
    const page = all.slice(offset, offset + input.limit).map(toCharacterSummary);
    const next = offset + page.length;
    return Promise.resolve(localResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      data: Object.freeze({
        characters: Object.freeze(page),
        next_cursor: next < all.length ? encodeCursor(next, this.#cursorCodec) : null,
      }),
    }));
  }
}

function encodeCursor(offset: number, codec: CursorCodec): string {
  return codec.encode(JSON.stringify({ v: 1, offset }));
}

function decodeCursor(value: string, codec: CursorCodec): number {
  try {
    const parsed = JSON.parse(codec.decode(value)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid');
    const offset = (parsed as { readonly v?: unknown; readonly offset?: unknown }).offset;
    const version = (parsed as { readonly v?: unknown }).v;
    if (version !== 1 || !Number.isSafeInteger(offset) || (offset as number) < 0) throw new Error('invalid');
    return offset as number;
  } catch {
    throw new TypeError('The character-list cursor is invalid.');
  }
}
