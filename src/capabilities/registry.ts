import { CapabilityRegistry } from '../domain/capability-registry.js';
import { characterCapabilities } from './definitions/character.js';
import { foundationCapabilities } from './definitions/foundation.js';
import { identityCapabilities } from './definitions/identity.js';
import { ESI_SEMANTIC_TOOLS } from './generated/semantic-tools.js';
import { ESI_SEMANTIC_CAPABILITIES } from './generated/semantic-capabilities.js';
import { fittingAnalysisCapabilities } from './definitions/fitting-analysis.js';
import { guideCapabilities } from './definitions/guide.js';

export const IMPLEMENTED_TOOL_NAMES: ReadonlySet<string> = new Set([
  'get_eve_capabilities',
  'get_server_diagnostics',
  'get_server_status',
  'connect_character',
  'get_character_connection_status',
  'cancel_character_connection',
  'reauthorize_character',
  'list_characters',
  'select_character',
  'disconnect_character',
  'get_character_overview',
  'get_current_location',
  'get_current_ship',
  'execute_eve_read',
  'find_eve_capabilities',
  'prepare_eve_action',
  'execute_eve_action',
  'analyze_fitting_changes',
  'search_eve_guide',
  'read_eve_guide_page',
  'maintain_eve_guide',
  ...ESI_SEMANTIC_TOOLS.map((definition) => definition.name),
]);

export function buildCapabilityRegistry(input: { readonly actionsEnabled?: boolean } = {}): CapabilityRegistry {
  const actionsEnabled = input.actionsEnabled ?? true;
  return new CapabilityRegistry([
    ...foundationCapabilities.map((capability) => !actionsEnabled
      && (capability.id === 'foundation.action_planning' || capability.id === 'foundation.action_execution')
      ? { ...capability, implementation: 'disabled' as const, feature_flag: 'actions_enabled' }
      : capability),
    ...identityCapabilities,
    ...characterCapabilities,
    ...ESI_SEMANTIC_CAPABILITIES,
    ...fittingAnalysisCapabilities,
    ...guideCapabilities,
  ], IMPLEMENTED_TOOL_NAMES);
}
