import type { PersonaFaction } from '../../domain/copilot-profile.js';

export interface CopilotProfileData {
  readonly persona: {
    readonly faction: PersonaFaction;
    readonly display_name: string;
    readonly enabled: boolean;
    readonly identity: string;
    readonly voice: readonly string[];
    readonly boundaries: readonly string[];
  };
  readonly available_factions: readonly PersonaFaction[];
  readonly change_command: 'eve-copilot-mcp setup --persona <none|amarr|caldari|gallente|minmatar>';
  readonly restart_required_after_change: true;
}
