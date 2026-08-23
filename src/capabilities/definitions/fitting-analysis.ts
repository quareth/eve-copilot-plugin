import type { CapabilityDefinition } from '../../domain/capability.js';

export const fittingAnalysisCapabilities: readonly CapabilityDefinition[] = Object.freeze([{
  id: 'fittings.analyze_changes',
  domain: 'fittings',
  title: 'Analyze fitting changes',
  description: 'Validate a baseline and bounded fitting candidates with the pinned Dogma engine. Exact ESI scopes are enforced from the selected baseline source; structured and EFT inputs require only skills.',
  semantic_tools: ['analyze_fitting_changes'],
  esi_operations: [
    'GetCharactersCharacterIdShip',
    'GetCharactersCharacterIdAssets',
    'GetCharactersCharacterIdFittings',
    'GetCharactersCharacterIdSkills',
  ],
  required_scopes: [
    'esi-location.read_ship_type.v1',
    'esi-assets.read_assets.v1',
    'esi-fittings.read_fittings.v1',
    'esi-skills.read_skills.v1',
  ],
  required_roles: [],
  access: 'character',
  operation_class: 'read',
  sources: ['ESI', 'SDE', 'computed'],
  pagination: { mode: 'none' },
  freshness: { mode: 'uncached' },
  implementation: 'available',
  attribution_refs: ['EVEShipFit/dogma-engine', 'CCP EVE static data'],
}]);
