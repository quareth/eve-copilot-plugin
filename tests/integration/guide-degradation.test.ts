import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/bootstrap/build-container.js';
import { loadConfig } from '../../src/config/load-config.js';

describe('guide graceful degradation', () => {
  it('does not block authoritative capability discovery when guide storage is unavailable', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'eve-guide-degraded-'));
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, 'guide'), 'blocks the guide directory', 'utf8');
    const config = loadConfig({
      argv: ['serve', '--data-dir', dataDir],
      env: { EVE_COPILOT_CREDENTIAL_BACKEND: 'disabled' },
    });
    const container = buildContainer(config);
    try {
      await expect(container.assertFoundationReady()).resolves.toBeUndefined();
      const capabilities = await container.services.getEveCapabilities.execute({
        include_operations: true, limit: 100,
      }, {
        requestId: '00000000-0000-4000-8000-000000000001', signal: container.rootController.signal,
      });
      expect(capabilities.data.summary.available).toBeGreaterThan(0);
      await expect(container.services.searchEveGuide.execute({ query: 'Astero' }, {
        requestId: '00000000-0000-4000-8000-000000000002', signal: container.rootController.signal,
      })).rejects.toMatchObject({ code: 'GUIDE_UNAVAILABLE' });
    } finally {
      await container.shutdown();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
