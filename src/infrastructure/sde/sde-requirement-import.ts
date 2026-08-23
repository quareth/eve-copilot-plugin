import type Database from 'better-sqlite3';
import { AppError } from '../../domain/errors.js';

const REQUIREMENT_ATTRIBUTE_PAIRS = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1287],
  [1290, 1288],
] as const;

interface PublishedRequirementRow {
  readonly source_type_id: number;
  readonly skill_type_id: number;
  readonly level: number;
}

export function deriveAndValidateTypeRequirements(
  database: Database.Database,
): Readonly<Record<string, number>> {
  const malformedPair = database.prepare(`
    SELECT t.type_id
    FROM sde_types t
    LEFT JOIN sde_type_attributes skill
      ON skill.type_id = t.type_id AND skill.attribute_id = ?
    LEFT JOIN sde_type_attributes level
      ON level.type_id = t.type_id AND level.attribute_id = ?
    WHERE t.published = 1 AND (
      (skill.type_id IS NULL AND level.type_id IS NOT NULL)
      OR (skill.type_id IS NOT NULL AND level.type_id IS NULL)
      OR (skill.type_id IS NOT NULL AND (
        skill.value != CAST(skill.value AS INTEGER)
        OR skill.value <= 0
        OR level.value != CAST(level.value AS INTEGER)
        OR level.value < 0
        OR level.value > 5
      ))
    )
    LIMIT 1
  `);
  for (const [skillAttribute, levelAttribute] of REQUIREMENT_ATTRIBUTE_PAIRS) {
    if (malformedPair.get(skillAttribute, levelAttribute) !== undefined) {
      throw sdeContract('A published SDE type contains a malformed or incomplete skill requirement pair.');
    }
  }

  const insertRequirement = database.prepare(`
    INSERT INTO sde_type_requirements (type_id, requirement_index, skill_type_id, level)
    SELECT skill.type_id, ?, CAST(skill.value AS INTEGER), CAST(level.value AS INTEGER)
    FROM sde_type_attributes skill
    JOIN sde_type_attributes level ON level.type_id = skill.type_id AND level.attribute_id = ?
    WHERE skill.attribute_id = ?
      AND skill.value = CAST(skill.value AS INTEGER)
      AND skill.value > 0
      AND level.value = CAST(level.value AS INTEGER)
      AND level.value BETWEEN 0 AND 5
  `);
  let requirementCount = 0;
  for (const [index, [skillAttribute, levelAttribute]] of REQUIREMENT_ATTRIBUTE_PAIRS.entries()) {
    requirementCount += insertRequirement.run(index + 1, levelAttribute, skillAttribute).changes;
  }

  const invalidTarget = database.prepare(`
    SELECT r.type_id
    FROM sde_type_requirements r
    JOIN sde_types source ON source.type_id = r.type_id AND source.published = 1
    LEFT JOIN sde_types skill ON skill.type_id = r.skill_type_id
    LEFT JOIN sde_groups skill_group ON skill_group.group_id = skill.group_id
    WHERE r.level > 0 AND (
      skill.type_id IS NULL OR skill.published != 1
      OR skill_group.category_id IS NULL OR skill_group.category_id != 16
    )
    LIMIT 1
  `).get();
  if (invalidTarget !== undefined) {
    throw sdeContract('A published SDE requirement targets a missing, unpublished, or non-skill type.');
  }
  const selfEdge = database.prepare(`
    SELECT r.type_id
    FROM sde_type_requirements r
    JOIN sde_types source ON source.type_id = r.type_id AND source.published = 1
    WHERE r.type_id = r.skill_type_id
    LIMIT 1
  `).get();
  if (selfEdge !== undefined) throw sdeContract('The published SDE requirement graph contains a self-edge.');

  const publishedRows = database.prepare(`
    SELECT r.type_id AS source_type_id, r.skill_type_id, r.level
    FROM sde_type_requirements r
    JOIN sde_types source ON source.type_id = r.type_id AND source.published = 1
    ORDER BY r.type_id, r.requirement_index
  `).all() as PublishedRequirementRow[];
  const positiveChildren = new Map<number, number[]>();
  for (const row of publishedRows) {
    if (row.level <= 0) continue;
    const values = positiveChildren.get(row.source_type_id) ?? [];
    values.push(row.skill_type_id);
    positiveChildren.set(row.source_type_id, values);
  }
  const state = new Map<number, 'visiting' | 'complete'>();
  const depthMemo = new Map<number, number>();
  const inspect = (sourceTypeId: number, traversalDepth: number): number => {
    if (traversalDepth > 64) {
      throw sdeContract('The published SDE requirement graph exceeds the depth safety limit.');
    }
    const current = state.get(sourceTypeId);
    if (current === 'visiting') throw sdeContract('The published SDE requirement graph contains a cycle.');
    if (current === 'complete') return depthMemo.get(sourceTypeId) ?? 0;
    state.set(sourceTypeId, 'visiting');
    let maximum = 0;
    for (const skillTypeId of positiveChildren.get(sourceTypeId) ?? []) {
      maximum = Math.max(maximum, 1 + inspect(skillTypeId, traversalDepth + 1));
    }
    if (maximum > 64) throw sdeContract('The published SDE requirement graph exceeds the depth safety limit.');
    depthMemo.set(sourceTypeId, maximum);
    state.set(sourceTypeId, 'complete');
    return maximum;
  };
  let maximumDepth = 0;
  for (const sourceTypeId of positiveChildren.keys()) maximumDepth = Math.max(maximumDepth, inspect(sourceTypeId, 0));

  return Object.freeze({
    type_requirements: requirementCount,
    published_requirement_edges: publishedRows.length,
    published_requirement_sources: new Set(publishedRows.map((row) => row.source_type_id)).size,
    published_required_skill_nodes: new Set(publishedRows.map((row) => row.skill_type_id)).size,
    maximum_requirement_depth: maximumDepth,
    published_requirement_cycles: 0,
    published_requirement_invalid_targets: 0,
    published_requirement_self_edges: 0,
  });
}

function sdeContract(message: string): AppError {
  return new AppError({ code: 'UPSTREAM_CONTRACT_MISMATCH', safeMessage: message });
}
