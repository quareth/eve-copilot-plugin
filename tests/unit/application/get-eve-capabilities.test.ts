import { describe, expect, it } from 'vitest';
import { GetEveCapabilities } from '../../../src/application/services/get-eve-capabilities.js';
import { NoCharacterContext } from '../../../src/application/ports/character-context.js';
import { buildCapabilityRegistry } from '../../../src/capabilities/registry.js';
import { FixedClock } from '../../helpers/fakes.js';
import { Base64UrlCursorCodec } from '../../../src/platform/base64url-cursor-codec.js';

const signal = new AbortController().signal;

describe('GetEveCapabilities', () => {
  const service = new GetEveCapabilities({
    clock: new FixedClock(),
    registry: buildCapabilityRegistry(),
    characterContext: new NoCharacterContext(),
    cursorCodec: new Base64UrlCursorCodec(),
  });

  it('reports honest capability availability and character state', async () => {
    const result = await service.execute({ include_operations: true, limit: 100 }, {
      requestId: 'request-1',
      signal,
    });
    expect(result.data.connection).toEqual({
      status: 'not_supported_yet',
      active_character: null,
      pending_connections: 0,
    });
    expect(result.data.summary.available).toBe(66);
    expect(result.data.summary.planned).toBe(0);
    expect(result.data.capabilities.filter((entry) => entry.implementation === 'planned')).toEqual([]);
  });

  it('filters and paginates with a filter-bound cursor', async () => {
    const first = await service.execute({
      domain: 'foundation',
      include_operations: true,
      limit: 2,
    }, { requestId: 'request-1', signal });
    expect(first.data.capabilities).toHaveLength(2);
    expect(first.data.summary.available).toBe(7);
    expect(first.data.next_cursor).not.toBeNull();
    const cursor = first.data.next_cursor;
    if (cursor === null) throw new Error('Expected a continuation cursor.');

    const second = await service.execute({
      domain: 'foundation',
      include_operations: true,
      limit: 2,
      cursor,
    }, { requestId: 'request-2', signal });
    expect(second.data.capabilities).toHaveLength(2);
    expect(second.data.next_cursor).not.toBeNull();

    await expect(service.execute({
      domain: 'skills',
      include_operations: true,
      limit: 2,
      cursor,
    }, { requestId: 'request-3', signal })).rejects.toMatchObject({ code: 'AMBIGUOUS_INPUT' });
  });

  it('omits operation details when requested', async () => {
    const result = await service.execute({ domain: 'skills', include_operations: false, limit: 100 }, {
      requestId: 'request-1',
      signal,
    });
    for (const capability of result.data.capabilities) {
      expect(capability.semantic_tools).toEqual([]);
      expect(capability.authorization.required_scopes).toEqual([]);
      expect(capability.authorization.missing_scopes).toEqual([]);
    }
  });

  it('honors cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(service.execute({ include_operations: true, limit: 100 }, {
      requestId: 'request-1',
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
