/**
 * Entity generation — builds orgs, departments, teams, people, projects.
 *
 * @module libterrain/engine/entities
 */

import {
  GREEK_NAMES,
  MANAGER_NAMES,
  toGithubUsername,
  toEmail,
} from "./names.js";
import { createSeededRNG } from "./rng.js";

/**
 * Build all entities from AST and RNG.
 * @param {import('../dsl/parser.js').TerrainAST} ast
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object} [logger] - Logger instance for warnings
 * @returns {{ orgs: object[], departments: object[], teams: object[], people: object[], projects: object[] }}
 */
export function buildEntities(ast, rng, logger) {
  const domain = ast.domain;
  const orgs = ast.orgs.map((o) => ({
    ...o,
    iri: `https://${domain}/id/org/${o.id}`,
  }));
  const departments = ast.departments.map((d) => ({
    ...d,
    iri: `https://${domain}/id/department/${d.id}`,
  }));
  const teams = ast.teams.map((t) => ({
    ...t,
    repos: t.repos || [],
    iri: `https://${domain}/id/team/${t.id}`,
    getdx_team_id: `gdx_team_${t.id}`,
  }));
  const people = generatePeople(ast, rng, teams, domain, logger);
  const projects = ast.projects.map((p) => ({
    ...p,
    teams: p.teams || [],
    phase: p.phase || null,
    prose_topic: p.prose_topic || null,
    prose_tone: p.prose_tone || null,
    iri: `https://${domain}/id/project/${p.id}`,
  }));

  return { orgs, departments, teams, people, projects };
}

function pickArchetype(rng, archetypeKeys, archetypeWeights) {
  return archetypeKeys.length
    ? archetypeKeys[rng.weightedPick(archetypeWeights)]
    : "steady_contributor";
}

function createManagers(
  rng,
  teams,
  managerAssignments,
  discKeys,
  discWeights,
  archetypeKeys,
  archetypeWeights,
  domain,
) {
  const people = [];
  for (const team of teams) {
    if (!team.manager) continue;
    const name = managerAssignments.get(team.id);
    const archetype = pickArchetype(rng, archetypeKeys, archetypeWeights);
    people.push(
      makePerson(
        name,
        rng.pick(["J070", "J080", "J090"]),
        discKeys[rng.weightedPick(discWeights)] || "software_engineering",
        team,
        domain,
        true,
        null,
        undefined,
        archetype,
      ),
    );
  }
  return people;
}

function fillRemainingPeople(
  rng,
  people,
  count,
  available,
  levelKeys,
  levelWeights,
  discKeys,
  discWeights,
  archetypeKeys,
  archetypeWeights,
  teams,
  domain,
) {
  let idx = 0;
  while (people.length < count && idx < available.length) {
    const name = available[idx++];
    const level = levelKeys[rng.weightedPick(levelWeights)];
    const disc = discKeys[rng.weightedPick(discWeights)];
    const team = rng.pick(teams);
    const mgr = people.find((p) => p.is_manager && p.team_id === team.id);
    const archetype = pickArchetype(rng, archetypeKeys, archetypeWeights);
    people.push(
      makePerson(
        name,
        level,
        disc,
        team,
        domain,
        false,
        mgr?.email || null,
        `2023-${pad2(rng.randomInt(1, 12))}-${pad2(rng.randomInt(1, 28))}`,
        archetype,
      ),
    );
  }
}

function generatePeople(ast, rng, teams, domain, logger) {
  // Use an isolated RNG seeded from ast.seed so people allocation is
  // stable regardless of how much entropy upstream phases consumed
  // before this point. The shared `rng` parameter is kept for signature
  // compatibility but unused.
  void rng;
  const peopleRng = createSeededRNG(`${ast.seed}:people`);

  const { count, distribution, disciplines, archetypes } = ast.people;
  const archetypeKeys = archetypes ? Object.keys(archetypes) : [];
  const archetypeWeights = archetypes ? Object.values(archetypes) : [];
  const usedNames = new Set();

  const managerAssignments = new Map();
  for (const team of teams) {
    if (team.manager) {
      const name = MANAGER_NAMES[team.manager] || team.manager;
      managerAssignments.set(team.id, name);
      usedNames.add(name);
    }
  }

  const levelKeys = Object.keys(distribution);
  const levelWeights = Object.values(distribution);
  const discKeys = Object.keys(disciplines);
  const discWeights = Object.values(disciplines);
  const available = peopleRng.shuffle(
    GREEK_NAMES.filter((n) => !usedNames.has(n)),
  );

  const people = createManagers(
    peopleRng,
    teams,
    managerAssignments,
    discKeys,
    discWeights,
    archetypeKeys,
    archetypeWeights,
    domain,
  );
  fillRemainingPeople(
    peopleRng,
    people,
    count,
    available,
    levelKeys,
    levelWeights,
    discKeys,
    discWeights,
    archetypeKeys,
    archetypeWeights,
    teams,
    domain,
  );

  // Department directors sit one level above the team managers. Each is a real
  // organization_people row (so the recursive get_team resolves the union of a
  // department's teams from the director's email); the department's team
  // managers are re-pointed to report to it. Directors carry no team_id or
  // getdx_team_id — they manage across teams, not within one, so they never
  // appear as a leaf-team rollup row.
  addDepartmentDirectors(ast, teams, people, domain, available);

  if (people.length < count && logger) {
    logger.warn(
      `People shortfall: requested ${count}, generated ${people.length} (name pool exhausted)`,
    );
  }

  // Service-account rows declared in the DSL ride the same people array
  // because that is the structure downstream renderers and ingestion
  // already iterate. The `kind` discriminator keeps them distinguishable
  // from human rows for filters and the DB check constraint.
  for (const sa of ast.people.service_accounts ?? []) {
    people.push(makeServiceAccount(sa, domain));
  }

  return people;
}

/**
 * For each department that declares a `director`, append a director person and
 * re-point that department's team managers to report to it. Mutates `people`.
 *
 * Directors are additive: the fill pass runs identically with or without a
 * director declared, so every generated person is byte-identical to a run with
 * no director. The only conflict is a name collision — a director's
 * name-derived email may equal a fill person's email (the IT director "Zeus"
 * collides with a fill engineer drawn from the same Greek-name pool). That one
 * fill person is renamed to the first pool name no person already holds (the
 * unconsumed shuffle tail), keeping the rename deterministic and leaving the
 * primary key unambiguous. No other person changes, so the prose cache stays
 * valid for every entity except the single renamed fill row.
 *
 * @param {import('../dsl/parser.js').TerrainAST} ast
 * @param {object[]} teams
 * @param {object[]} people
 * @param {string} domain
 * @param {string[]} namePool - shuffled Greek-name pool (rename source)
 */
function addDepartmentDirectors(ast, teams, people, domain, namePool = []) {
  for (const dept of ast.departments ?? []) {
    if (!dept.director) continue;
    const director = makeDirector(dept.director, dept.id, domain);

    const clash = people.find((p) => p.email === director.email);
    if (clash) renameToFreeName(clash, people, namePool, domain);

    people.push(director);

    const deptTeamIds = new Set(
      teams.filter((t) => t.department === dept.id).map((t) => t.id),
    );
    for (const p of people) {
      if (p.is_manager && deptTeamIds.has(p.team_id)) {
        p.manager_email = director.email;
      }
    }
  }
}

/**
 * Rename a person in place to the first pool name no person already holds,
 * re-deriving every name-derived field. Deterministic given the shuffled pool.
 * @param {object} person - person row to rename (mutated)
 * @param {object[]} people - all people (used to test name freedom)
 * @param {string[]} namePool - shuffled Greek-name pool
 * @param {string} domain
 */
function renameToFreeName(person, people, namePool, domain) {
  const takenEmails = new Set(people.map((p) => p.email));
  const replacement = namePool.find(
    (n) => !takenEmails.has(toEmail(n, domain)),
  );
  if (!replacement) {
    throw new Error(
      `No free name to resolve director collision for ${person.email}`,
    );
  }
  person.name = replacement;
  person.id = replacement.toLowerCase().replace(/\s+/g, "-");
  person.email = toEmail(replacement, domain);
  person.github = toGithubUsername(replacement);
  person.github_username = toGithubUsername(replacement);
  person.iri = `https://${domain}/id/person/${person.id}`;
}

/**
 * Resolve a director's display name: explicit DSL `name`, else the
 * MANAGER_NAMES mapping for its handle, else the bare handle.
 * @param {{handle: string, name?: string}} d
 * @returns {string}
 */
function directorName(d) {
  return d.name || MANAGER_NAMES[d.handle] || d.handle;
}

/**
 * Build a department-director person row. Directors are managers with no team
 * and no getdx_team_id (they manage across teams), so they are not leaf-team
 * rollup rows; they exist as the resolution root and the named tier identity.
 * @param {{handle: string, name?: string, title?: string, level?: string, discipline?: string}} d
 * @param {string} departmentId
 * @param {string} domain
 * @returns {object}
 */
function makeDirector(d, departmentId, domain) {
  const name = directorName(d);
  const id = name.toLowerCase().replace(/\s+/g, "-");
  return {
    id,
    name,
    email: toEmail(name, domain),
    github: toGithubUsername(name),
    github_username: toGithubUsername(name),
    discipline: d.discipline || "engineering_management",
    level: d.level || "J090",
    track: null,
    team_id: null,
    department: departmentId,
    is_manager: true,
    manager_email: null,
    hire_date: "2023-01-15",
    archetype: "steady_contributor",
    kind: "human",
    title: d.title || null,
    iri: `https://${domain}/id/person/${id}`,
  };
}

function makePerson(
  name,
  level,
  discipline,
  team,
  domain,
  isManager,
  managerEmail,
  hireDate = "2023-01-15",
  archetype = "steady_contributor",
  kind = "human",
) {
  const id = name.toLowerCase().replace(/\s+/g, "-");
  return {
    id,
    name,
    email: toEmail(name, domain),
    github: toGithubUsername(name),
    github_username: toGithubUsername(name),
    discipline,
    level,
    track: null,
    team_id: team.id,
    department: team.department,
    is_manager: isManager,
    manager_email: managerEmail,
    hire_date: hireDate,
    archetype,
    kind,
    iri: `https://${domain}/id/person/${id}`,
  };
}

// Service-account rows share organization_people with humans but carry
// no Pathway job profile. They keep the `kind`, `email`, `name`, and
// `iri` fields filled; level / manager_email / team / department are
// null because the DB check constraint enforces `level IS NULL` when
// `kind = 'service_account'`.
function makeServiceAccount(sa, domain) {
  const id = sa.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const name = sa.name || sa.id;
  const email = sa.email || `${id}@${domain}`.replace(/\s+/g, "-");
  return {
    id,
    name,
    email,
    github: null,
    github_username: null,
    discipline: "system",
    level: null,
    track: null,
    team_id: null,
    department: null,
    is_manager: false,
    manager_email: null,
    hire_date: null,
    archetype: null,
    kind: "service_account",
    iri: `https://${domain}/id/person/${id}`,
  };
}

/** @param {number} n */
function pad2(n) {
  return String(n).padStart(2, "0");
}
