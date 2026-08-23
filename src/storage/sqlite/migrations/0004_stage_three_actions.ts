import { createHash } from 'node:crypto';
import type { Migration } from '../migrate.js';

const SQL = `
CREATE TABLE action_plans (
  plan_id                   TEXT PRIMARY KEY CHECK (length(plan_id) BETWEEN 1 AND 128),
  capability_id             TEXT NOT NULL CHECK (length(capability_id) BETWEEN 1 AND 128),
  operation_id              TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 128),
  action_family             TEXT NOT NULL CHECK (action_family IN ('calendar_respond','contacts_write','fittings_write','mail_write','fleet_write','ui_actions')),
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

CREATE INDEX idx_action_plans_character_state
  ON action_plans (character_id, state, expires_at);

CREATE TABLE action_audit_events (
  event_id                  TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 128),
  plan_id                   TEXT NOT NULL CHECK (length(plan_id) BETWEEN 1 AND 128),
  capability_id             TEXT NOT NULL CHECK (length(capability_id) BETWEEN 1 AND 128),
  operation_id              TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 128),
  character_id              INTEGER NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  authorization_generation  INTEGER NOT NULL CHECK (authorization_generation > 0),
  state                     TEXT NOT NULL CHECK (state IN ('planned','executing','succeeded','failed','uncertain','expired')),
  target_digest             TEXT NOT NULL CHECK (length(target_digest) = 64),
  error_code                TEXT,
  created_at                TEXT NOT NULL
) STRICT;

CREATE INDEX idx_action_audit_created
  ON action_audit_events (created_at, event_id);
`;

export const stageThreeActionsMigration: Migration = {
  id: 4,
  name: 'stage_three_actions',
  checksum: createHash('sha256').update(SQL).digest('hex'),
  up(db): void {
    db.exec(SQL);
  },
};
