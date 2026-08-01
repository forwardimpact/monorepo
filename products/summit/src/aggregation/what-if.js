/**
 * What-if scenario simulation.
 *
 * Take a roster and a scenario. Return a new roster with the requested
 * mutation applied. The diff functions compare the coverage and risks
 * snapshots from before and after.
 *
 * All functions are pure. No function modifies the input roster.
 */

import { getNextLevel } from "@forwardimpact/libskill/progression";

import { ScenarioError, ScenarioType } from "./scenarios.js";
import { UnknownJobFieldError } from "./errors.js";

/**
 * @typedef {import("./scenarios.js").Scenario} Scenario
 * @typedef {import("../roster/yaml.js").Roster} Roster
 */

/**
 * @typedef {object} TeamDiff
 * @property {string} teamId
 * @property {"source" | "destination" | "target"} role
 * @property {{ capabilityChanges: Array<object> }} coverageDiff
 * @property {object} riskDiff
 *
 * @typedef {object} WhatIfReport
 * @property {Scenario} scenario
 * @property {TeamDiff[]} teamDiffs
 */

/**
 * Assemble a WhatIfReport from per-team snapshot pairs.
 *
 * @param {object} params
 * @param {Scenario} params.scenario
 * @param {Array<{ teamId: string, role: "source" | "destination" | "target", before: object, after: object }>} params.teams
 * @returns {WhatIfReport}
 */
export function buildWhatIfReport({ scenario, teams }) {
  return {
    scenario,
    teamDiffs: teams.map(({ teamId, role, before, after }) => ({
      teamId,
      role,
      coverageDiff: diffCoverage(before.coverage, after.coverage),
      riskDiff: diffRisks(before.risks, after.risks),
    })),
  };
}

/**
 * Apply a scenario to a roster and return the mutated copy.
 *
 * @param {Roster} roster
 * @param {object} data - Loaded Map data (promote resolves levels with it).
 * @param {Scenario} scenario
 * @returns {Roster}
 */
export function applyScenario(roster, data, scenario) {
  const clone = cloneRoster(roster);
  validateJobFields(scenario, data);

  if (scenario.type === ScenarioType.ADD) return doAdd(clone, scenario);
  if (scenario.type === ScenarioType.REMOVE) return doRemove(clone, scenario);
  if (scenario.type === ScenarioType.MOVE) return doMove(clone, scenario);
  if (scenario.type === ScenarioType.PROMOTE) {
    return doPromote(clone, scenario, data);
  }
  throw new ScenarioError(`Unknown scenario type: ${scenario.type}`);
}

/**
 * A pure diff of two TeamCoverage objects. It emits one row for each
 * skill in the union of the two inputs.
 *
 * @param {import("./coverage.js").TeamCoverage} before
 * @param {import("./coverage.js").TeamCoverage} after
 * @returns {{ capabilityChanges: Array<object> }}
 */
export function diffCoverage(before, after) {
  const skillIds = new Set([...before.skills.keys(), ...after.skills.keys()]);
  const capabilityChanges = [];
  for (const skillId of skillIds) {
    capabilityChanges.push(buildCoverageChange(skillId, before, after));
  }
  capabilityChanges.sort((x, y) => x.skillId.localeCompare(y.skillId));
  return { capabilityChanges };
}

function buildCoverageChange(skillId, before, after) {
  const b = before.skills.get(skillId);
  const a = after.skills.get(skillId);
  const beforeSnap = snapshotOf(b);
  const afterSnap = snapshotOf(a);
  return {
    skillId,
    skillName: a?.skillName ?? b?.skillName ?? skillId,
    capabilityId: a?.capabilityId ?? b?.capabilityId ?? "unassigned",
    before: beforeSnap,
    after: afterSnap,
    direction: pickDirection(beforeSnap, afterSnap),
  };
}

function snapshotOf(skill) {
  return {
    headcountDepth: skill?.headcountDepth ?? 0,
    effectiveDepth: skill?.effectiveDepth ?? 0,
    maxProficiency: skill?.maxProficiency ?? null,
  };
}

/**
 * Diff two TeamRisks objects. Produce the added, removed, and
 * unchanged sets.
 *
 * @param {import("./risks.js").TeamRisks} before
 * @param {import("./risks.js").TeamRisks} after
 * @returns {object}
 */
export function diffRisks(before, after) {
  return {
    added: {
      singlePoints: diffAdded(
        before.singlePointsOfFailure,
        after.singlePointsOfFailure,
        "skillId",
      ),
      criticalGaps: diffAdded(
        before.criticalGaps,
        after.criticalGaps,
        "skillId",
      ),
      concentrationRisks: diffAdded(
        before.concentrationRisks,
        after.concentrationRisks,
        (r) => `${r.capabilityId}|${r.level}|${r.proficiency}`,
      ),
    },
    removed: {
      singlePoints: diffAdded(
        after.singlePointsOfFailure,
        before.singlePointsOfFailure,
        "skillId",
      ),
      criticalGaps: diffAdded(
        after.criticalGaps,
        before.criticalGaps,
        "skillId",
      ),
      concentrationRisks: diffAdded(
        after.concentrationRisks,
        before.concentrationRisks,
        (r) => `${r.capabilityId}|${r.level}|${r.proficiency}`,
      ),
    },
    unchanged: {
      singlePoints: intersect(
        before.singlePointsOfFailure,
        after.singlePointsOfFailure,
        "skillId",
      ),
      criticalGaps: intersect(
        before.criticalGaps,
        after.criticalGaps,
        "skillId",
      ),
      concentrationRisks: intersect(
        before.concentrationRisks,
        after.concentrationRisks,
        (r) => `${r.capabilityId}|${r.level}|${r.proficiency}`,
      ),
    },
  };
}

function cloneRoster(roster) {
  const teams = new Map();
  for (const [id, team] of roster.teams) {
    teams.set(id, {
      ...team,
      members: team.members.map((m) => ({ ...m, job: { ...m.job } })),
    });
  }
  const projects = new Map();
  for (const [id, project] of roster.projects) {
    projects.set(id, {
      ...project,
      members: project.members.map((m) => ({ ...m, job: { ...m.job } })),
    });
  }
  return { source: roster.source, teams, projects };
}

function doAdd(roster, scenario) {
  const target = targetTeam(roster, scenario);
  const nextIndex = target.members.length + 1;
  const person = {
    name: `Hypothetical ${nextIndex}`,
    email: `__what_if_${nextIndex}@summit.local`,
    job: { ...scenario.job },
  };
  if (scenario.projectId || scenario.allocation !== undefined) {
    person.allocation = scenario.allocation ?? 1.0;
  }
  target.members.push(person);
  return roster;
}

function doRemove(roster, scenario) {
  const target = targetTeam(roster, scenario);
  const index = target.members.findIndex(
    (m) => m.name === scenario.name || m.email === scenario.name,
  );
  if (index === -1) {
    throw new ScenarioError(
      `summit: "${target.id}" has no team member named "${scenario.name}".`,
    );
  }
  target.members.splice(index, 1);
  return roster;
}

function doMove(roster, scenario) {
  const source = targetTeam(roster, scenario);
  const dest = roster.teams.get(scenario.toTeamId);
  if (!dest) {
    throw new ScenarioError(
      `summit: destination team "${scenario.toTeamId}" not found.`,
    );
  }
  if (source.type !== "reporting" || dest.type !== "reporting") {
    throw new ScenarioError(
      "summit: --move only works between reporting teams.",
    );
  }
  const index = source.members.findIndex(
    (m) => m.name === scenario.name || m.email === scenario.name,
  );
  if (index === -1) {
    throw new ScenarioError(
      `summit: "${source.id}" has no team member named "${scenario.name}".`,
    );
  }
  const [member] = source.members.splice(index, 1);
  dest.members.push(member);
  return roster;
}

function doPromote(roster, scenario, data) {
  const target = targetTeam(roster, scenario);
  const member = target.members.find(
    (m) => m.name === scenario.name || m.email === scenario.name,
  );
  if (!member) {
    throw new ScenarioError(
      `summit: "${target.id}" has no team member named "${scenario.name}".`,
    );
  }
  const levels = data.levels ?? [];
  const current = levels.find((l) => l.id === member.job.level);
  if (!current) {
    throw new UnknownJobFieldError("level", member.job.level);
  }
  const next = getNextLevel({ level: current, levels });
  if (!next) {
    throw new ScenarioError(
      `summit: ${scenario.name} is already at the top level (${current.id}). No promotion is possible.`,
    );
  }
  member.job.level = next.id;
  return roster;
}

function targetTeam(roster, scenario) {
  if (scenario.projectId) {
    const project = roster.projects.get(scenario.projectId);
    if (!project) {
      throw new ScenarioError(
        `summit: project "${scenario.projectId}" not found.`,
      );
    }
    return project;
  }
  if (scenario.teamId) {
    const team = roster.teams.get(scenario.teamId);
    if (!team) {
      throw new ScenarioError(`summit: team "${scenario.teamId}" not found.`);
    }
    return team;
  }
  throw new ScenarioError(
    "summit: scenario is missing a target team or project.",
  );
}

function validateJobFields(scenario, data) {
  if (scenario.type !== ScenarioType.ADD) return;
  if (!scenario.job) return;
  const disciplines = new Set((data.disciplines ?? []).map((d) => d.id));
  const levels = new Set((data.levels ?? []).map((l) => l.id));
  const tracks = new Set((data.tracks ?? []).map((t) => t.id));
  if (!disciplines.has(scenario.job.discipline)) {
    throw new UnknownJobFieldError("discipline", scenario.job.discipline);
  }
  if (!levels.has(scenario.job.level)) {
    throw new UnknownJobFieldError("level", scenario.job.level);
  }
  if (scenario.job.track && !tracks.has(scenario.job.track)) {
    throw new UnknownJobFieldError("track", scenario.job.track);
  }
}

function pickDirection(before, after) {
  if (after.headcountDepth > before.headcountDepth) return "up";
  if (after.headcountDepth < before.headcountDepth) return "down";
  if (after.effectiveDepth > before.effectiveDepth) return "up";
  if (after.effectiveDepth < before.effectiveDepth) return "down";
  return "same";
}

function diffAdded(from, to, keyFn) {
  const get = typeof keyFn === "function" ? keyFn : (r) => r[keyFn];
  const fromKeys = new Set(from.map(get));
  return to.filter((r) => !fromKeys.has(get(r)));
}

function intersect(a, b, keyFn) {
  const get = typeof keyFn === "function" ? keyFn : (r) => r[keyFn];
  const aKeys = new Set(a.map(get));
  return b.filter((r) => aKeys.has(get(r)));
}
