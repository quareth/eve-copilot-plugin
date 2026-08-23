import { createHash } from 'node:crypto';
import type { Migration } from '../migrate.js';

const SQL = `
CREATE TABLE system_state (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE local_audit_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at     TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  outcome         TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  request_id      TEXT,
  capability_id   TEXT,
  character_id    INTEGER,
  details_json    TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_local_audit_events_occurred_at
  ON local_audit_events (occurred_at);

CREATE INDEX idx_local_audit_events_request_id
  ON local_audit_events (request_id);
`;

export const foundationMigration: Migration = {
  id: 1,
  name: 'foundation',
  checksum: createHash('sha256').update(SQL).digest('hex'),
  up(db): void {
    db.exec(SQL);
  },
};
