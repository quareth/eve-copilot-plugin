/* eslint-disable @typescript-eslint/explicit-function-return-type */

const coreSemanticOperations = new Map([
  ['GetCharactersDetail', ['character.overview']],
  ['GetCharactersCharacterIdLocation', ['character.overview', 'character.current_location']],
  ['GetCharactersCharacterIdShip', ['character.overview', 'character.current_ship']],
]);

// Required direct goal tools. Each entry is a reviewed, bounded set of
// ESI operations; the generated TypeScript registry is consumed by the MCP
// semantic executor, so policy and runtime cannot drift independently.
export const semanticToolOperations = Object.freeze({
  get_character_profile: ['GetCharactersDetail', 'GetCharactersCharacterIdAttributes', 'GetCharactersCharacterIdCorporationhistory'],
  get_character_activity: ['GetCharactersCharacterIdOnline', 'GetCharactersCharacterIdFatigue', 'GetCharactersCharacterIdAgentsResearch'],
  get_clones_and_implants: ['GetCharactersCharacterIdClones', 'GetCharactersCharacterIdImplants'],
  get_skills: ['GetCharactersCharacterIdSkills'],
  get_skill_queue: ['GetCharactersCharacterIdSkillqueue'],
  check_requirements: ['GetCharactersCharacterIdSkills', 'GetUniverseTypesTypeId'],
  search_assets: [
    'GetCharactersCharacterIdAssets',
    'PostCharactersCharacterIdAssetsNames',
    'PostCharactersCharacterIdAssetsLocations',
  ],
  list_owned_ships: [
    'GetCharactersCharacterIdAssets',
    'PostCharactersCharacterIdAssetsNames',
    'PostCharactersCharacterIdAssetsLocations',
  ],
  get_blueprints: ['GetCharactersCharacterIdBlueprints'],
  list_fittings: ['GetCharactersCharacterIdFittings'],
  analyze_fitting_access: ['GetCharactersCharacterIdFittings', 'GetCharactersCharacterIdSkills', 'GetCharactersCharacterIdAssets'],
  get_wallet_summary: ['GetCharactersCharacterIdWallet'],
  get_wallet_activity: ['GetCharactersCharacterIdWalletJournal', 'GetCharactersCharacterIdWalletTransactions'],
  list_my_market_orders: ['GetCharactersCharacterIdOrders', 'GetCharactersCharacterIdOrdersHistory'],
  list_contracts: ['GetCharactersCharacterIdContracts'],
  list_industry_jobs: ['GetCharactersCharacterIdIndustryJobs'],
  get_mining_activity: ['GetCharactersCharacterIdMining'],
  get_planetary_colonies: ['GetCharactersCharacterIdPlanets'],
  get_loyalty_points: ['GetCharactersCharacterIdLoyaltyPoints'],
  get_calendar: ['GetCharactersCharacterIdCalendar'],
  get_notifications: ['GetCharactersCharacterIdNotifications', 'GetCharactersCharacterIdNotificationsContacts'],
  list_eve_mail: ['GetCharactersCharacterIdMail', 'GetCharactersCharacterIdMailLabels', 'GetCharactersCharacterIdMailLists'],
  list_contacts: ['GetCharactersCharacterIdContacts', 'GetCharactersCharacterIdContactsLabels'],
  get_recent_killmails: ['GetCharactersCharacterIdKillmailsRecent'],
  get_fleet_overview: ['GetCharactersCharacterIdFleet'],
  resolve_eve_entities: ['PostUniverseNames'],
  search_eve_universe: ['PostUniverseIds'],
  get_market_price: ['GetMarketsPrices', 'GetUniverseTypesTypeId'],
  compare_market_orders: ['GetMarketsRegionIdOrders'],
  get_market_history: ['GetMarketsRegionIdHistory'],
  calculate_route: ['PostRoute'],
  get_server_activity: ['GetStatus', 'GetUniverseSystemJumps', 'GetUniverseSystemKills'],
  get_warfare_overview: ['GetFwStats', 'GetFwSystems', 'GetFwWars', 'GetIncursions'],
  get_sovereignty_overview: ['GetSovereigntyCampaigns', 'GetSovereigntySystems'],
  get_public_activity_intelligence: ['GetUniverseSystemJumps', 'GetUniverseSystemKills', 'GetIncursions', 'GetWars'],
  estimate_character_wealth: ['GetCharactersCharacterIdAssets', 'GetCharactersCharacterIdWallet', 'GetMarketsPrices'],
  get_corporation_overview: ['GetCorporationsCorporationId', 'GetCorporationsCorporationIdDivisions'],
  get_corporation_membership: ['GetCorporationsCorporationIdMembers'],
  get_corporation_assets: ['GetCorporationsCorporationIdAssets'],
  get_corporation_wallet_activity: ['GetCorporationsCorporationIdWallets', 'GetCorporationsCorporationIdWalletsDivisionJournal', 'GetCorporationsCorporationIdWalletsDivisionTransactions'],
  get_corporation_market_orders: ['GetCorporationsCorporationIdOrders', 'GetCorporationsCorporationIdOrdersHistory'],
  get_corporation_contracts: ['GetCorporationsCorporationIdContracts'],
  get_corporation_industry: ['GetCorporationsCorporationIdIndustryJobs'],
  get_corporation_structures: ['GetCorporationsCorporationIdStructures'],
  get_corporation_projects: ['GetCorporationsProjectsListing'],
});

const genericSemanticTools = [
  'analyze_fitting_access',
  'get_blueprints',
  'get_calendar',
  'get_character_activity',
  'get_character_profile',
  'get_clones_and_implants',
  'get_corporation_assets',
  'get_corporation_contracts',
  'get_corporation_industry',
  'get_corporation_market_orders',
  'get_corporation_membership',
  'get_corporation_overview',
  'get_corporation_projects',
  'get_corporation_structures',
  'get_corporation_wallet_activity',
  'get_fleet_overview',
  'get_loyalty_points',
  'get_mining_activity',
  'get_notifications',
  'get_planetary_colonies',
  'get_public_activity_intelligence',
  'get_recent_killmails',
  'get_skill_queue',
  'get_skills',
  'get_sovereignty_overview',
  'get_wallet_activity',
  'get_warfare_overview',
  'list_contacts',
  'list_contracts',
  'list_eve_mail',
  'list_fittings',
  'list_industry_jobs',
  'list_my_market_orders',
  'resolve_eve_entities',
  'search_eve_universe',
];

export const semanticToolBehaviors = Object.freeze({
  ...Object.fromEntries(genericSemanticTools.map((name) => [name, 'components'])),
  calculate_route: 'route',
  check_requirements: 'requirements',
  compare_market_orders: 'market_orders',
  estimate_character_wealth: 'wealth',
  get_market_history: 'market_history',
  get_market_price: 'market_price',
  get_server_activity: 'server_activity',
  get_wallet_summary: 'wallet_summary',
  list_owned_ships: 'owned_ships',
  search_assets: 'asset_search',
});

const semanticToolNames = Object.keys(semanticToolOperations).sort();
const semanticBehaviorNames = Object.keys(semanticToolBehaviors).sort();
if (JSON.stringify(semanticToolNames) !== JSON.stringify(semanticBehaviorNames)) {
  fail('Every semantic tool must declare exactly one reviewed runtime behavior.');
}

export const semanticOperations = new Map(coreSemanticOperations);
for (const [tool, operationIds] of Object.entries(semanticToolOperations)) {
  for (const operationId of operationIds) {
    const tools = semanticOperations.get(operationId) ?? [];
    semanticOperations.set(operationId, [...new Set([...tools, tool])].sort());
  }
}

// Fitting analysis is registered by its dedicated deterministic adapter instead of the
// generated semantic dispatcher, but its exact ESI dependencies remain part
// of the generated coverage ledger.
for (const operationId of [
  'GetCharactersCharacterIdShip',
  'GetCharactersCharacterIdAssets',
  'GetCharactersCharacterIdFittings',
  'GetCharactersCharacterIdSkills',
]) {
  const capabilities = semanticOperations.get(operationId) ?? [];
  semanticOperations.set(operationId, [...new Set([...capabilities, 'fittings.analyze_changes'])].sort());
}

// Non-GET operations which only retrieve or calculate data.
export const postReadOperations = new Set([
  'PostCharactersAffiliation',
  'PostCharactersCharacterIdAssetsLocations',
  'PostCharactersCharacterIdAssetsNames',
  'PostCharactersCharacterIdCspa',
  'PostCorporationsCorporationIdAssetsLocations',
  'PostCorporationsCorporationIdAssetsNames',
  'PostRoute',
  'PostUniverseIds',
  'PostUniverseNames',
]);

// Exact reviewed list for the 2026-08-18 snapshot. Generation fails if a
// non-GET operation is absent from both this list and postReadOperations.
export const actionOperations = new Set([
  'DeleteCharactersCharacterIdContacts',
  'DeleteCharactersCharacterIdFittingsFittingId',
  'DeleteCharactersCharacterIdMailLabelsLabelId',
  'DeleteCharactersCharacterIdMailMailId',
  'DeleteFleetsFleetIdMembersMemberId',
  'DeleteFleetsFleetIdSquadsSquadId',
  'DeleteFleetsFleetIdWingsWingId',
  'PostCharactersCharacterIdContacts',
  'PostCharactersCharacterIdFittings',
  'PostCharactersCharacterIdMail',
  'PostCharactersCharacterIdMailLabels',
  'PostFleetsFleetIdMembers',
  'PostFleetsFleetIdWings',
  'PostFleetsFleetIdWingsWingIdSquads',
  'PostUiAutopilotWaypoint',
  'PostUiOpenwindowContract',
  'PostUiOpenwindowInformation',
  'PostUiOpenwindowMarketdetails',
  'PostUiOpenwindowNewmail',
  'PutCharactersCharacterIdCalendarEventId',
  'PutCharactersCharacterIdContacts',
  'PutCharactersCharacterIdMailMailId',
  'PutFleetsFleetId',
  'PutFleetsFleetIdMembersMemberId',
  'PutFleetsFleetIdSquadsSquadId',
  'PutFleetsFleetIdWingsWingId',
]);

export const actionFamilies = Object.freeze({
  Calendar: 'calendar_respond',
  Contacts: 'contacts_write',
  Fittings: 'fittings_write',
  Mail: 'mail_organize',
  Fleets: 'fleet_write',
  'User Interface': 'ui_actions',
});

const packTags = new Map([
  ['character_communication', new Set(['Character', 'Location', 'Clones', 'Skills', 'Contacts', 'Calendar', 'Mail', 'Search', 'Access List', 'Activities', 'Cosmetics'])],
  ['inventory_economy', new Set(['Assets', 'Fittings', 'Wallet', 'Market', 'Contracts', 'Industry', 'Planetary Interaction', 'Loyalty', 'Insurance'])],
  ['organizations_operations', new Set(['Alliance', 'Corporation', 'Corporation Projects', 'Fleets', 'Structures', 'Freelance Jobs', 'Paragon Hub'])],
  ['universe_static', new Set(['Universe', 'Dogma', 'Meta', 'Routes', 'Status'])],
  ['warfare_intelligence', new Set(['Faction Warfare', 'Military Campaigns', 'Sovereignty', 'Wars', 'Killmails', 'Incursions'])],
  ['eve_client_ui', new Set(['User Interface'])],
]);

export function reviewedPolicy(operation) {
  const operationClass = operation.method === 'GET' || postReadOperations.has(operation.id)
    ? 'read'
    : actionOperations.has(operation.id)
      ? 'action'
      : fail(`Non-GET operation lacks a reviewed read/action decision: ${operation.id}`);
  if (operation.method === 'GET' && actionOperations.has(operation.id)) {
    fail(`GET operation cannot appear in the reviewed action list: ${operation.id}`);
  }
  const tag = operation.tags[0];
  const pack = [...packTags].find(([, tags]) => tags.has(tag))?.[0]
    ?? fail(`Operation tag lacks a reviewed pack: ${operation.id} (${tag})`);
  const access = classifyAccess(operation);
  const semantic = semanticOperations.get(operation.id) ?? [];
  const actionFamily = operationClass === 'action'
    ? actionFamilyFor(operation, tag)
    : null;
  return Object.freeze({
    operationClass,
    pack,
    access,
    capabilityIds: semantic.length > 0 ? semantic : [`esi.${toSnakeCase(operation.id)}`],
    exposure: semantic.length > 0 ? 'semantic' : 'bounded',
    actionFamily,
    scopeBundle: scopeBundleFor({ id: operation.id, operationClass, actionFamily, access, pack, tag }),
  });
}

function actionFamilyFor(operation, tag) {
  if (operation.id === 'PostCharactersCharacterIdMail') return 'mail_send';
  return actionFamilies[tag] ?? fail(`Action operation lacks a reviewed family: ${operation.id}`);
}

function scopeBundleFor(input) {
  if (input.operationClass === 'action') return `action.${input.actionFamily}`;
  if (input.access === 'public') return null;
  if (input.access === 'corporation' || input.access === 'alliance') return 'corporation_read';
  if (input.access === 'fleet') return 'fleet_read';
  if (input.tag === 'Location' && input.id !== 'GetCharactersCharacterIdOnline') return 'core_context';
  if (input.tag === 'Assets' || input.tag === 'Fittings') return 'inventory';
  if (input.pack === 'inventory_economy') return 'economy';
  if (new Set(['Calendar', 'Mail', 'Contacts', 'Activities']).has(input.tag)) return 'communication';
  return 'character_profile';
}

function classifyAccess(operation) {
  if (operation.scopes.length === 0) return 'public';
  if (operation.path.startsWith('/fleets/')) return 'fleet';
  if (operation.path.startsWith('/alliances/')) return 'alliance';
  if (operation.path.startsWith('/corporations/') || operation.path.startsWith('/corporation/')) return 'corporation';
  return 'character';
}

function toSnakeCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1_$2')
    .toLowerCase();
}

function fail(message) {
  throw new Error(message);
}
