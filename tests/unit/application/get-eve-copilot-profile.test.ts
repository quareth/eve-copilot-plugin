import { describe, expect, it } from 'vitest';
import { GetEveCopilotProfile } from '../../../src/application/services/get-eve-copilot-profile.js';
import { FixedClock } from '../../helpers/fakes.js';

describe('GetEveCopilotProfile', () => {
  it('returns the selected faction voice with shared safety boundaries', async () => {
    const service = new GetEveCopilotProfile({
      clock: new FixedClock('2026-08-23T00:00:00.000Z'),
      faction: 'caldari',
    });

    const result = await service.execute({}, {
      requestId: '11111111-1111-4111-8111-111111111111',
      signal: new AbortController().signal,
    });

    expect(result.data.persona).toMatchObject({
      faction: 'caldari',
      display_name: 'Caldari',
      enabled: true,
    });
    expect(result.data.persona.voice.join(' ')).toContain('military-corporate');
    expect(result.data.persona.boundaries.join(' ')).toContain('never change facts');
    expect(result.data.available_factions).toEqual([
      'none', 'amarr', 'caldari', 'gallente', 'minmatar',
    ]);
    expect(result.data.restart_required_after_change).toBe(true);
  });
});
