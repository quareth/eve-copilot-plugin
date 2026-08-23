import { describe, expect, it } from 'vitest';
import type {
  ComponentCheck,
  DatabaseMetadataPort,
  HealthCheck,
  ProtocolStatePort,
} from '../../../src/application/ports/health-check.js';
import { GetServerDiagnostics } from '../../../src/application/services/get-server-diagnostics.js';
import { GetServerStatus } from '../../../src/application/services/get-server-status.js';
import { getRuntimeInfo } from '../../../src/bootstrap/runtime-info.js';
import { buildCapabilityRegistry } from '../../../src/capabilities/registry.js';
import { FixedClock } from '../../helpers/fakes.js';

const clock = new FixedClock();
const database: DatabaseMetadataPort = { inspect: () => ({ schemaVersion: 1, mode: 'wal' }) };
const protocol: ProtocolStatePort = { negotiatedVersion: () => '2026-07-28' };
const signal = new AbortController().signal;

function healthCheck(
  id: string,
  state: ComponentCheck['state'],
  mandatory: boolean,
): HealthCheck {
  return {
    id,
    group: id.startsWith('storage') ? 'storage' : 'runtime',
    mandatory,
    run: () => Promise.resolve({
      id,
      state,
      message: `${id} is ${state}`,
      checked_at: clock.now().toISOString(),
      warnings: [],
    }),
  };
}

describe('server application services', () => {
  it('returns compact ready status', async () => {
    const service = new GetServerStatus({
      clock,
      runtime: getRuntimeInfo(),
      database,
      registry: buildCapabilityRegistry(),
      checks: [healthCheck('runtime.node', 'ok', true)],
      protocol,
    });
    const result = await service.execute({}, { requestId: 'request-1', signal });
    expect(result.data).toMatchObject({
      name: 'eve-copilot-mcp',
      status: 'ready',
      transport: 'stdio',
      protocol: { sdk_major: 2, negotiated_version: '2026-07-28' },
      database_schema_version: 1,
      capabilities: { available: 66 },
    });
  });

  it('returns unavailable diagnostics with safe remediation', async () => {
    const service = new GetServerDiagnostics({
      clock,
      runtime: getRuntimeInfo(),
      database,
      dataDirectoryKind: 'custom',
      checks: [
        healthCheck('runtime.node', 'ok', true),
        healthCheck('storage.sqlite', 'unavailable', true),
      ],
    });
    const result = await service.execute({}, { requestId: 'request-1', signal });
    expect(result.data.overall).toBe('unavailable');
    expect(result.data.checks.map((entry) => entry.id)).toEqual(['runtime.node', 'storage.sqlite']);
    expect(result.data.next_steps).toEqual([
      'Run eve-copilot-mcp doctor and verify the local data directory is writable.',
    ]);
    expect(JSON.stringify(result)).not.toContain('/private/');
  });

  it('turns incomplete EVE setup checks into executable next steps', async () => {
    const service = new GetServerDiagnostics({
      clock,
      runtime: getRuntimeInfo(),
      database,
      dataDirectoryKind: 'custom',
      checks: [
        healthCheck('eve.esi', 'not_configured', false),
        healthCheck('eve.sde', 'not_configured', false),
        healthCheck('eve.sso', 'not_configured', false),
      ],
    });
    const result = await service.execute({}, { requestId: 'request-1', signal });

    expect(result.data.next_steps).toEqual([
      'Run eve-copilot-mcp setup and follow its configuration guidance.',
      'Run eve-copilot-mcp sde install to install current EVE static data.',
    ]);
  });
});
