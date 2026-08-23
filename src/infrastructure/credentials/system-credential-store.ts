import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  CredentialStore,
  CredentialStoreState,
  SecretKind,
} from '../../application/ports/credential-store.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';

const secretBundleSchema = z.object({
  version: z.literal(1),
  kind: z.enum(['character_grant', 'pkce_verifier', 'audit_hmac_key']),
  value: z.string().min(1).max(131_072),
}).strict();

const chunkManifestSchema = z.object({
  version: z.literal(2),
  kind: z.enum(['character_grant', 'pkce_verifier', 'audit_hmac_key']),
  encoding: z.literal('base64url'),
  chunks: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
}).strict();

const storedCredentialSchema = z.discriminatedUnion('version', [
  secretBundleSchema,
  chunkManifestSchema,
]);

type ChunkManifest = z.infer<typeof chunkManifestSchema>;
type StoredCredential = z.infer<typeof storedCredentialSchema>;

const SINGLE_ENTRY_UTF16_BYTES = 2_048;
const CHUNK_CHARACTERS = 1_000;

interface AsyncEntryLike {
  setPassword(password: string, signal?: AbortSignal): Promise<void>;
  getPassword(signal?: AbortSignal): Promise<string | undefined>;
  deleteCredential(signal?: AbortSignal): Promise<boolean>;
}

interface KeyringModule {
  readonly AsyncEntry: new (service: string, username: string) => AsyncEntryLike;
}

export class SystemCredentialStore implements CredentialStore {
  readonly #installationId: string;
  readonly #idGenerator: IdGenerator;
  readonly #service: string;
  readonly #moduleLoader: () => Promise<KeyringModule>;
  #modulePromise: Promise<KeyringModule> | null = null;

  constructor(input: {
    readonly installationId: string;
    readonly idGenerator: IdGenerator;
    readonly service?: string;
    readonly moduleLoader?: () => Promise<KeyringModule>;
  }) {
    this.#installationId = input.installationId;
    this.#idGenerator = input.idGenerator;
    this.#service = input.service ?? 'EVE Copilot MCP';
    this.#moduleLoader = input.moduleLoader
      ?? (() => import('@napi-rs/keyring'));
  }

  async probe(signal: AbortSignal): Promise<CredentialStoreState> {
    throwIfAborted(signal);
    if (!['darwin', 'win32', 'linux'].includes(process.platform)) return 'unavailable';
    try {
      await this.#module();
      throwIfAborted(signal);
      return 'available';
    } catch {
      return 'unavailable';
    }
  }

  async create(kind: SecretKind, value: string, signal: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    const reference = this.#idGenerator.next();
    try {
      await this.#write(reference, kind, value, signal);
      return reference;
    } catch (error) {
      throw credentialError('A protected credential could not be created.', error);
    }
  }

  async read(
    reference: string,
    expectedKind: SecretKind,
    signal: AbortSignal,
  ): Promise<string | null> {
    throwIfAborted(signal);
    try {
      const entry = await this.#entry(reference);
      const stored = await entry.getPassword(signal);
      if (stored === undefined) return null;
      const credential = parseStored(stored);
      if (credential.kind !== expectedKind) {
        throw new Error('Credential kind mismatch.');
      }
      if (credential.version === 1) return credential.value;
      return await this.#readChunks(reference, credential, signal);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw credentialError('A protected credential could not be read.', error);
    }
  }

  async replace(
    reference: string,
    expectedKind: SecretKind,
    value: string,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    try {
      const entry = await this.#entry(reference);
      const stored = await entry.getPassword(signal);
      if (stored === undefined) {
        throw new Error('Credential does not exist.');
      }
      const previous = parseStored(stored);
      if (previous.kind !== expectedKind) throw new Error('Credential kind mismatch.');
      await this.#write(reference, expectedKind, value, signal, previous);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw credentialError('A protected credential could not be replaced.', error);
    }
  }

  async delete(
    reference: string,
    expectedKind: SecretKind,
    signal: AbortSignal,
  ): Promise<'deleted' | 'absent'> {
    throwIfAborted(signal);
    try {
      const entry = await this.#entry(reference);
      const stored = await entry.getPassword(signal);
      if (stored === undefined) return 'absent';
      const credential = parseStored(stored);
      if (credential.kind !== expectedKind) throw new Error('Credential kind mismatch.');
      if (credential.version === 2) {
        await this.#deleteChunks(reference, credential, signal);
      }
      return await entry.deleteCredential(signal) ? 'deleted' : 'absent';
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw credentialError('A protected credential could not be deleted.', error);
    }
  }

  async #entry(reference: string): Promise<AsyncEntryLike> {
    assertReference(reference);
    const module = await this.#module();
    return new module.AsyncEntry(this.#service, `${this.#installationId}:${reference}`);
  }

  async #chunkEntry(reference: string, sha256: string, index: number): Promise<AsyncEntryLike> {
    assertReference(reference);
    const module = await this.#module();
    const account = `${this.#installationId}:${reference}:chunk:${sha256}:${String(index)}`;
    return new module.AsyncEntry(this.#service, account);
  }

  async #write(
    reference: string,
    kind: SecretKind,
    value: string,
    signal: AbortSignal,
    previous?: StoredCredential,
  ): Promise<void> {
    const serialized = serialize(kind, value);
    const root = await this.#entry(reference);
    if (Buffer.byteLength(serialized, 'utf16le') <= SINGLE_ENTRY_UTF16_BYTES) {
      await root.setPassword(serialized, signal);
      if (previous?.version === 2) await this.#deleteChunks(reference, previous, signal);
      return;
    }

    const encoded = Buffer.from(serialized, 'utf8').toString('base64url');
    const digest = sha256(encoded);
    const chunks = splitChunks(encoded);
    const manifest: ChunkManifest = chunkManifestSchema.parse({
      version: 2,
      kind,
      encoding: 'base64url',
      chunks: chunks.length,
      sha256: digest,
    });

    if (previous?.version === 2 && previous.sha256 === digest) {
      await root.setPassword(JSON.stringify(manifest), signal);
      return;
    }

    const written: AsyncEntryLike[] = [];
    try {
      for (const [index, chunk] of chunks.entries()) {
        const entry = await this.#chunkEntry(reference, digest, index);
        await entry.setPassword(chunk, signal);
        written.push(entry);
      }
      await root.setPassword(JSON.stringify(manifest), signal);
    } catch (error) {
      await Promise.allSettled(written.map((entry) => entry.deleteCredential()));
      throw error;
    }

    if (previous?.version === 2) await this.#deleteChunks(reference, previous, signal);
  }

  async #readChunks(
    reference: string,
    manifest: ChunkManifest,
    signal: AbortSignal,
  ): Promise<string> {
    const chunks: string[] = [];
    for (let index = 0; index < manifest.chunks; index += 1) {
      const entry = await this.#chunkEntry(reference, manifest.sha256, index);
      const chunk = await entry.getPassword(signal);
      if (chunk === undefined) throw new Error('Credential chunk is missing.');
      chunks.push(chunk);
    }
    const encoded = chunks.join('');
    if (sha256(encoded) !== manifest.sha256) throw new Error('Credential chunk digest mismatch.');
    const bundle = parseBundle(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (bundle.kind !== manifest.kind) throw new Error('Credential kind mismatch.');
    return bundle.value;
  }

  async #deleteChunks(
    reference: string,
    manifest: ChunkManifest,
    signal: AbortSignal,
  ): Promise<void> {
    for (let index = 0; index < manifest.chunks; index += 1) {
      const entry = await this.#chunkEntry(reference, manifest.sha256, index);
      await entry.deleteCredential(signal);
    }
  }

  #module(): Promise<KeyringModule> {
    this.#modulePromise ??= this.#moduleLoader();
    return this.#modulePromise;
  }
}

export class DisabledCredentialStore implements CredentialStore {
  probe(signal: AbortSignal): Promise<CredentialStoreState> {
    throwIfAborted(signal);
    return Promise.resolve('unavailable');
  }

  create(_kind: SecretKind, _value: string, _signal: AbortSignal): Promise<string> {
    return Promise.reject(unavailable());
  }

  read(_reference: string, _expectedKind: SecretKind, _signal: AbortSignal): Promise<string | null> {
    return Promise.reject(unavailable());
  }

  replace(
    _reference: string,
    _expectedKind: SecretKind,
    _value: string,
    _signal: AbortSignal,
  ): Promise<void> {
    return Promise.reject(unavailable());
  }

  delete(
    _reference: string,
    _expectedKind: SecretKind,
    _signal: AbortSignal,
  ): Promise<'deleted' | 'absent'> {
    return Promise.reject(unavailable());
  }
}

function serialize(kind: SecretKind, value: string): string {
  return JSON.stringify(secretBundleSchema.parse({ version: 1, kind, value }));
}

function parseStored(value: string): StoredCredential {
  return storedCredentialSchema.parse(JSON.parse(value) as unknown);
}

function parseBundle(value: string): z.infer<typeof secretBundleSchema> {
  return secretBundleSchema.parse(JSON.parse(value) as unknown);
}

function splitChunks(value: string): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += CHUNK_CHARACTERS) {
    chunks.push(value.slice(offset, offset + CHUNK_CHARACTERS));
  }
  return chunks;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertReference(reference: string): void {
  if (!/^[0-9a-f-]{36}$/iu.test(reference)) throw new Error('Credential reference is invalid.');
}

function credentialError(message: string, cause: unknown): AppError {
  return new AppError({
    code: 'CREDENTIAL_STORE_UNAVAILABLE',
    safeMessage: message,
    details: { next_step: 'Unlock or configure a supported operating-system credential store.' },
    cause,
  });
}

function unavailable(): AppError {
  return credentialError('Protected credential storage is disabled or unavailable.', undefined);
}
