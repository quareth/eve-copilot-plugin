import type { CopilotProfileData } from '../dto/copilot-profile.js';
import type { Clock } from '../ports/clock.js';
import { throwIfAborted } from '../../domain/errors.js';
import {
  getCopilotPersonaProfile,
  PERSONA_FACTIONS,
  type PersonaFaction,
} from '../../domain/copilot-profile.js';
import { localResult, type ResultEnvelope } from '../../domain/result.js';
import type { RequestContext, UseCase } from './use-case.js';

const CHANGE_COMMAND = 'eve-copilot-mcp setup --persona <none|amarr|caldari|gallente|minmatar>' as const;

export class GetEveCopilotProfile implements UseCase<
  Record<string, never>,
  ResultEnvelope<CopilotProfileData>
> {
  readonly #clock: Clock;
  readonly #faction: PersonaFaction;

  constructor(input: { readonly clock: Clock; readonly faction: PersonaFaction }) {
    this.#clock = input.clock;
    this.#faction = input.faction;
  }

  execute(
    _input: Record<string, never>,
    context: RequestContext,
  ): Promise<ResultEnvelope<CopilotProfileData>> {
    throwIfAborted(context.signal);
    const profile = getCopilotPersonaProfile(this.#faction);
    return Promise.resolve(localResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      data: {
        persona: {
          faction: profile.faction,
          display_name: profile.displayName,
          enabled: profile.enabled,
          identity: profile.identity,
          voice: profile.voice,
          boundaries: profile.boundaries,
        },
        available_factions: PERSONA_FACTIONS,
        change_command: CHANGE_COMMAND,
        restart_required_after_change: true,
      },
    }));
  }
}
