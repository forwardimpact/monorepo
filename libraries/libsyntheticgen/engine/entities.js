/**
 * Entity generation — builds orgs, departments, teams, people, projects.
 *
 * @module libuniverse/engine/entities
 */

import {
  GREEK_NAMES,
  MANAGER_NAMES,
  toGithubUsername,
  toEmail,
} from "./names.js";

/**
 * Build all entities from AST and RNG.
 * @param {import('../dsl/parser.js').UniverseAST} ast
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
        rng.pick(["L3", "L4", "L5"]),
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
  const available = rng.shuffle(GREEK_NAMES.filter((n) => !usedNames.has(n)));

  const people = createManagers(
    rng,
    teams,
    managerAssignments,
    discKeys,
    discWeights,
    archetypeKeys,
    archetypeWeights,
    domain,
  );
  fillRemainingPeople(
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
  );

  if (people.length < count && logger) {
    logger.warn(
      `People shortfall: requested ${count}, generated ${people.length} (name pool exhausted)`,
    );
  }

  return people;
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
    iri: `https://${domain}/id/person/${id}`,
  };
}

/** @param {number} n */
function pad2(n) {
  return String(n).padStart(2, "0");
}
