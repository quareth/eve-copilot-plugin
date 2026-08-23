import { describe, expect, it } from 'vitest';
import type { CharacterRepository } from '../../../src/application/ports/character-repository.js';
import type { ConnectedCharacter, VerifiedCharacterInput } from '../../../src/domain/character.js';
import { buildEsiOperationCatalog } from '../../../src/capabilities/operation-catalog.js';
import type { ConnectCharacter, ConnectCharacterInput } from '../../../src/application/services/connect-character.js';
import { ReauthorizeCharacter } from '../../../src/application/services/reauthorize-character.js';
import type { ConnectionSessionData } from '../../../src/application/dto/identity.js';
import type { ResultEnvelope } from '../../../src/domain/result.js';
import { ESI_SCOPE_BUNDLES } from '../../../src/capabilities/generated/scope-bundles.js';

const signal = new AbortController().signal;

describe('ReauthorizeCharacter', () => {
  it('requests only current grants, core context, and the exact selected capability scopes', async () => {
    const starter = new CapturingConnectionStarter();
    const service = new ReauthorizeCharacter({
      connect: starter,
      characters: new OneCharacterRepository(),
      catalog: buildEsiOperationCatalog(),
    });
    await service.execute({
      character_id: 2112625428,
      open_browser: false,
      capability_id: 'esi.post_ui_openwindow_information',
    }, { requestId: 'request-1', signal });
    expect(starter.lastInput?.requested_scopes).toEqual([
      'esi-location.read_location.v1',
      'esi-location.read_ship_type.v1',
      'esi-skills.read_skills.v1',
      'esi-ui.open_window.v1',
    ]);
    expect(starter.lastInput?.requested_scopes).not.toContain('esi-ui.write_waypoint.v1');
    expect(starter.lastInput?.reauthorize_character_id).toBe(2112625428);
  });

  it('rejects unknown capabilities before opening an authorization flow', () => {
    const starter = new CapturingConnectionStarter();
    const service = new ReauthorizeCharacter({
      connect: starter,
      characters: new OneCharacterRepository(),
      catalog: buildEsiOperationCatalog(),
    });
    expect(() => service.execute({
      character_id: 2112625428,
      open_browser: false,
      capability_id: 'esi.not_registered',
    }, { requestId: 'request-1', signal })).toThrow(expect.objectContaining({ code: 'CAPABILITY_UNAVAILABLE' }));
    expect(starter.lastInput).toBeNull();
  });

  it('requests the reviewed union for a direct semantic tool without unrelated scopes', async () => {
    const starter = new CapturingConnectionStarter();
    const service = new ReauthorizeCharacter({
      connect: starter,
      characters: new OneCharacterRepository(),
      catalog: buildEsiOperationCatalog(),
    });
    await service.execute({
      character_id: 2112625428,
      open_browser: false,
      capability_id: 'get_clones_and_implants',
    }, { requestId: 'request-1', signal });
    expect(starter.lastInput?.requested_scopes).toEqual([
      'esi-clones.read_clones.v1',
      'esi-clones.read_implants.v1',
      'esi-location.read_location.v1',
      'esi-location.read_ship_type.v1',
      'esi-skills.read_skills.v1',
    ]);
    expect(starter.lastInput?.requested_scopes).not.toContain('esi-mail.read_mail.v1');
  });

  it('can explicitly request every reviewed read scope without adding action scopes', async () => {
    const starter = new CapturingConnectionStarter();
    const service = new ReauthorizeCharacter({
      connect: starter,
      characters: new OneCharacterRepository(),
      catalog: buildEsiOperationCatalog(),
    });
    await service.execute({
      character_id: 2112625428,
      open_browser: false,
      scope_mode: 'all_reads',
    }, { requestId: 'request-1', signal });
    const expectedReadScopes: string[] = [...new Set<string>(ESI_SCOPE_BUNDLES
      .filter((bundle) => bundle.kind === 'read')
      .flatMap((bundle) => bundle.scopes))].sort();
    expect(starter.lastInput?.requested_scopes).toEqual(expectedReadScopes);
    const actionOnlyScopes: string[] = [...new Set<string>(ESI_SCOPE_BUNDLES
      .filter((bundle) => bundle.kind === 'action')
      .flatMap((bundle) => bundle.scopes))]
      .filter((scope) => !expectedReadScopes.includes(scope));
    for (const scope of actionOnlyScopes) {
      expect(starter.lastInput?.requested_scopes).not.toContain(scope);
    }
  });

  it('rejects combining one capability with all-read authorization', () => {
    const starter = new CapturingConnectionStarter();
    const service = new ReauthorizeCharacter({
      connect: starter,
      characters: new OneCharacterRepository(),
      catalog: buildEsiOperationCatalog(),
    });
    expect(() => service.execute({
      character_id: 2112625428,
      open_browser: false,
      capability_id: 'get_clones_and_implants',
      scope_mode: 'all_reads',
    }, { requestId: 'request-1', signal })).toThrow(expect.objectContaining({ code: 'AMBIGUOUS_INPUT' }));
    expect(starter.lastInput).toBeNull();
  });
});

class CapturingConnectionStarter implements Pick<ConnectCharacter, 'execute'> {
  lastInput: ConnectCharacterInput | null = null;
  execute(input: ConnectCharacterInput): Promise<ResultEnvelope<ConnectionSessionData>> {
    this.lastInput = input;
    return Promise.resolve({
      schema_version: 1,
      request_id: '00000000-0000-4000-8000-000000000001',
      character: null,
      data: {
        session_id: '00000000-0000-4000-8000-000000000002',
        state: 'pending',
        authorization_url: 'https://login.eveonline.com/',
        expires_at: '2026-08-20T10:10:00.000Z',
        requested_scopes: input.requested_scopes ?? [],
        browser_opened: false,
        character: null,
        next_step: 'Complete authorization.',
      },
      source: { kind: 'local', name: 'test' },
      retrieved_at: '2026-08-20T10:00:00.000Z',
      expires_at: null,
      cache: 'not_applicable',
      estimated: false,
      partial: false,
      warnings: [],
    });
  }
}

class OneCharacterRepository implements CharacterRepository {
  readonly #character: ConnectedCharacter = Object.freeze({
    characterId: 2112625428,
    verifiedName: 'Test Pilot',
    status: 'connected',
    credentialReference: 'credential-ref',
    authorizationGeneration: 1,
    grantedScopes: Object.freeze(['esi-skills.read_skills.v1']),
    selected: true,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
    lastVerifiedAt: '2026-08-20T10:00:00.000Z',
  });
  list(): readonly ConnectedCharacter[] { return [this.#character]; }
  find(characterId: number): ConnectedCharacter | null { return characterId === this.#character.characterId ? this.#character : null; }
  selected(): ConnectedCharacter { return this.#character; }
  connect(_input: VerifiedCharacterInput): ConnectedCharacter { throw new Error('Not used.'); }
  replaceGrant(_input: VerifiedCharacterInput): { readonly character: ConnectedCharacter; readonly previousCredentialReference: string } { throw new Error('Not used.'); }
  recordRefresh(_input: { readonly characterId: number; readonly verifiedName: string; readonly grantedScopes: readonly string[]; readonly verifiedAt: string }): ConnectedCharacter { throw new Error('Not used.'); }
  select(_characterId: number, _selectedAt: string): ConnectedCharacter { throw new Error('Not used.'); }
  markReauthorizationRequired(_characterId: number, _updatedAt: string): ConnectedCharacter { throw new Error('Not used.'); }
  beginRemoval(_characterId: number, _updatedAt: string): { readonly character: ConnectedCharacter; readonly selectionCleared: boolean } { throw new Error('Not used.'); }
  completeRemoval(_characterId: number): boolean { throw new Error('Not used.'); }
}
