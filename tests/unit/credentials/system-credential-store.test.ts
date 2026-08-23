import { describe, expect, it } from 'vitest';
import {
  DisabledCredentialStore,
  SystemCredentialStore,
} from '../../../src/infrastructure/credentials/system-credential-store.js';
import { FixedIdGenerator } from '../../helpers/fakes.js';

class FakeEntry {
  static readonly values = new Map<string, string>();
  static maximumPasswordLength: number | null = null;
  static failOnSetCall: number | null = null;
  static setCalls = 0;
  readonly #key: string;

  constructor(service: string, username: string) {
    this.#key = `${service}:${username}`;
  }

  setPassword(password: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) return Promise.reject(new Error('aborted'));
    FakeEntry.setCalls += 1;
    if (FakeEntry.setCalls === FakeEntry.failOnSetCall) {
      return Promise.reject(new Error('synthetic set failure'));
    }
    if (FakeEntry.maximumPasswordLength !== null
      && password.length > FakeEntry.maximumPasswordLength) {
      return Promise.reject(new Error('password too long'));
    }
    FakeEntry.values.set(this.#key, password);
    return Promise.resolve();
  }

  getPassword(signal?: AbortSignal): Promise<string | undefined> {
    if (signal?.aborted === true) return Promise.reject(new Error('aborted'));
    return Promise.resolve(FakeEntry.values.get(this.#key));
  }

  deleteCredential(signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted === true) return Promise.reject(new Error('aborted'));
    return Promise.resolve(FakeEntry.values.delete(this.#key));
  }
}

describe('SystemCredentialStore', () => {
  it('creates, validates, replaces, and deletes a typed protected bundle', async () => {
    resetFakeEntry();
    const store = new SystemCredentialStore({
      installationId: '00000000-0000-4000-8000-000000000001',
      idGenerator: new FixedIdGenerator('00000000-0000-4000-8000-000000000002'),
      moduleLoader: () => Promise.resolve({ AsyncEntry: FakeEntry }),
    });
    const signal = new AbortController().signal;
    const reference = await store.create('pkce_verifier', 'synthetic-secret', signal);
    expect(reference).toBe('00000000-0000-4000-8000-000000000002');
    expect(await store.read(reference, 'pkce_verifier', signal)).toBe('synthetic-secret');
    await store.replace(reference, 'pkce_verifier', 'synthetic-replacement', signal);
    expect(await store.read(reference, 'pkce_verifier', signal)).toBe('synthetic-replacement');
    await expect(store.read(reference, 'character_grant', signal)).rejects.toMatchObject({
      code: 'CREDENTIAL_STORE_UNAVAILABLE',
    });
    expect(await store.delete(reference, 'pkce_verifier', signal)).toBe('deleted');
    expect(await store.delete(reference, 'pkce_verifier', signal)).toBe('absent');
  });

  it('stores a large grant in bounded chunks across its full lifecycle', async () => {
    resetFakeEntry();
    FakeEntry.maximumPasswordLength = 1_000;
    const store = new SystemCredentialStore({
      installationId: '00000000-0000-4000-8000-000000000001',
      idGenerator: new FixedIdGenerator('00000000-0000-4000-8000-000000000002'),
      moduleLoader: () => Promise.resolve({ AsyncEntry: FakeEntry }),
    });
    const signal = new AbortController().signal;
    const original = 'x'.repeat(8_000);
    const replacement = 'y'.repeat(8_000);

    const reference = await store.create('character_grant', original, signal);
    expect(FakeEntry.values.size).toBeGreaterThan(1);
    expect([...FakeEntry.values.values()].every((value) => value.length <= 1_000)).toBe(true);
    expect(await store.read(reference, 'character_grant', signal)).toBe(original);

    await store.replace(reference, 'character_grant', replacement, signal);
    expect([...FakeEntry.values.values()].every((value) => value.length <= 1_000)).toBe(true);
    expect(await store.read(reference, 'character_grant', signal)).toBe(replacement);

    expect(await store.delete(reference, 'character_grant', signal)).toBe('deleted');
    expect(FakeEntry.values.size).toBe(0);
  });

  it('removes chunks when creation fails partway through', async () => {
    resetFakeEntry();
    FakeEntry.maximumPasswordLength = 1_000;
    FakeEntry.failOnSetCall = 2;
    const store = new SystemCredentialStore({
      installationId: '00000000-0000-4000-8000-000000000001',
      idGenerator: new FixedIdGenerator('00000000-0000-4000-8000-000000000002'),
      moduleLoader: () => Promise.resolve({ AsyncEntry: FakeEntry }),
    });

    await expect(store.create(
      'character_grant',
      'x'.repeat(8_000),
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'CREDENTIAL_STORE_UNAVAILABLE' });
    expect(FakeEntry.values.size).toBe(0);
  });

  it('fails closed when the adapter is disabled', async () => {
    const store = new DisabledCredentialStore();
    const signal = new AbortController().signal;
    await expect(store.probe(signal)).resolves.toBe('unavailable');
    await expect(store.create('character_grant', 'secret', signal)).rejects.toMatchObject({
      code: 'CREDENTIAL_STORE_UNAVAILABLE',
    });
  });
});

function resetFakeEntry(): void {
  FakeEntry.values.clear();
  FakeEntry.maximumPasswordLength = null;
  FakeEntry.failOnSetCall = null;
  FakeEntry.setCalls = 0;
}
