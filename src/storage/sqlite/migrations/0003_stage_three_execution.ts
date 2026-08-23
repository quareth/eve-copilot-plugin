import { createHash } from 'node:crypto';
import type { Migration } from '../migrate.js';

const SQL = `
CREATE TABLE continuation_state (
  continuation_id          TEXT PRIMARY KEY CHECK (length(continuation_id) BETWEEN 1 AND 128),
  capability_id            TEXT NOT NULL CHECK (length(capability_id) BETWEEN 1 AND 128),
  arguments_json           TEXT NOT NULL CHECK (json_valid(arguments_json)),
  item_offset              INTEGER NOT NULL CHECK (item_offset >= 0),
  page_number              INTEGER NOT NULL CHECK (page_number > 0),
  character_id             INTEGER,
  authorization_generation INTEGER,
  expires_at               TEXT NOT NULL,
  created_at               TEXT NOT NULL,
  CHECK ((character_id IS NULL) = (authorization_generation IS NULL)),
  CHECK (character_id IS NULL OR character_id > 0),
  CHECK (authorization_generation IS NULL OR authorization_generation > 0)
) STRICT;

CREATE INDEX idx_continuation_state_expiry
  ON continuation_state (expires_at, continuation_id);
`;

export const stageThreeExecutionMigration: Migration = {
  id: 3,
  name: 'stage_three_execution',
  checksum: createHash('sha256').update(SQL).digest('hex'),
  up(db): void {
    db.exec(SQL);
  },
};
