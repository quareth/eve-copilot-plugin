import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSdeRepository } from '../../../src/infrastructure/sde/file-sde-repository.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('FileSdeRepository requirement closure', () => {
  it('returns the complete Astero diamond once in prerequisite-first order', async () => {
    const { repository } = await requirementRepository((database) => {
      insertType(database, 33468, 'Astero', 10);
      insertType(database, 3331, 'Amarr Frigate', 20);
      insertType(database, 3329, 'Gallente Frigate', 20);
      insertType(database, 3327, 'Spaceship Command', 20);
      insertEdge(database, 33468, 1, 3331, 3);
      insertEdge(database, 33468, 2, 3329, 3);
      insertEdge(database, 3331, 1, 3327, 1);
      insertEdge(database, 3329, 1, 3327, 1);
    });

    const closure = await repository.resolveTypeRequirementClosure(33468);

    expect(closure).toMatchObject({
      complete: true,
      buildNumber: 42,
      nodeCount: 3,
      edgeCount: 4,
      maximumDepth: 2,
      target: { id: 33468, name: 'Astero', published: true },
    });
    expect(closure.requirements).toEqual([
      expect.objectContaining({ order: 1, skillTypeId: 3327, requiredLevel: 1, direct: false, requiredByTypeIds: [3329, 3331] }),
      expect.objectContaining({ order: 2, skillTypeId: 3329, requiredLevel: 3, direct: true, requiredByTypeIds: [33468] }),
      expect.objectContaining({ order: 3, skillTypeId: 3331, requiredLevel: 3, direct: true, requiredByTypeIds: [33468] }),
    ]);
    expect(closure.directRequirements).toHaveLength(2);
    expect(closure.dependencyEdges).toHaveLength(4);
  });

  it('merges duplicate paths at the highest level and preserves every edge', async () => {
    const { repository } = await requirementRepository((database) => {
      insertType(database, 21667, 'Capital Projectile Turret', 20);
      insertType(database, 3300, 'Gunnery', 20);
      insertType(database, 3301, 'Small Projectile Turret', 20);
      insertType(database, 3302, 'Medium Projectile Turret', 20);
      insertType(database, 3303, 'Large Projectile Turret', 20);
      insertEdge(database, 21667, 1, 3303, 5);
      insertEdge(database, 21667, 2, 3300, 5);
      insertEdge(database, 3303, 1, 3302, 3);
      insertEdge(database, 3303, 2, 3300, 5);
      insertEdge(database, 3302, 1, 3301, 3);
      insertEdge(database, 3302, 2, 3300, 3);
      insertEdge(database, 3301, 1, 3300, 1);
    });

    const closure = await repository.resolveTypeRequirementClosure(21667);

    expect(closure.requirements.map((requirement) => [requirement.skillName, requirement.requiredLevel])).toEqual([
      ['Gunnery', 5],
      ['Small Projectile Turret', 3],
      ['Medium Projectile Turret', 3],
      ['Large Projectile Turret', 5],
    ]);
    expect(closure.requirements[0]).toMatchObject({
      requiredByTypeIds: [3301, 3302, 3303, 21667],
      direct: true,
    });
    expect(closure.dependencyEdges).toHaveLength(7);
  });

  it('keeps a level-zero edge as evidence without expanding it', async () => {
    const { repository } = await requirementRepository((database) => {
      insertType(database, 100, 'Target', 10);
      insertType(database, 200, 'Zero Skill', 20);
      insertType(database, 300, 'Hidden Prerequisite', 20);
      insertEdge(database, 100, 1, 200, 0);
      insertEdge(database, 200, 1, 300, 5);
    });

    const closure = await repository.resolveTypeRequirementClosure(100);

    expect(closure.requirements).toEqual([
      expect.objectContaining({ skillTypeId: 200, requiredLevel: 0, direct: true }),
    ]);
    expect(closure.dependencyEdges).toHaveLength(1);
    expect(closure.maximumDepth).toBe(0);
  });

  it('fails closed for cycles, self-edges, dangling targets, and non-skill targets', async () => {
    const cases: Array<readonly [string, (database: Database.Database) => void]> = [
      ['cycle', (database) => {
        insertType(database, 100, 'Target', 10);
        insertType(database, 200, 'Skill A', 20);
        insertType(database, 300, 'Skill B', 20);
        insertEdge(database, 100, 1, 200, 1);
        insertEdge(database, 200, 1, 300, 1);
        insertEdge(database, 300, 1, 200, 1);
      }],
      ['self-edge', (database) => {
        insertType(database, 100, 'Target', 10);
        insertType(database, 200, 'Skill', 20);
        insertEdge(database, 100, 1, 200, 1);
        insertEdge(database, 200, 1, 200, 1);
      }],
      ['dangling target', (database) => {
        insertType(database, 100, 'Target', 10);
        insertEdge(database, 100, 1, 999, 1);
      }],
      ['non-skill target', (database) => {
        insertType(database, 100, 'Target', 10);
        insertType(database, 200, 'Another Ship', 10);
        insertEdge(database, 100, 1, 200, 1);
      }],
    ];
    for (const [, configure] of cases) {
      const { repository } = await requirementRepository(configure);
      await expect(repository.resolveTypeRequirementClosure(100)).rejects.toMatchObject({ code: 'SDE_INVALID' });
    }
  });

  it('rejects missing and unpublished targets instead of treating them as empty closures', async () => {
    const { repository } = await requirementRepository((database) => {
      insertType(database, 100, 'Unpublished Target', 10, false);
    });
    await expect(repository.resolveTypeRequirementClosure(999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(repository.resolveTypeRequirementClosure(100)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a path deeper than the corruption limit', async () => {
    const { repository } = await requirementRepository((database) => {
      insertType(database, 100, 'Target', 10);
      for (let index = 0; index < 65; index += 1) {
        insertType(database, 1_000 + index, `Skill ${String(index)}`, 20);
        insertEdge(database, index === 0 ? 100 : 999 + index, 1, 1_000 + index, 1);
      }
    });
    await expect(repository.resolveTypeRequirementClosure(100)).rejects.toMatchObject({ code: 'RESULT_LIMIT_EXCEEDED' });
  });

  it('rejects closures above the node corruption limit', async () => {
    const { repository } = await requirementRepository((database) => {
      insertType(database, 100, 'Target', 10);
      const insertTypeStatement = database.prepare('INSERT INTO sde_types VALUES (?, ?, ?, 20, NULL, 1)');
      const insertEdgeStatement = database.prepare('INSERT INTO sde_type_requirements VALUES (?, ?, ?, 1)');
      database.transaction(() => {
        for (let index = 0; index < 4_097; index += 1) {
          const skillTypeId = 10_000 + index;
          insertTypeStatement.run(skillTypeId, `Skill ${String(index)}`, `skill ${String(index)}`);
          const sourceTypeId = index < 6 ? 100 : 10_000 + Math.floor((index - 6) / 6);
          const requirementIndex = index < 6 ? index + 1 : (index - 6) % 6 + 1;
          insertEdgeStatement.run(sourceTypeId, requirementIndex, skillTypeId);
        }
      })();
    });
    await expect(repository.resolveTypeRequirementClosure(100)).rejects.toMatchObject({ code: 'RESULT_LIMIT_EXCEEDED' });
  });

  it('rejects closures above the edge corruption limit without confusing duplicate paths with nodes', async () => {
    const { repository } = await requirementRepository((database) => {
      insertType(database, 100, 'Target', 10);
      const skillCount = 2_000;
      const terminalTypeId = 10_000 + skillCount - 1;
      const insertTypeStatement = database.prepare('INSERT INTO sde_types VALUES (?, ?, ?, 20, NULL, 1)');
      const insertEdgeStatement = database.prepare('INSERT INTO sde_type_requirements VALUES (?, ?, ?, 1)');
      database.transaction(() => {
        for (let index = 0; index < skillCount; index += 1) {
          insertTypeStatement.run(10_000 + index, `Skill ${String(index)}`, `skill ${String(index)}`);
        }
        for (let index = 0; index < skillCount; index += 1) {
          const sourceTypeId = index < 6 ? 100 : 10_000 + Math.floor((index - 6) / 6);
          const requirementIndex = index < 6 ? index + 1 : (index - 6) % 6 + 1;
          insertEdgeStatement.run(sourceTypeId, requirementIndex, 10_000 + index);
        }
        for (let index = 333; index < skillCount - 1; index += 1) {
          for (let requirementIndex = 1; requirementIndex <= 6; requirementIndex += 1) {
            insertEdgeStatement.run(10_000 + index, requirementIndex, terminalTypeId);
          }
        }
      })();
    });
    await expect(repository.resolveTypeRequirementClosure(100)).rejects.toMatchObject({ code: 'RESULT_LIMIT_EXCEEDED' });
  });

  it('isolates cached closures by active SDE build', async () => {
    const first = await requirementRepository((database) => {
      insertType(database, 100, 'Target', 10);
      insertType(database, 200, 'Skill', 20);
      insertEdge(database, 100, 1, 200, 1);
    });
    expect((await first.repository.resolveTypeRequirementClosure(100)).requirements[0]?.requiredLevel).toBe(1);

    const secondPath = join(first.directory, 'sde-43.db');
    const second = createDatabase(secondPath);
    insertType(second, 100, 'Target', 10);
    insertType(second, 200, 'Skill', 20);
    insertEdge(second, 100, 1, 200, 5);
    second.close();
    await writePointer(first.directory, 43);

    const closure = await first.repository.resolveTypeRequirementClosure(100);
    expect(closure.buildNumber).toBe(43);
    expect(closure.requirements[0]?.requiredLevel).toBe(5);
  });

  it('returns one-build evidence when activation overlaps closure resolution', async () => {
    const first = await requirementRepository((database) => {
      insertType(database, 100, 'Target 42', 10);
      insertType(database, 200, 'Skill 42', 20);
      insertType(database, 300, 'Prerequisite 42', 20);
      insertEdge(database, 100, 1, 200, 3);
      insertEdge(database, 200, 1, 300, 1);
    });
    const next = createDatabase(join(first.directory, 'sde-43.db'));
    insertType(next, 100, 'Target 43', 10);
    insertType(next, 200, 'Skill 43', 20);
    insertEdge(next, 100, 1, 200, 5);
    next.close();

    const inFlight = first.repository.resolveTypeRequirementClosure(100);
    await writePointer(first.directory, 43);
    const closure = await inFlight;

    expect(closure.buildNumber).toBe(42);
    expect(closure.target.name).toBe('Target 42');
    expect(closure.requirements.map((requirement) => requirement.skillName)).toEqual([
      'Prerequisite 42',
      'Skill 42',
    ]);
    expect((await first.repository.resolveTypeRequirementClosure(100)).buildNumber).toBe(43);
  });
});

async function requirementRepository(
  configure: (database: Database.Database) => void,
): Promise<{ readonly directory: string; readonly repository: FileSdeRepository }> {
  const directory = await mkdtemp(join(tmpdir(), 'eve-sde-closure-'));
  directories.push(directory);
  const database = createDatabase(join(directory, 'sde-42.db'));
  configure(database);
  database.close();
  await writePointer(directory, 42);
  return { directory, repository: new FileSdeRepository(directory) };
}

function createDatabase(path: string): Database.Database {
  const database = new Database(path);
  database.exec(`
    CREATE TABLE sde_categories (category_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, published INTEGER NOT NULL) STRICT;
    CREATE TABLE sde_groups (group_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, category_id INTEGER NOT NULL, published INTEGER NOT NULL) STRICT;
    CREATE TABLE sde_market_groups (market_group_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, parent_market_group_id INTEGER) STRICT;
    CREATE TABLE sde_types (type_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, group_id INTEGER NOT NULL, market_group_id INTEGER, published INTEGER NOT NULL) STRICT;
    CREATE TABLE sde_type_requirements (type_id INTEGER NOT NULL, requirement_index INTEGER NOT NULL, skill_type_id INTEGER NOT NULL, level INTEGER NOT NULL, PRIMARY KEY (type_id, requirement_index)) STRICT;
    INSERT INTO sde_categories VALUES (6, 'Ship', 'ship', 1), (16, 'Skill', 'skill', 1);
    INSERT INTO sde_groups VALUES (10, 'Ship Group', 'ship group', 6, 1), (20, 'Skill Group', 'skill group', 16, 1);
  `);
  return database;
}

function insertType(
  database: Database.Database,
  typeId: number,
  name: string,
  groupId: number,
  published = true,
): void {
  database.prepare('INSERT INTO sde_types VALUES (?, ?, ?, ?, NULL, ?)')
    .run(typeId, name, name.toLocaleLowerCase('en-US'), groupId, published ? 1 : 0);
}

function insertEdge(
  database: Database.Database,
  sourceTypeId: number,
  requirementIndex: number,
  skillTypeId: number,
  level: number,
): void {
  database.prepare('INSERT INTO sde_type_requirements VALUES (?, ?, ?, ?)')
    .run(sourceTypeId, requirementIndex, skillTypeId, level);
}

async function writePointer(directory: string, buildNumber: number): Promise<void> {
  const staging = join(directory, `.active-${String(buildNumber)}.json`);
  await writeFile(staging, `${JSON.stringify({
    version: 2,
    build_number: buildNumber,
    release_date: '2026-08-20T11:08:35Z',
    database_path_token: `sde-${String(buildNumber)}.db`,
  })}\n`, { mode: 0o600 });
  await rename(staging, join(directory, 'active.json'));
}
