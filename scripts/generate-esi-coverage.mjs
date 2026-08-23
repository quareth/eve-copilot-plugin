/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  actionOperations,
  postReadOperations,
  reviewedPolicy,
  semanticOperations,
  semanticToolBehaviors,
  semanticToolOperations,
} from './esi-policy.mjs';

const snapshotPath = 'docs/snapshots/esi-openapi-2026-08-18.json';
const expectedBytes = 614466;
const expectedHash = '1d7bf362256bff980f72e4dd0aa7917da9431383b0b29f6fbc44f30b1d1d0b02';
const bytes = readFileSync(snapshotPath);
const hash = createHash('sha256').update(bytes).digest('hex');
if (bytes.byteLength !== expectedBytes || hash !== expectedHash) {
  throw new Error('Pinned ESI OpenAPI snapshot size or digest does not match the reviewed contract.');
}
const document = JSON.parse(bytes.toString('utf8'));
const operations = [];
for (const [path, pathItem] of Object.entries(document.paths)) {
  for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
    const operation = pathItem[method];
    if (operation === undefined) continue;
    if (typeof operation.operationId !== 'string' || operation.operationId.length === 0) {
      throw new Error(`Operation ${method.toUpperCase()} ${path} has no operationId.`);
    }
    const parameters = [
      ...(pathItem.parameters ?? []),
      ...(operation.parameters ?? []),
    ].map((parameter) => dereference(parameter, document));
    const scopes = [...new Set((operation.security ?? [])
      .flatMap((requirement) => Object.values(requirement).flat()))].sort();
    const generated = {
      id: operation.operationId,
      method: method.toUpperCase(),
      path,
      tags: operation.tags ?? [],
      scopes,
    };
    const policy = reviewedPolicy(generated);
    const successfulResponse = findSuccessfulResponse(operation.responses ?? {});
    const capabilityIds = policy.capabilityIds;
    const implementedSemantic = semanticOperations.has(operation.operationId);
    const implementedBounded = !implementedSemantic;
    operations.push({
      operation_id: operation.operationId,
      method: method.toUpperCase(),
      path,
      tag: policy.pack === undefined ? null : operation.tags?.[0] ?? 'Unknown',
      compatibility_snapshot: '2026-08-18',
      disposition: implementedSemantic
        ? 'implemented_semantic'
        : implementedBounded
          ? 'implemented_bounded_low_level'
          : 'planned',
      capability_ids: capabilityIds,
      reason: implementedSemantic
        ? null
        : policy.operationClass === 'read'
          ? 'Available through the strict descriptor-driven execute_eve_read capability.'
          : 'Available through the guarded prepare, confirm, single-use execute, and audit action pipeline.',
      fact: {
        operationId: operation.operationId,
        compatibilityDate: '2026-08-18',
        method: method.toUpperCase(),
        pathTemplate: path,
        tag: operation.tags?.[0] ?? 'Unknown',
        summary: operation.summary ?? operation.operationId,
        access: policy.access,
        operationClass: policy.operationClass,
        requiredScopes: scopes,
        requiredRoles: [...new Set(operation['x-required-roles'] ?? [])].sort(),
        authorizationScopes: [...new Set([
          ...scopes,
          ...((operation['x-required-roles'] ?? []).length === 0
            ? []
            : ['esi-characters.read_corporation_roles.v1']),
          ...(policy.access === 'fleet' ? ['esi-fleets.read_fleet.v1'] : []),
        ])].sort(),
        parameters: parameters
          .filter((parameter) => parameter.in === 'path' || parameter.in === 'query')
          .map((parameter) => ({
            name: parameter.name,
            location: parameter.in,
            required: parameter.required === true,
            style: parameter.style ?? 'form',
            explode: parameter.explode ?? parameter.style !== 'simple',
          })),
        inputSchema: buildInputSchema(parameters, operation.requestBody, document),
        outputSchema: successfulResponse === null
          ? { type: 'null' }
          : normalizeSchema(dereference(successfulResponse, document), 'output'),
        pagination: buildPagination(parameters, operation),
        freshness: buildFreshness(operation),
        rateLimit: operation['x-rate-limit'] ?? null,
        budgets: {
          defaultItems: 200,
          maximumItems: 1000,
          maximumPages: 5,
          maximumRequests: 20,
          maximumConcurrency: 4,
          maximumResponseBytes: 4194304,
          timeoutMs: 30000,
        },
        pack: policy.pack,
        capabilityIds,
        exposure: policy.exposure,
        actionFamily: policy.actionFamily,
        scopeBundle: policy.scopeBundle,
      },
    });
  }
}
operations.sort((left, right) => left.operation_id.localeCompare(right.operation_id));
if (operations.length !== 233 || new Set(operations.map((entry) => entry.operation_id)).size !== 233) {
  throw new Error('Pinned ESI OpenAPI snapshot must contain exactly 233 unique operations.');
}
if (actionOperations.size !== 26 || postReadOperations.size !== 9) {
  throw new Error('Reviewed non-GET classification must contain 26 actions and 9 reads.');
}
const facts = operations.map((entry) => entry.fact);
const coverageSummary = summarizeCoverage(operations);
writeFileSync('src/capabilities/generated/coverage-summary.ts', `// Generated by scripts/generate-esi-coverage.mjs. Do not edit.\n\n`
  + `export const ESI_COVERAGE_SNAPSHOT = ${JSON.stringify({
    source: 'https://esi.evetech.net/meta/openapi.json',
    compatibilityDate: '2026-08-18',
    byteSize: expectedBytes,
    sha256: expectedHash,
    operationCount: operations.length,
  }, null, 2)} as const;\n\n`
  + `export const ESI_COVERAGE_SUMMARY = ${JSON.stringify(coverageSummary, null, 2)} as const;\n`);
const factByOperation = new Map(facts.map((fact) => [fact.operationId, fact]));
const semanticTools = Object.entries(semanticToolOperations).sort(([left], [right]) => left.localeCompare(right))
  .map(([name, operationIds]) => {
    for (const operationId of operationIds) {
      if (!factByOperation.has(operationId)) throw new Error(`Semantic tool ${name} references unknown operation ${operationId}.`);
    }
    return {
      name,
      title: titleCase(name),
      description: semanticDescription(name, operationIds.map((operationId) => factByOperation.get(operationId))),
      operationIds,
      behavior: semanticToolBehaviors[name],
    };
  });
mkdirSync('src/capabilities/generated', { recursive: true });
writeFileSync('src/capabilities/generated/esi-operation-facts.ts', `// Generated by scripts/generate-esi-coverage.mjs. Do not edit.\n`
  + `import type { EsiOperationFact } from '../../domain/esi-operation.js';\n\n`
  + `export const ESI_OPERATION_FACTS = ${JSON.stringify(facts, null, 2)} as const satisfies readonly EsiOperationFact[];\n`);
writeFileSync('src/capabilities/generated/semantic-tools.ts', `// Generated by scripts/generate-esi-coverage.mjs. Do not edit.\n\n`
  + `export type GeneratedSemanticBehavior = 'components' | 'route' | 'requirements' | 'market_orders' | 'wealth' | 'market_history' | 'market_price' | 'server_activity' | 'wallet_summary' | 'owned_ships' | 'asset_search';\n`
  + `export interface GeneratedSemanticTool { readonly name: string; readonly title: string; readonly description: string; readonly operationIds: readonly string[]; readonly behavior: GeneratedSemanticBehavior }\n\n`
  + `export const ESI_SEMANTIC_TOOLS = ${JSON.stringify(semanticTools, null, 2)} as const satisfies readonly GeneratedSemanticTool[];\n`);
const semanticCapabilities = semanticTools.map((tool) => {
  const operationFacts = tool.operationIds.map((operationId) => factByOperation.get(operationId));
  const access = operationFacts.some((fact) => fact.access === 'corporation' || fact.access === 'alliance' || fact.access === 'fleet')
    ? 'corporation'
    : operationFacts.some((fact) => fact.access === 'character') ? 'character' : 'public';
  return {
    id: tool.name,
    domain: semanticDomain(tool.name),
    title: tool.title,
    description: tool.description,
    semantic_tools: [tool.name],
    esi_operations: tool.operationIds,
    required_scopes: [...new Set(operationFacts.flatMap((fact) => fact.authorizationScopes))].sort(),
    required_roles: [...new Set(operationFacts.flatMap((fact) => fact.requiredRoles))].sort(),
    access,
    operation_class: 'read',
    sources: tool.name === 'check_requirements'
      ? ['ESI', 'SDE', 'computed']
      : operationFacts.length > 1 ? ['ESI', 'computed'] : ['ESI'],
    pagination: tool.name === 'check_requirements'
      ? { mode: 'none' }
      : { mode: 'cursor', default_limit: 100, maximum_limit: 200 },
    freshness: { mode: 'source_headers' },
    implementation: 'available',
    attribution_refs: ['docs/attribution.md#attribution-ledger'],
  };
});
writeFileSync('src/capabilities/generated/semantic-capabilities.ts', `// Generated by scripts/generate-esi-coverage.mjs. Do not edit.\n`
  + `import type { CapabilityDefinition } from '../../domain/capability.js';\n\n`
  + `export const ESI_SEMANTIC_CAPABILITIES = ${JSON.stringify(semanticCapabilities, null, 2)} as const satisfies readonly CapabilityDefinition[];\n`);
const operationCatalog = operations.map(({ fact: _fact, ...entry }) => entry);
writeFileSync('docs/esi-coverage.json', `${JSON.stringify({
  snapshot: {
    source: 'https://esi.evetech.net/meta/openapi.json',
    compatibility_date: '2026-08-18',
    byte_size: expectedBytes,
    sha256: expectedHash,
    operation_count: operations.length,
  },
  summary: coverageSummary,
  operations: operationCatalog,
}, null, 2)}\n`);
const rows = operationCatalog.map((entry) =>
  `| \`${entry.operation_id}\` | \`${entry.method} ${entry.path}\` | \`${entry.disposition}\` | ${entry.capability_ids.length === 0 ? '—' : entry.capability_ids.map((id) => `\`${id}\``).join(', ')} | ${entry.reason ?? 'Reviewed generated descriptor and ESI policy.'} |`);
writeFileSync('docs/esi-coverage.md', `# ESI coverage ledger

This ledger is generated from the pinned official ESI OpenAPI snapshot. Do not
edit rows manually; run \`node scripts/generate-esi-coverage.mjs\` after an
explicit compatibility-date review.

- Source: \`https://esi.evetech.net/meta/openapi.json\`
- Compatibility date: \`2026-08-18\`
- Bytes: \`${expectedBytes}\`
- SHA-256: \`${expectedHash}\`
- Operations: \`${operations.length}\`
- Accounted coverage: \`${coverageSummary.accounted.percent}%\` (\`${coverageSummary.accounted.count}/${coverageSummary.accounted.denominator}\`)
- Allowed execution coverage: \`${coverageSummary.allowed_execution.percent}%\` (\`${coverageSummary.allowed_execution.count}/${coverageSummary.allowed_execution.denominator}\`)
- Semantic coverage: \`${coverageSummary.semantic.percent}%\` (\`${coverageSummary.semantic.count}/${coverageSummary.semantic.denominator}\`)
- Planned operations: \`${coverageSummary.dispositions.planned}\`

## Coverage by operation class

| Class | Total | Semantic | Bounded | Excluded | Planned | Accounted | Allowed execution |
|---|---:|---:|---:|---:|---:|---:|---:|
${coverageSummary.by_class.map(coverageRow).join('\n')}

## Coverage by pack

| Pack | Total | Semantic | Bounded | Excluded | Planned | Accounted | Allowed execution |
|---|---:|---:|---:|---:|---:|---:|---:|
${coverageSummary.by_pack.map(coverageRow).join('\n')}

## Operation ledger

| Operation ID | Method/path | Disposition | Capability IDs | Review reason |
|---|---|---|---|---|
${rows.join('\n')}
`);
const capabilityRows = [...new Set(facts.flatMap((fact) => fact.capabilityIds))].sort().map((capabilityId) => {
  const sources = facts.filter((fact) => fact.capabilityIds.includes(capabilityId));
  const semantic = !capabilityId.startsWith('esi.');
  const semanticDefinition = semanticTools.find((definition) => definition.name === capabilityId);
  const purpose = semanticDefinition?.description ?? sources[0]?.summary ?? capabilityId;
  const access = [...new Set(sources.map((fact) => fact.access))].sort().map((value) => `\`${value}\``).join(', ');
  const operationClasses = [...new Set(sources.map((fact) => fact.operationClass))].sort();
  const operationClass = operationClasses.map((value) => `\`${value}\``).join(', ');
  const scopesValue = [...new Set(sources.flatMap((fact) => fact.authorizationScopes))].sort();
  const scopes = scopesValue.length === 0 ? '—' : scopesValue.map((scope) => `\`${scope}\``).join('<br>');
  const rolesValue = [...new Set(sources.flatMap((fact) => fact.requiredRoles))].sort();
  const roles = rolesValue.length === 0 ? '—' : rolesValue.map((role) => `\`${role}\``).join(', ');
  const sourceOperations = sources.map((fact) => `\`${fact.operationId}\``).join('<br>');
  const pagination = [...new Set(sources.map((fact) => fact.pagination.mode))].sort().map((value) => `\`${value}\``).join(', ');
  const freshness = [...new Set(sources.map((fact) => fact.freshness.mode === 'fixed_ttl'
    ? `fixed ${String(fact.freshness.ttlSeconds ?? 0)}s`
    : fact.freshness.mode))].sort().join(', ');
  const exposure = semantic ? `direct tool \`${capabilityId}\``
    : operationClasses.includes('action') ? '`prepare_eve_action` / `execute_eve_action`' : '`execute_eve_read`';
  const status = operationClasses.includes('action') ? 'available when its local action family is enabled' : 'available';
  const failure = scopesValue.length > 0
    ? '`MISSING_SCOPE`: reauthorize this capability; `INSUFFICIENT_ROLE`: obtain the listed in-game role where applicable.'
    : '`AMBIGUOUS_INPUT`: use a validated ID or narrower input; transient ESI errors may be retried for reads.';
  return `| \`${capabilityId}\` | ${purpose.replaceAll('|', '\\|')} | ${exposure} | ${sourceOperations} | ${access} | ${operationClass} | ${scopes} | ${roles} | ${pagination}; ${freshness} | ${status} | ${failure} |`;
});
writeFileSync('docs/capability-catalog.md', `# EVE capability catalog

Generated from the pinned ESI contract and reviewed ESI policy. Common user
goals should use semantic tools; the capability IDs below are the complete
semantic and bounded/discovery surface. Role lists are accepted alternatives.

| Capability ID | User-facing purpose | Exposure tool | Source operations | Access | Class | Authorization scopes | Accepted roles | Pagination / freshness | Status | Common failure / safe next step |
|---|---|---|---|---|---|---|---|---|---|---|
${capabilityRows.join('\n')}
`);
const bundleDescriptions = {
  core_context: 'Current location and active ship context.',
  character_profile: 'Skills, clones, implants, roles, standings, loyalty, and character activity.',
  inventory: 'Assets, asset resolution, blueprints, and saved fittings.',
  economy: 'Wallet, orders, contracts, industry, mining, planetary colonies, and related economy data.',
  communication: 'Calendar, mail reads, contacts, and notifications.',
  fleet_read: 'Fleet membership and fleet information visible to the selected character.',
  corporation_read: 'Corporation and alliance data, still subject to current membership and in-game roles.',
  'action.calendar_respond': 'Explicit opt-in to calendar response actions.',
  'action.contacts_write': 'Explicit opt-in to contact mutation actions.',
  'action.fittings_write': 'Explicit opt-in to saved-fitting mutation actions.',
  'action.mail_send': 'Explicit opt-in to sending EVE mail.',
  'action.mail_organize': 'Explicit opt-in to mail label, deletion, and read-state actions.',
  'action.fleet_write': 'Explicit opt-in to fleet mutation actions.',
  'action.ui_actions': 'Explicit opt-in to EVE client UI actions.',
};
const bundles = [...new Set(facts.map((fact) => fact.scopeBundle).filter((bundle) => bundle !== null))]
  .sort()
  .map((bundle) => ({
    name: bundle,
    kind: bundle.startsWith('action.') ? 'action' : 'read',
    description: bundleDescriptions[bundle],
    scopes: [...new Set(facts
      .filter((fact) => fact.scopeBundle === bundle)
      .flatMap((fact) => fact.authorizationScopes))].sort(),
    capabilities: facts.filter((fact) => fact.scopeBundle === bundle).length,
  }));
writeFileSync('src/capabilities/generated/scope-bundles.ts', `// Generated by scripts/generate-esi-coverage.mjs. Do not edit.\n`
  + `import type { EsiScopeBundle } from '../../domain/esi-operation.js';\n\n`
  + `export interface GeneratedScopeBundle { readonly name: EsiScopeBundle; readonly kind: 'read' | 'action'; readonly description: string; readonly scopes: readonly string[]; readonly capabilities: number }\n\n`
  + `export const ESI_SCOPE_BUNDLES = ${JSON.stringify(bundles, null, 2)} as const satisfies readonly GeneratedScopeBundle[];\n`);
const bundleRows = bundles.map((bundle) => `| \`${bundle.name}\` | \`${bundle.kind}\` | ${bundle.description} | ${bundle.capabilities} | ${bundle.scopes.map((scope) => `\`${scope}\``).join('<br>')} |`);
writeFileSync('docs/scope-bundles.md', `# EVE scope bundles

Generated from the pinned ESI contract and reviewed scope-bundle policy.
Initial connection requests only \`core_context\`. Additional authorization is
additive and explicit for a selected capability. The server requests the exact
operation scope set, which is never broader than the documented bundle. Action
bundles are separate and are never included in read-only setup.

Users who have intentionally assigned every reviewed read scope to their EVE
developer application may call \`reauthorize_character\` with
\`scope_mode: "all_reads"\`. This produces one explicit EVE consent page for the
union of all 64 read scopes. It never adds action scopes. The default
\`scope_mode: "minimum"\` behavior remains incremental and least-privileged.

| Bundle | Kind | Purpose | Capabilities | Scope ceiling |
|---|---|---|---:|---|
${bundleRows.join('\n')}

Reauthorization preserves the current working grant until the replacement SSO
flow completes, verifies the intended character, rotates protected credentials,
increments the authorization generation, and invalidates private cached state.
Corporation roles are in-game permissions and cannot be granted by OAuth.
`);

function summarizeCoverage(entries) {
  const dispositions = Object.fromEntries([
    'implemented_semantic',
    'implemented_bounded_low_level',
    'excluded_policy',
    'planned',
  ].map((disposition) => [disposition, entries.filter((entry) => entry.disposition === disposition).length]));
  const allowed = entries.filter((entry) => entry.disposition !== 'excluded_policy');
  const accountedCount = entries.length - dispositions.planned;
  const executedCount = dispositions.implemented_semantic + dispositions.implemented_bounded_low_level;
  return {
    total_operations: entries.length,
    dispositions,
    accounted: metric(accountedCount, entries.length),
    allowed_execution: metric(executedCount, allowed.length),
    semantic: metric(dispositions.implemented_semantic, allowed.length),
    by_class: groupedCoverage(entries, (entry) => entry.fact.operationClass),
    by_pack: groupedCoverage(entries, (entry) => entry.fact.pack),
    by_access: groupedCoverage(entries, (entry) => entry.fact.access),
  };
}

function groupedCoverage(entries, keyOf) {
  return [...new Set(entries.map(keyOf))].sort().map((key) => {
    const group = entries.filter((entry) => keyOf(entry) === key);
    const semantic = group.filter((entry) => entry.disposition === 'implemented_semantic').length;
    const bounded = group.filter((entry) => entry.disposition === 'implemented_bounded_low_level').length;
    const excluded = group.filter((entry) => entry.disposition === 'excluded_policy').length;
    const planned = group.filter((entry) => entry.disposition === 'planned').length;
    const allowed = group.length - excluded;
    return {
      key,
      total: group.length,
      semantic,
      bounded,
      excluded,
      planned,
      accounted_percent: metric(group.length - planned, group.length).percent,
      allowed_execution_percent: metric(semantic + bounded, allowed).percent,
    };
  });
}

function metric(count, denominator) {
  return {
    count,
    denominator,
    percent: denominator === 0 ? 100 : Number((count * 100 / denominator).toFixed(2)),
  };
}

function coverageRow(entry) {
  return `| \`${entry.key}\` | ${entry.total} | ${entry.semantic} | ${entry.bounded} | ${entry.excluded} | ${entry.planned} | ${entry.accounted_percent}% | ${entry.allowed_execution_percent}% |`;
}

function titleCase(name) {
  return name.split('_').map((word) => word.length === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`).join(' ');
}

function semanticDescription(name, factsForTool) {
  if (name === 'check_requirements') {
    return 'Resolve every validated recursive hard-skill requirement for one published EVE type and compare trained and active character levels in one complete proof.';
  }
  const access = [...new Set(factsForTool.map((fact) => fact.access))].join(', ');
  const purpose = name.replaceAll('_', ' ');
  return `Goal-oriented ${purpose} using strictly validated ${access} EVE data with bounded results and continuations.`;
}

function semanticDomain(name) {
  if (new Set(['get_skills', 'get_skill_queue', 'check_requirements']).has(name)) return 'skills';
  if (new Set(['search_assets', 'list_owned_ships', 'get_blueprints', 'estimate_character_wealth']).has(name)) return 'assets';
  if (new Set(['list_fittings', 'analyze_fitting_access']).has(name)) return 'fittings';
  if (name.startsWith('get_wallet')) return 'wallet';
  if (name.includes('market')) return 'market';
  if (name.includes('contract')) return 'contracts';
  if (new Set(['list_industry_jobs', 'get_mining_activity', 'get_planetary_colonies', 'get_loyalty_points']).has(name)) return 'industry';
  if (new Set(['resolve_eve_entities', 'search_eve_universe', 'calculate_route']).has(name)) return 'navigation';
  if (name.startsWith('get_corporation_') || name === 'get_fleet_overview') return 'corporation';
  if (new Set(['get_calendar', 'get_notifications', 'list_eve_mail', 'list_contacts']).has(name)) return 'communication';
  if (new Set(['get_recent_killmails', 'get_server_activity', 'get_warfare_overview', 'get_sovereignty_overview', 'get_public_activity_intelligence']).has(name)) return 'intelligence';
  return 'character';
}

function buildInputSchema(parameters, requestBody, root) {
  const properties = {};
  const required = [];
  for (const parameter of parameters) {
    if (parameter.in !== 'path' && parameter.in !== 'query') continue;
    properties[parameter.name] = normalizeSchema(dereference(parameter.schema ?? {}, root), 'input');
    if (parameter.required === true) required.push(parameter.name);
  }
  if (requestBody !== undefined) {
    const resolved = dereference(requestBody, root);
    const body = resolved.content?.['application/json']?.schema;
    if (body !== undefined) properties.body = normalizeSchema(dereference(body, root), 'input');
    if (resolved.required === true && body !== undefined) required.push('body');
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length === 0 ? {} : { required: required.sort() }),
  };
}

function findSuccessfulResponse(responses) {
  for (const status of Object.keys(responses).sort()) {
    if (!/^2[0-9][0-9]$/u.test(status)) continue;
    const response = dereference(responses[status], document);
    const schema = response.content?.['application/json']?.schema;
    if (schema !== undefined) return schema;
  }
  return null;
}

function buildPagination(parameters, operation) {
  const paged = parameters.some((parameter) => parameter.in === 'query' && parameter.name === 'page');
  const cursor = operation['x-pagination'] === 'cursor';
  return {
    mode: paged ? 'page' : cursor ? 'cursor' : 'none',
    defaultPages: 1,
    maximumPages: paged || cursor ? 5 : 1,
    metadata: operation['x-pagination'] ?? null,
  };
}

function buildFreshness(operation) {
  if (operation.operationId === 'GetCharactersCharacterIdRoles') {
    return { mode: 'fixed_ttl', ttlSeconds: 60, staleIfErrorSeconds: 0 };
  }
  const ttl = operation['x-client-cache-ttl'] ?? operation['x-cache-age'] ?? null;
  return {
    mode: ttl === null ? 'source_headers' : 'fixed_ttl',
    ttlSeconds: ttl,
    staleIfErrorSeconds: operation['x-tombstone-ttl'] ?? 0,
  };
}

function dereference(value, root, stack = new Set()) {
  if (Array.isArray(value)) return value.map((entry) => dereference(entry, root, stack));
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.$ref === 'string') {
    if (!value.$ref.startsWith('#/')) throw new Error(`External OpenAPI reference is not allowed: ${value.$ref}`);
    if (stack.has(value.$ref)) throw new Error(`Recursive OpenAPI reference is unsupported: ${value.$ref}`);
    const target = value.$ref.slice(2).split('/').reduce((current, key) => current?.[key], root);
    if (target === undefined) throw new Error(`Unresolved OpenAPI reference: ${value.$ref}`);
    return dereference(target, root, new Set([...stack, value.$ref]));
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, dereference(entry, root, stack)]));
}

function normalizeSchema(value, direction) {
  if (Array.isArray(value)) return value.map((entry) => normalizeSchema(entry, direction));
  if (value === null || typeof value !== 'object') return value;
  const normalized = Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith('x-'))
    .map(([key, entry]) => [key, normalizeSchema(entry, direction)]));
  if (normalized.format === 'int64') {
    if (direction === 'input') {
      return {
        type: 'string',
        pattern: '^(0|[1-9][0-9]*)$',
        description: normalized.description ?? 'Canonical decimal EVE identifier.',
      };
    }
    return {
      anyOf: [
        { type: 'integer', minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
        { type: 'string', pattern: '^-?(0|[1-9][0-9]*)$' },
      ],
      description: normalized.description,
    };
  }
  if (normalized.type === 'object' && normalized.additionalProperties === undefined) {
    normalized.additionalProperties = false;
  }
  return normalized;
}
