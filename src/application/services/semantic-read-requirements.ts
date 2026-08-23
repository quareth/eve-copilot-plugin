import type { SemanticReadComponent } from '../dto/semantic-read.js';
import type { SdeRepository, SdeTypeRequirementClosure } from '../ports/sde-repository.js';
import { AppError } from '../../domain/errors.js';
import type { JsonValue } from '../../domain/json.js';
import {
  isJsonObject,
  numericId,
  objectNumber,
  objectResult,
} from './semantic-read-values.js';

export async function requiredRequirementClosure(
  argumentsValue: Readonly<Record<string, unknown>>,
  sde: SdeRepository | null,
): Promise<SdeTypeRequirementClosure> {
  const value = argumentsValue.type_id;
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) {
    throw new AppError({
      code: 'AMBIGUOUS_INPUT',
      safeMessage: 'check_requirements requires one positive canonical type_id.',
      details: { fields: ['type_id'] },
    });
  }
  const typeId = Number(value);
  if (!Number.isSafeInteger(typeId)) {
    throw new AppError({
      code: 'AMBIGUOUS_INPUT',
      safeMessage: 'check_requirements requires one safe canonical type_id.',
      details: { fields: ['type_id'] },
    });
  }
  if (sde === null) {
    throw new AppError({
      code: 'SDE_UNAVAILABLE',
      safeMessage: 'check_requirements requires an installed EVE SDE build.',
      details: { next_step: 'Run eve-copilot-mcp sde install.' },
    });
  }
  return sde.resolveTypeRequirementClosure(typeId);
}

export function compactRequirementComponents(
  components: readonly SemanticReadComponent[],
  closure: SdeTypeRequirementClosure,
): readonly SemanticReadComponent[] {
  const requiredSkillIds = new Set(closure.requirements.map((requirement) => requirement.skillTypeId));
  return Object.freeze(components.map((component): SemanticReadComponent => {
    let result: JsonValue;
    if (component.operation_id === 'GetCharactersCharacterIdSkills') {
      const value = isJsonObject(component.result) ? component.result.skills : undefined;
      const skills = Array.isArray(value) ? (value as readonly JsonValue[]).filter(isJsonObject) : [];
      result = Object.freeze({
        skills: Object.freeze(skills.flatMap((skill) => {
          const skillTypeId = numericId(skill.skill_id);
          if (skillTypeId === null || !requiredSkillIds.has(skillTypeId)) return [];
          return [Object.freeze({
            skill_id: skillTypeId,
            trained_skill_level: objectNumber(skill, 'trained_skill_level'),
            active_skill_level: objectNumber(skill, 'active_skill_level'),
          })];
        })),
      });
    } else if (component.operation_id === 'GetUniverseTypesTypeId') {
      result = Object.freeze({
        type_id: closure.target.id,
        name: closure.target.name,
        group_id: closure.target.groupId,
        published: closure.target.published,
      });
    } else {
      throw new Error(`Unexpected requirement component: ${component.operation_id}`);
    }
    return Object.freeze({ ...component, result, continuation: null, sde_build: closure.buildNumber });
  }));
}

export function requirementsSummary(
  components: readonly SemanticReadComponent[],
  closure: SdeTypeRequirementClosure,
): JsonValue {
  const skillComponent = objectResult(components, 'GetCharactersCharacterIdSkills');
  const skillsValue = skillComponent?.skills;
  if (!Array.isArray(skillsValue)) {
    throw new AppError({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
      safeMessage: 'EVE returned an incomplete character skill document.',
    });
  }
  const skills = (skillsValue as readonly JsonValue[]).filter(isJsonObject);
  if (skills.length !== skillsValue.length) throw invalidCharacterSkills();
  const levels = new Map<number, { readonly trained: number; readonly active: number }>();
  for (const skill of skills) {
    const id = numericId(skill.skill_id);
    const trained = objectNumber(skill, 'trained_skill_level');
    const active = objectNumber(skill, 'active_skill_level');
    if (id === null || !validSkillLevel(trained) || !validSkillLevel(active) || levels.has(id)) {
      throw invalidCharacterSkills();
    }
    levels.set(id, Object.freeze({ trained, active }));
  }
  const rows = closure.requirements.map((requirement) => {
    const character = levels.get(requirement.skillTypeId) ?? { trained: 0, active: 0 };
    const trainingGap = Math.max(requirement.requiredLevel - character.trained, 0);
    const activeGap = Math.max(requirement.requiredLevel - character.active, 0);
    const status = character.active >= requirement.requiredLevel
      ? 'satisfied'
      : character.trained >= requirement.requiredLevel
        ? 'trained_inactive'
        : character.trained > 0 || character.active > 0
          ? 'partially_trained'
          : 'missing';
    return Object.freeze({
      order: requirement.order,
      skill_type_id: requirement.skillTypeId,
      skill_name: requirement.skillName,
      required_level: requirement.requiredLevel,
      direct: requirement.direct,
      required_by_type_ids: requirement.requiredByTypeIds,
      trained_level: character.trained,
      active_level: character.active,
      training_level_gap: trainingGap,
      active_level_gap: activeGap,
      status,
    });
  });
  const directRequirements = closure.directRequirements.map((edge) => Object.freeze({
    skill_type_id: edge.skillTypeId,
    skill_name: edge.skillName,
    required_level: edge.requiredLevel,
    requirement_index: edge.requirementIndex,
  }));
  const dependencyEdges = closure.dependencyEdges.map((edge) => Object.freeze({
    source_type_id: edge.sourceTypeId,
    source_type_name: edge.sourceTypeName,
    requirement_index: edge.requirementIndex,
    skill_type_id: edge.skillTypeId,
    skill_name: edge.skillName,
    required_level: edge.requiredLevel,
    depth: edge.depth,
    direct: edge.direct,
  }));
  const skillProvenance = components.find((component) =>
    component.operation_id === 'GetCharactersCharacterIdSkills');
  return Object.freeze({
    target: Object.freeze({
      type_id: closure.target.id,
      name: closure.target.name,
      group_id: closure.target.groupId,
      group_name: closure.target.groupName,
      category_id: closure.target.categoryId,
      category_name: closure.target.categoryName,
      published: closure.target.published,
    }),
    direct_requirements: Object.freeze(directRequirements),
    dependency_edges: Object.freeze(dependencyEdges),
    requirements: Object.freeze(rows),
    requirements_satisfied: rows.every((row) => row.status === 'satisfied'),
    closure: Object.freeze({
      complete: closure.complete,
      node_count: closure.nodeCount,
      edge_count: closure.edgeCount,
      maximum_depth: closure.maximumDepth,
    }),
    provenance: Object.freeze({
      sde: Object.freeze({ build_number: closure.buildNumber }),
      esi: Object.freeze({
        operation_id: 'GetCharactersCharacterIdSkills',
        retrieved_at: skillProvenance?.retrieved_at ?? null,
        expires_at: skillProvenance?.expires_at ?? null,
        cache: skillProvenance?.cache ?? 'not_applicable',
      }),
    }),
  });
}

function validSkillLevel(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0 && value <= 5;
}

function invalidCharacterSkills(): AppError {
  return new AppError({
    code: 'UPSTREAM_CONTRACT_MISMATCH',
    safeMessage: 'EVE returned a malformed or incomplete character skill document.',
  });
}
