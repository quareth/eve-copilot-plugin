import type { Migration } from '../migrate.js';
import { foundationMigration } from './0001_foundation.js';
import { stageTwoContextMigration } from './0002_stage_two_context.js';
import { stageThreeExecutionMigration } from './0003_stage_three_execution.js';
import { stageThreeActionsMigration } from './0004_stage_three_actions.js';
import { splitMailActionFamiliesMigration } from './0005_split_mail_action_families.js';

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  foundationMigration,
  stageTwoContextMigration,
  stageThreeExecutionMigration,
  stageThreeActionsMigration,
  splitMailActionFamiliesMigration,
]);
