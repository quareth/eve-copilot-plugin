import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fsyncDirectory,
  fsyncFile,
} from '../../../src/infrastructure/sde/sde-manager.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe.runIf(process.platform === 'win32')('SDE Windows file synchronization', () => {
  it('synchronizes a file through a writable descriptor', async () => {
    const directory = await temporaryDirectory();
    const file = join(directory, 'sde.db');
    await writeFile(file, 'SDE');

    expect(() => { fsyncFile(file); }).not.toThrow();
  });

  it('accepts unsupported directory fsync but surfaces other filesystem errors', async () => {
    const directory = await temporaryDirectory();

    expect(() => { fsyncDirectory(directory); }).not.toThrow();
    expect(() => { fsyncDirectory(join(directory, 'missing')); }).toThrow(
      expect.objectContaining({ code: 'ENOENT' }),
    );
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'eve-sde-fsync-'));
  directories.push(directory);
  return directory;
}
