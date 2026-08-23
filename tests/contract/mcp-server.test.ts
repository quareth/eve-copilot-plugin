import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getEveCapabilitiesOutputSchema } from '../../src/mcp/schemas/get-eve-capabilities.js';
import { getEveCopilotProfileOutputSchema } from '../../src/mcp/schemas/get-eve-copilot-profile.js';
import { getServerDiagnosticsOutputSchema } from '../../src/mcp/schemas/get-server-diagnostics.js';
import { getServerStatusOutputSchema } from '../../src/mcp/schemas/get-server-status.js';
import { executeEveReadOutputSchema } from '../../src/mcp/schemas/bounded-read.js';
import { findEveCapabilitiesOutputSchema } from '../../src/mcp/schemas/operation-discovery.js';
import {
  checkRequirementsOutputSchema,
  semanticReadOutputSchema,
} from '../../src/mcp/schemas/semantic-read.js';
import { executeEveActionOutputSchema, prepareEveActionOutputSchema } from '../../src/mcp/schemas/actions.js';
import { ESI_SEMANTIC_TOOLS } from '../../src/capabilities/generated/semantic-tools.js';
import {
  maintainEveGuideOutputSchema,
  readEveGuidePageOutputSchema,
  searchEveGuideOutputSchema,
} from '../../src/mcp/schemas/guide.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

describe.each([
  ['legacy', { mode: 'legacy' as const }],
  ['current auto-negotiated', { mode: 'auto' as const, probe: { timeoutMs: 2_000 } }],
])('MCP stdio contract (%s)', (_label, versionNegotiation) => {
  it('lists the foundation surface and preserves the existing contracts', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'eve-copilot-mcp-contract-'));
    temporaryDirectories.push(dataDir);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'serve',
        '--data-dir',
        dataDir,
        '--log-level',
        'error',
      ],
      cwd: process.cwd(),
      stderr: 'pipe',
    });
    const stderr: string[] = [];
    transport.stderr?.on('data', (chunk: Buffer) => { stderr.push(chunk.toString('utf8')); });
    const client = new Client({ name: 'mcp-contract-test', version: '1.0.0' }, {
      versionNegotiation,
    });
    try {
      await client.connect(transport);

      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        'get_eve_copilot_profile',
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
        ...ESI_SEMANTIC_TOOLS.map((definition) => definition.name),
        'analyze_fitting_changes',
        'search_eve_guide',
        'read_eve_guide_page',
        'maintain_eve_guide',
      ]);
      for (const tool of tools.tools) {
        expect(tool.inputSchema.additionalProperties).toBe(false);
      }
      const checkRequirements = tools.tools.find((tool) => tool.name === 'check_requirements');
      expect(checkRequirements?.description).toContain('every validated recursive hard-skill requirement');
      expect(Object.keys(checkRequirements?.inputSchema.properties ?? {})).toEqual(['arguments']);
      expect(tools.tools.find((tool) => tool.name === 'reauthorize_character')?.inputSchema).toMatchObject({
        properties: {
          scope_mode: { enum: ['minimum', 'all_reads'], default: 'minimum' },
        },
      });
      expect(Object.fromEntries(tools.tools.map((tool) => [tool.name, tool.annotations]))).toMatchObject({
        get_eve_copilot_profile: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        get_eve_capabilities: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        get_server_diagnostics: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        get_server_status: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        connect_character: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        get_character_connection_status: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        cancel_character_connection: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        reauthorize_character: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        list_characters: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        select_character: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        disconnect_character: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        get_character_overview: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        get_current_location: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        get_current_ship: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        execute_eve_read: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        find_eve_capabilities: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        search_eve_guide: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        read_eve_guide_page: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        maintain_eve_guide: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      });
      for (const definition of ESI_SEMANTIC_TOOLS) {
        expect(tools.tools.find((tool) => tool.name === definition.name)?.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        });
      }

      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toEqual([
        'eve://capabilities',
        'eve://server/info',
        'eve://coverage',
      ]);

      const templates = await client.listResourceTemplates();
      expect(templates.resourceTemplates.map((template) => template.uriTemplate)).toEqual([
        'eve://capabilities/{capability_id}',
        'eve://sde/type/{type_id}',
        'eve://sde/system/{system_id}',
        'eve://sde/ship/{type_id}',
      ]);

      const status = await client.callTool({ name: 'get_server_status', arguments: {} });
      assertTextMatchesStructured(status);
      const statusEnvelope = getServerStatusOutputSchema.parse(status.structuredContent);
      expect('data' in statusEnvelope && statusEnvelope.data.status).toBe('ready');

      const profile = await client.callTool({ name: 'get_eve_copilot_profile', arguments: {} });
      assertTextMatchesStructured(profile);
      const profileEnvelope = getEveCopilotProfileOutputSchema.parse(profile.structuredContent);
      expect('data' in profileEnvelope && profileEnvelope.data.persona).toMatchObject({
        faction: 'none',
        enabled: false,
      });

      const emptyGuide = await client.callTool({ name: 'search_eve_guide', arguments: { query: 'Astero' } });
      assertTextMatchesStructured(emptyGuide);
      const emptyGuideEnvelope = searchEveGuideOutputSchema.parse(emptyGuide.structuredContent);
      expect('data' in emptyGuideEnvelope && emptyGuideEnvelope.data.results).toEqual([]);

      const missingGuidePage = await client.callTool({
        name: 'read_eve_guide_page', arguments: { page_id: 'ships/astero' },
      });
      assertTextMatchesStructured(missingGuidePage);
      const missingGuideEnvelope = readEveGuidePageOutputSchema.parse(missingGuidePage.structuredContent);
      expect('error' in missingGuideEnvelope && missingGuideEnvelope.error.code).toBe('NOT_FOUND');

      const createdGuidePage = await client.callTool({
        name: 'maintain_eve_guide',
        arguments: {
          action: 'create',
          page_id: 'ships/astero',
          title: 'Astero',
          page_kind: 'ship',
          scope: 'user',
          content: '# Astero\n\nAdvisory exploration notes.',
          freshness: { kind: 'unverified', observed_at: null },
        },
      });
      assertTextMatchesStructured(createdGuidePage);
      const createdGuideEnvelope = maintainEveGuideOutputSchema.parse(createdGuidePage.structuredContent);
      expect('data' in createdGuideEnvelope && createdGuideEnvelope.data.page?.metadata.revision).toBe(1);

      const readCreatedGuidePage = await client.callTool({
        name: 'read_eve_guide_page', arguments: { page_id: 'ships/astero' },
      });
      const readCreatedGuideEnvelope = readEveGuidePageOutputSchema.parse(readCreatedGuidePage.structuredContent);
      expect('data' in readCreatedGuideEnvelope && readCreatedGuideEnvelope.data.page.content).toContain('Advisory');

      const unavailableRequirements = await client.callTool({
        name: 'check_requirements',
        arguments: { arguments: { type_id: '587' } },
      });
      const unavailableRequirementsEnvelope = checkRequirementsOutputSchema.parse(
        unavailableRequirements.structuredContent,
      );
      expect('error' in unavailableRequirementsEnvelope
        && unavailableRequirementsEnvelope.error.code).toBe('SDE_UNAVAILABLE');

      const diagnostics = await client.callTool({
        name: 'get_server_diagnostics',
        arguments: { include: ['runtime', 'storage', 'registry', 'transport'] },
      });
      assertTextMatchesStructured(diagnostics);
      const diagnosticsEnvelope = getServerDiagnosticsOutputSchema.parse(diagnostics.structuredContent);
      expect('data' in diagnosticsEnvelope && diagnosticsEnvelope.data.overall).toBe('ready');
      if (!('data' in diagnosticsEnvelope)) throw new Error('Expected successful diagnostics.');
      expect(diagnosticsEnvelope.data.stage3).toMatchObject({
        compatibility_date: '2026-08-18',
        surface_profile: 'complete',
        coverage: {
          total: 233,
          semantic: 67,
          bounded: 166,
          planned: 0,
          accounted_percent: 100,
          allowed_execution_percent: 100,
        },
        actions: { enabled: false, enabled_families: [] },
      });

      const capabilities = await client.callTool({
        name: 'get_eve_capabilities',
        arguments: { implementation: 'available' },
      });
      assertTextMatchesStructured(capabilities);
      const capabilitiesEnvelope = getEveCapabilitiesOutputSchema.parse(capabilities.structuredContent);
      if (!('data' in capabilitiesEnvelope)) throw new Error('Expected a successful capability result.');
      expect(capabilitiesEnvelope.data.connection.status).toBe('not_connected');
      expect(capabilitiesEnvelope.data.capabilities).toHaveLength(64);
      expect(capabilitiesEnvelope.data.capabilities.every((item) => item.implementation === 'available')).toBe(true);

      const unfilteredCapabilities = await client.callTool({
        name: 'get_eve_capabilities',
        arguments: {},
      });
      const unfilteredEnvelope = getEveCapabilitiesOutputSchema.parse(
        unfilteredCapabilities.structuredContent,
      );
      if (!('data' in unfilteredEnvelope)) throw new Error('Expected unfiltered capabilities.');
      expect(unfilteredEnvelope.data.summary).toMatchObject({ available: 64, disabled: 2, planned: 0 });

      const infoResource = await client.readResource({ uri: 'eve://server/info' });
      expect(infoResource.contents).toHaveLength(1);
      expect(JSON.parse(textOf(infoResource.contents[0]))).toMatchObject({
        name: 'eve-copilot-mcp',
        model_runtime_included: false,
        model_api_key_required: false,
        contract_version: 1,
      });
      const capabilitiesResource = await client.readResource({ uri: 'eve://capabilities' });
      const capabilitiesData = JSON.parse(textOf(capabilitiesResource.contents[0])) as unknown;
      expect(z.looseObject({ registry_version: z.literal(4) }).parse(capabilitiesData)).toEqual(
        unfilteredEnvelope.data,
      );
      const capabilityDetail = await client.readResource({
        uri: 'eve://capabilities/esi.get_alliances',
      });
      expect(JSON.parse(textOf(capabilityDetail.contents[0]))).toMatchObject({
        capability_id: 'esi.get_alliances',
        operation_id: 'GetAlliances',
        implementation: 'available',
        available: true,
      });

      for (const invalidRequest of [
        { name: 'get_server_status', arguments: { unexpected: true } },
        { name: 'get_server_diagnostics', arguments: { include: ['invalid'] } },
        { name: 'get_eve_capabilities', arguments: { domain: 'invalid' } },
        { name: 'get_eve_capabilities', arguments: { limit: 0 } },
      ]) {
        const invalid = await client.callTool(invalidRequest);
        expect(invalid.isError).toBe(true);
        expect(invalid.structuredContent).toBeUndefined();
      }

      const invalidCursor = await client.callTool({
        name: 'get_eve_capabilities',
        arguments: { cursor: 'not-an-opaque-cursor' },
      });
      expect(invalidCursor.isError).toBe(true);
      expect(invalidCursor.structuredContent).toMatchObject({
        error: { code: 'AMBIGUOUS_INPUT', retryable: false },
      });

      const overviewWithoutCharacter = await client.callTool({
        name: 'get_character_overview',
        arguments: {},
      });
      expect(overviewWithoutCharacter).toMatchObject({
        isError: true,
        structuredContent: { error: { code: 'CHARACTER_NOT_SELECTED', retryable: false } },
      });
      for (const foundationOutputSchema of [
        executeEveReadOutputSchema,
        findEveCapabilitiesOutputSchema,
        semanticReadOutputSchema,
        prepareEveActionOutputSchema,
        executeEveActionOutputSchema,
      ]) {
        expect(foundationOutputSchema.safeParse(overviewWithoutCharacter.structuredContent).success).toBe(true);
      }
      expect(stderr.join('')).not.toContain('Fatal startup error');
    } finally {
      await client.close();
    }
  }, 20_000);
});

function assertTextMatchesStructured(result: {
  readonly content: readonly unknown[];
  readonly structuredContent?: unknown;
}): void {
  expect(result.structuredContent).toBeDefined();
  const first = result.content[0] as { readonly type?: unknown; readonly text?: unknown } | undefined;
  expect(first?.type).toBe('text');
  expect(typeof first?.text).toBe('string');
  expect(JSON.parse(String(first?.text))).toEqual(result.structuredContent);
}

function textOf(content: unknown): string {
  const parsed = z.looseObject({ text: z.string() }).parse(content);
  return parsed.text;
}
