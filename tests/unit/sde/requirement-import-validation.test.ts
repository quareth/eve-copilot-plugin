import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { deriveAndValidateTypeRequirements } from '../../../src/infrastructure/sde/sde-requirement-import.js';

const PAIRS = [[182, 277], [183, 278], [184, 279], [1285, 1286], [1289, 1287], [1290, 1288]] as const;

describe('SDE requirement import validation', () => {
  it('decodes all six official pairs and records graph evidence', () => {
    const database = requirementDatabase();
    insertType(database, 100, 10, true);
    for (const [index, [skillAttribute, levelAttribute]] of PAIRS.entries()) {
      const skillTypeId = 200 + index;
      insertType(database, skillTypeId, 20, true);
      insertAttribute(database, 100, skillAttribute, skillTypeId);
      insertAttribute(database, 100, levelAttribute, index);
    }

    expect(deriveAndValidateTypeRequirements(database)).toMatchObject({
      type_requirements: 6,
      published_requirement_edges: 6,
      published_requirement_sources: 1,
      published_required_skill_nodes: 6,
      maximum_requirement_depth: 1,
      published_requirement_cycles: 0,
    });
    expect(database.prepare('SELECT requirement_index, level FROM sde_type_requirements ORDER BY requirement_index').all())
      .toEqual(PAIRS.map((_, index) => ({ requirement_index: index + 1, level: index })));
    database.close();
  });

  it.each([
    ['missing level', (database: Database.Database) => {
      insertType(database, 100, 10, true);
      insertAttribute(database, 100, 182, 200);
    }],
    ['missing skill', (database: Database.Database) => {
      insertType(database, 100, 10, true);
      insertAttribute(database, 100, 277, 1);
    }],
    ['fractional skill ID', (database: Database.Database) => {
      insertType(database, 100, 10, true);
      insertAttribute(database, 100, 182, 200.5);
      insertAttribute(database, 100, 277, 1);
    }],
    ['fractional level', (database: Database.Database) => {
      insertType(database, 100, 10, true);
      insertAttribute(database, 100, 182, 200);
      insertAttribute(database, 100, 277, 1.5);
    }],
    ['out-of-range level', (database: Database.Database) => {
      insertType(database, 100, 10, true);
      insertAttribute(database, 100, 182, 200);
      insertAttribute(database, 100, 277, 6);
    }],
  ])('rejects a published source with a %s pair', (_name, configure) => {
    const database = requirementDatabase();
    configure(database);
    expect(() => deriveAndValidateTypeRequirements(database)).toThrow(expect.objectContaining({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
    }));
    database.close();
  });

  it('accepts levels zero and five', () => {
    const database = requirementDatabase();
    insertType(database, 100, 10, true);
    insertType(database, 200, 20, true);
    insertType(database, 201, 20, true);
    insertAttribute(database, 100, 182, 200);
    insertAttribute(database, 100, 277, 0);
    insertAttribute(database, 100, 183, 201);
    insertAttribute(database, 100, 278, 5);
    expect(deriveAndValidateTypeRequirements(database)).toMatchObject({ type_requirements: 2 });
    database.close();
  });

  it('excludes unpublished legacy anomalies from published validation', () => {
    const database = requirementDatabase();
    insertType(database, 100, 10, false);
    insertAttribute(database, 100, 182, 999.5);
    expect(deriveAndValidateTypeRequirements(database)).toMatchObject({
      type_requirements: 0,
      published_requirement_edges: 0,
    });
    database.close();
  });

  it.each([
    ['dangling', (_database: Database.Database) => undefined],
    ['unpublished', (database: Database.Database) => { insertType(database, 200, 20, false); }],
    ['non-skill', (database: Database.Database) => { insertType(database, 200, 10, true); }],
  ])('rejects a positive %s target from a published source', (_name, target) => {
    const database = requirementDatabase();
    insertType(database, 100, 10, true);
    target(database);
    insertAttribute(database, 100, 182, 200);
    insertAttribute(database, 100, 277, 1);
    expect(() => deriveAndValidateTypeRequirements(database)).toThrow(expect.objectContaining({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
    }));
    database.close();
  });

  it('rejects published self-edges and cycles', () => {
    const self = requirementDatabase();
    insertType(self, 200, 20, true);
    insertRequirementAttributes(self, 200, 200);
    expect(() => deriveAndValidateTypeRequirements(self)).toThrow(expect.objectContaining({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
    }));
    self.close();

    const cycle = requirementDatabase();
    insertType(cycle, 200, 20, true);
    insertType(cycle, 201, 20, true);
    insertRequirementAttributes(cycle, 200, 201);
    insertRequirementAttributes(cycle, 201, 200);
    expect(() => deriveAndValidateTypeRequirements(cycle)).toThrow(expect.objectContaining({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
    }));
    cycle.close();
  });

  it('rejects a published graph above the depth corruption limit', () => {
    const database = requirementDatabase();
    insertType(database, 100, 10, true);
    for (let index = 0; index < 65; index += 1) {
      const skillTypeId = 1_000 + index;
      insertType(database, skillTypeId, 20, true);
      insertRequirementAttributes(database, index === 0 ? 100 : 999 + index, skillTypeId);
    }
    expect(() => deriveAndValidateTypeRequirements(database)).toThrow(expect.objectContaining({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
    }));
    database.close();
  });
});

function requirementDatabase(): Database.Database {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE sde_groups (group_id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL) STRICT;
    CREATE TABLE sde_types (type_id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL, published INTEGER NOT NULL) STRICT;
    CREATE TABLE sde_type_attributes (type_id INTEGER NOT NULL, attribute_id INTEGER NOT NULL, value REAL NOT NULL, PRIMARY KEY (type_id, attribute_id)) STRICT;
    CREATE TABLE sde_type_requirements (type_id INTEGER NOT NULL, requirement_index INTEGER NOT NULL, skill_type_id INTEGER NOT NULL, level INTEGER NOT NULL, PRIMARY KEY (type_id, requirement_index)) STRICT;
    INSERT INTO sde_groups VALUES (10, 6), (20, 16);
  `);
  return database;
}

function insertType(database: Database.Database, typeId: number, groupId: number, published: boolean): void {
  database.prepare('INSERT INTO sde_types VALUES (?, ?, ?)').run(typeId, groupId, published ? 1 : 0);
}

function insertAttribute(database: Database.Database, typeId: number, attributeId: number, value: number): void {
  database.prepare('INSERT INTO sde_type_attributes VALUES (?, ?, ?)').run(typeId, attributeId, value);
}

function insertRequirementAttributes(database: Database.Database, typeId: number, skillTypeId: number): void {
  insertAttribute(database, typeId, 182, skillTypeId);
  insertAttribute(database, typeId, 277, 1);
}
