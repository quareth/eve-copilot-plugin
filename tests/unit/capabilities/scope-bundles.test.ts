import { describe, expect, it } from 'vitest';
import { CORE_CHARACTER_SCOPES } from '../../../src/application/dto/identity.js';
import { ESI_OPERATION_FACTS } from '../../../src/capabilities/generated/esi-operation-facts.js';
import { ESI_SCOPE_BUNDLES } from '../../../src/capabilities/generated/scope-bundles.js';

describe('generated scope bundles', () => {
  it('assigns every private operation to one reviewed read or action bundle', () => {
    const privateOperations = ESI_OPERATION_FACTS.filter((operation) => operation.access !== 'public');
    expect(privateOperations.length).toBeGreaterThan(0);
    expect(privateOperations.map((operation) => operation.scopeBundle)).not.toContain(null);
    expect(ESI_SCOPE_BUNDLES.map((bundle) => bundle.name)).toEqual([
      'action.calendar_respond',
      'action.contacts_write',
      'action.fittings_write',
      'action.fleet_write',
      'action.mail_organize',
      'action.mail_send',
      'action.ui_actions',
      'character_profile',
      'communication',
      'core_context',
      'corporation_read',
      'economy',
      'fleet_read',
      'inventory',
    ]);
  });

  it('keeps initial context minimal and every action scope outside read bundles', () => {
    const core = requiredBundle('core_context');
    expect(core.scopes).toEqual([...CORE_CHARACTER_SCOPES].sort());
    const readScopes = new Set<string>(ESI_SCOPE_BUNDLES
      .filter((bundle) => bundle.kind === 'read')
      .flatMap((bundle) => bundle.scopes));
    const actionScopes = new Set<string>(ESI_OPERATION_FACTS
      .filter((operation) => operation.operationClass === 'action')
      .flatMap((operation) => operation.requiredScopes));
    for (const scope of actionScopes) expect(readScopes.has(scope)).toBe(false);
  });

  it('keeps sending and organizing mail independently opt-in', () => {
    expect(requiredBundle('action.mail_send').scopes).toEqual(['esi-mail.send_mail.v1']);
    expect(requiredBundle('action.mail_organize').scopes).toEqual(['esi-mail.organize_mail.v1']);
    expect(ESI_OPERATION_FACTS.find((operation) =>
      operation.operationId === 'PostCharactersCharacterIdMail')?.actionFamily).toBe('mail_send');
    expect(ESI_OPERATION_FACTS.filter((operation) =>
      operation.actionFamily === 'mail_organize')).toHaveLength(4);
  });
});

function requiredBundle(name: string): (typeof ESI_SCOPE_BUNDLES)[number] {
  const bundle = ESI_SCOPE_BUNDLES.find((entry) => entry.name === name);
  if (bundle === undefined) throw new Error(`Missing test bundle: ${name}`);
  return bundle;
}
