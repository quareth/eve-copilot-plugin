import { createHash } from 'node:crypto';
import type { Migration } from '../migrate.js';

const SQL = `
CREATE TABLE characters (
  character_id              INTEGER PRIMARY KEY CHECK (character_id > 0),
  verified_name             TEXT NOT NULL CHECK (length(verified_name) BETWEEN 1 AND 256),
  status                    TEXT NOT NULL CHECK (status IN ('connected', 'reauthorization_required', 'removal_pending')),
  credential_reference      TEXT NOT NULL UNIQUE CHECK (length(credential_reference) BETWEEN 1 AND 128),
  authorization_generation  INTEGER NOT NULL CHECK (authorization_generation > 0),
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  last_verified_at          TEXT NOT NULL
) STRICT;

CREATE TABLE character_scopes (
  character_id  INTEGER NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  scope         TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 256),
  granted_at    TEXT NOT NULL,
  PRIMARY KEY (character_id, scope)
) STRICT;

CREATE TABLE character_selection (
  singleton     INTEGER PRIMARY KEY CHECK (singleton = 1),
  character_id  INTEGER NOT NULL UNIQUE REFERENCES characters(character_id) ON DELETE CASCADE,
  selected_at   TEXT NOT NULL
) STRICT;

CREATE TABLE authorization_sessions (
  session_id                TEXT PRIMARY KEY CHECK (length(session_id) BETWEEN 1 AND 128),
  state_hash                BLOB NOT NULL UNIQUE CHECK (length(state_hash) = 32),
  verifier_reference        TEXT NOT NULL UNIQUE CHECK (length(verifier_reference) BETWEEN 1 AND 128),
  reauthorize_character_id  INTEGER REFERENCES characters(character_id) ON DELETE SET NULL,
  redirect_uri              TEXT NOT NULL CHECK (length(redirect_uri) BETWEEN 1 AND 2048),
  requested_scopes_json     TEXT NOT NULL CHECK (json_valid(requested_scopes_json)),
  status                    TEXT NOT NULL CHECK (status IN ('authorization_required', 'pending', 'connected', 'failed', 'expired', 'cancelled')),
  created_at                TEXT NOT NULL,
  expires_at                TEXT NOT NULL,
  consumed_at               TEXT,
  terminal_at               TEXT,
  connected_character_id    INTEGER,
  failure_code              TEXT,
  CHECK ((status IN ('authorization_required', 'pending')) = (terminal_at IS NULL)),
  CHECK ((status = 'pending') = (consumed_at IS NOT NULL AND terminal_at IS NULL) OR status <> 'pending')
) STRICT;

CREATE INDEX idx_authorization_sessions_status_expiry
  ON authorization_sessions (status, expires_at);

CREATE INDEX idx_authorization_sessions_terminal
  ON authorization_sessions (terminal_at)
  WHERE terminal_at IS NOT NULL;

CREATE TABLE coordination_leases (
  lease_key     TEXT PRIMARY KEY CHECK (length(lease_key) BETWEEN 1 AND 256),
  owner_id      TEXT NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 128),
  acquired_at   TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  attempt       INTEGER NOT NULL CHECK (attempt > 0)
) STRICT;

CREATE INDEX idx_coordination_leases_expiry
  ON coordination_leases (expires_at);

CREATE TABLE credential_cleanup (
  credential_reference  TEXT PRIMARY KEY CHECK (length(credential_reference) BETWEEN 1 AND 128),
  secret_kind           TEXT NOT NULL CHECK (secret_kind IN ('character_grant', 'pkce_verifier', 'audit_hmac_key')),
  created_at            TEXT NOT NULL,
  attempts              INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at       TEXT
) STRICT;

CREATE INDEX idx_credential_cleanup_created
  ON credential_cleanup (created_at, credential_reference);

CREATE TABLE esi_cache_entries (
  cache_key                 TEXT PRIMARY KEY CHECK (length(cache_key) = 64),
  operation_id              TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 256),
  compatibility_date        TEXT NOT NULL CHECK (length(compatibility_date) = 10),
  character_id              INTEGER,
  authorization_generation  INTEGER,
  request_variant_hash      BLOB NOT NULL CHECK (length(request_variant_hash) = 32),
  response_status           INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 599),
  etag                      TEXT,
  last_modified             TEXT,
  fresh_until               TEXT NOT NULL,
  stale_until               TEXT,
  validated_payload_json    TEXT NOT NULL CHECK (json_valid(validated_payload_json)),
  byte_size                 INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 4194304),
  accessed_at               TEXT NOT NULL,
  created_at                TEXT NOT NULL,
  CHECK ((character_id IS NULL) = (authorization_generation IS NULL)),
  CHECK (character_id IS NULL OR character_id > 0),
  CHECK (authorization_generation IS NULL OR authorization_generation > 0)
) STRICT;

CREATE INDEX idx_esi_cache_lru
  ON esi_cache_entries (accessed_at);

CREATE INDEX idx_esi_cache_character_partition
  ON esi_cache_entries (character_id, authorization_generation)
  WHERE character_id IS NOT NULL;

CREATE TABLE sde_installations (
  build_number        INTEGER PRIMARY KEY CHECK (build_number > 0),
  release_date        TEXT NOT NULL,
  source_url          TEXT NOT NULL CHECK (length(source_url) BETWEEN 1 AND 2048),
  etag                TEXT,
  last_modified       TEXT,
  sha256              TEXT NOT NULL CHECK (length(sha256) = 64),
  format              TEXT NOT NULL CHECK (format = 'jsonl'),
  importer_version    INTEGER NOT NULL CHECK (importer_version > 0),
  imported_at         TEXT NOT NULL,
  database_path_token TEXT NOT NULL UNIQUE CHECK (length(database_path_token) BETWEEN 1 AND 256),
  status              TEXT NOT NULL CHECK (status IN ('staged', 'active', 'retained', 'invalid')),
  validation_json     TEXT NOT NULL CHECK (json_valid(validation_json))
) STRICT;

CREATE UNIQUE INDEX idx_sde_one_active_build
  ON sde_installations (status)
  WHERE status = 'active';
`;

export const stageTwoContextMigration: Migration = {
  id: 2,
  name: 'stage_two_context',
  checksum: createHash('sha256').update(SQL).digest('hex'),
  up(db): void {
    db.exec(SQL);
  },
};
