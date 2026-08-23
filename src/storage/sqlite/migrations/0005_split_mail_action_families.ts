import { createHash } from 'node:crypto';
import type { Migration } from '../migrate.js';

const SQL = `
ALTER TABLE action_plans RENAME TO action_plans_before_mail_family_split;

CREATE TABLE action_plans (
  plan_id                   TEXT PRIMARY KEY CHECK (length(plan_id) BETWEEN 1 AND 128),
  capability_id             TEXT NOT NULL CHECK (length(capability_id) BETWEEN 1 AND 128),
  operation_id              TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 128),
  action_family             TEXT NOT NULL CHECK (action_family IN ('calendar_respond','contacts_write','fittings_write','mail_send','mail_organize','fleet_write','ui_actions')),
  character_id              INTEGER NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  authorization_generation  INTEGER NOT NULL CHECK (authorization_generation > 0),
  arguments_json            TEXT NOT NULL CHECK (json_valid(arguments_json)),
  argument_digest           TEXT NOT NULL CHECK (length(argument_digest) = 64),
  confirmation_digest       TEXT NOT NULL CHECK (length(confirmation_digest) = 64),
  summary_json              TEXT NOT NULL CHECK (json_valid(summary_json)),
  required_scopes_json      TEXT NOT NULL CHECK (json_valid(required_scopes_json)),
  required_roles_json       TEXT NOT NULL CHECK (json_valid(required_roles_json)),
  state                     TEXT NOT NULL CHECK (state IN ('planned','executing','succeeded','failed','uncertain','expired')),
  expires_at                TEXT NOT NULL,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
) STRICT;

INSERT INTO action_plans (
  plan_id, capability_id, operation_id, action_family, character_id,
  authorization_generation, arguments_json, argument_digest,
  confirmation_digest, summary_json, required_scopes_json,
  required_roles_json, state, expires_at, created_at, updated_at
)
SELECT
  plan_id,
  capability_id,
  operation_id,
  CASE
    WHEN action_family = 'mail_write' AND operation_id = 'PostCharactersCharacterIdMail' THEN 'mail_send'
    WHEN action_family = 'mail_write' THEN 'mail_organize'
    ELSE action_family
  END,
  character_id,
  authorization_generation,
  arguments_json,
  argument_digest,
  confirmation_digest,
  summary_json,
  required_scopes_json,
  required_roles_json,
  state,
  expires_at,
  created_at,
  updated_at
FROM action_plans_before_mail_family_split;

DROP TABLE action_plans_before_mail_family_split;

CREATE INDEX idx_action_plans_character_state
  ON action_plans (character_id, state, expires_at);
`;

export const splitMailActionFamiliesMigration: Migration = {
  id: 5,
  name: 'split_mail_action_families',
  checksum: createHash('sha256').update(SQL).digest('hex'),
  up(db): void {
    db.exec(SQL);
  },
};
