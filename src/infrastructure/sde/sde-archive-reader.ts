import { open } from 'node:fs/promises';
import { Reader, type Entry } from '@zip.js/zip.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';

const MAX_ENTRY_BYTES = 2_147_483_648;
const MAX_LINE_BYTES = 16_777_216;

export class FileRangeReader extends Reader<string> {
  readonly #path: string;
  #handle: Awaited<ReturnType<typeof open>> | null = null;

  constructor(path: string) {
    super(path);
    this.#path = path;
  }

  override async init(): Promise<void> {
    this.#handle = await open(this.#path, 'r');
    this.size = (await this.#handle.stat()).size;
  }

  override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (this.#handle === null) throw new Error('SDE archive reader is not initialized.');
    const buffer = Buffer.allocUnsafe(Math.min(length, this.size - index));
    const result = await this.#handle.read(buffer, 0, buffer.byteLength, index);
    return Uint8Array.from(buffer.subarray(0, result.bytesRead));
  }

  async close(): Promise<void> {
    await this.#handle?.close();
    this.#handle = null;
  }
}

export async function importJsonLines(
  entry: Exclude<Entry, { directory: true }>,
  accept: (value: unknown) => void,
  signal: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  let pendingBytes = 0;
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      throwIfAborted(signal);
      pendingBytes += chunk.byteLength;
      if (pendingBytes > MAX_LINE_BYTES && !chunk.includes(10)) throw sdeContract('An SDE JSONL row exceeds the safety limit.');
      pending += decoder.decode(chunk, { stream: true });
      let newline = pending.indexOf('\n');
      while (newline >= 0) {
        const line = pending.slice(0, newline).trimEnd();
        pending = pending.slice(newline + 1);
        pendingBytes = Buffer.byteLength(pending);
        if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw sdeContract('An SDE JSONL row exceeds the safety limit.');
        if (line.length > 0) parseLine(line, accept);
        newline = pending.indexOf('\n');
      }
    },
    close() {
      pending += decoder.decode();
      if (Buffer.byteLength(pending) > MAX_LINE_BYTES) throw sdeContract('An SDE JSONL row exceeds the safety limit.');
      if (pending.trim().length > 0) parseLine(pending, accept);
    },
  });
  await entry.getData(writable, { signal, checkSignature: true });
}

export function assertSafeEntry(entry: Entry): void {
  if (entry.filename.startsWith('/') || entry.filename.includes('\\')
    || entry.filename.split('/').includes('..')) {
    throw sdeContract('The SDE archive contains an unsafe entry path.');
  }
  if (entry.uncompressedSize < 0 || entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw sdeContract('An SDE archive entry exceeds the safety limit.');
  }
}

function parseLine(line: string, accept: (value: unknown) => void): void {
  try {
    accept(JSON.parse(line) as unknown);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw sdeContract('An SDE JSONL row is invalid.', error);
  }
}

function sdeContract(message: string, cause?: unknown): AppError {
  return new AppError({ code: 'UPSTREAM_CONTRACT_MISMATCH', safeMessage: message, cause });
}
