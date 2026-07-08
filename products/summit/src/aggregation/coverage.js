/**
 * Core team-coverage aggregation.
 *
 * Every analytical command in Summit reduces to "compute TeamCoverage,
 * then transform/diff/rank the result". This module is the single
 * place where a team's collective skill profile is constructed.
 *
 * All functions are pure — no I/O, no logging, no formatters. The
 * command layer is responsible for loading data and rendering output.
 */

import { deriveSkillMatrix } from "@forwardimpact/libskill/derivation";
import {
  SkillProficiency,
  getSkillProficiencyIndex,
} from "@forwardimpact/libskill/levels";

import { computeEffectiveDepth, meetsWorking } from "./depth.js";
import { TeamNotFoundError, UnknownJobFieldError } from "./errors.js";

/**
 * @typedef {object} PersonMatrix
 * @property {string} email
 * @property {string} name
 * @property {{ discipline: string, level: string, track?: string }} job
 * @property {number} allocation
 * @property {Array<object>} matrix - libskill SkillMatrixEntry[]
 */

/**
 * @typedef {object} SkillCoverage
 * @property {string} skillId
 * @property {string} skillName
 * @property {string} capabilityId
 * @property {number} headcountDepth - count of people at working+
 * @property {number} effectiveDepth - allocation-weighted depth
 * @property {string|null} maxProficiency
 * @property {Record<string, number>} distribution
 * @property {Array<{email: string, name: string, proficiency: string, allocation: number}>} holders
 */

/**
 * @typedef {object} CapabilityCoverage
 * @property {string} capabilityId
 * @property {string} capabilityName
 * @property {number} depth - count of skills in the capability at working+
 * @property {string[]} skillIds
 */

/**
 * @typedef {object} TeamCoverage
 * @property {string} teamId
 * @property {"reporting"|"project"} teamType
 * @property {number} memberCount
 * @property {number} effectiveFte
 * @property {string|null} managerEmail
 * @property {Map<string, CapabilityCoverage>} capabilities
 * @property {Map<string, SkillCoverage>} skills
 */

/**
 * @typedef {object} ResolvedTeam
 * @property {string} id
 * @property {"reporting"|"project"} type
 * @property {PersonMatrix[]} members
 * @property {number} effectiveFte
 * @property {string|null} managerEmail
 */

/**
 * Derive a PersonMatrix for a single roster member.
 *
 * @param {object} person - Roster member with `job: { discipline, level, track? }`.
 * @param {object} data - Loaded Map data.
 * @returns {PersonMatrix}
 */
export function derivePersonMatrix(person, data) {
  const discipline = (data.disciplines ?? []).find(
    (d) => d.id === person.job.discipline,
  );
  if (!discipline) {
    throw new UnknownJobFieldError("discipline", person.job.discipline);
  }
  const level = (data.levels ?? []).find((l) => l.id === person.job.level);
  if (!level) {
    throw new UnknownJobFieldError("level", person.job.level);
  }
  let track = null;
  if (person.job.track) {
    track = (data.tracks ?? []).find((t) => t.id === person.job.track);
    if (!track) {
      throw new UnknownJobFieldError("track", person.job.track);
    }
  }

  const matrix = deriveSkillMatrix({
    discipline,
    level,
    track,
    skills: data.skills ?? [],
    capabilities: data.capabilities ?? [],
  });

  return {
    email: person.email,
    name: person.name,
    job: { ...person.job },
    allocation: person.allocation ?? 1.0,
    matrix,
  };
}

/**
 * Resolve a team (reporting or project) from a roster into a form
 * suitable for aggregation.
 *
 * @param {import("../roster/yaml.js").Roster} roster
 * @param {object} data - Loaded Map data.
 * @param {object} target
 * @param {string} [target.teamId]
 * @param {string} [target.projectId]
 * @returns {ResolvedTeam}
 */
export function resolveTeam(roster, data, target) {
  const teamId = target.teamId;
  const projectId = target.projectId;

  if (projectId) {
    const project = roster.projects.get(projectId);
    if (!project) throw new TeamNotFoundError(projectId);
    const members = project.members.map((m) => derivePersonMatrix(m, data));
    return {
      id: projectId,
      type: "project",
      members,
      effectiveFte: members.reduce((sum, m) => sum + m.allocation, 0),
      managerEmail: project.managerEmail ?? null,
    };
  }

  if (!teamId) {
    throw new TeamNotFoundError("(unspecified)");
  }
  const team = roster.teams.get(teamId);
  if (!team) throw new TeamNotFoundError(teamId);
  const members = team.members.map((m) => derivePersonMatrix(m, data));
  return {
    id: teamId,
    type: "reporting",
    members,
    effectiveFte: members.length,
    managerEmail: team.managerEmail ?? null,
  };
}

/**
 * Compute team coverage from a resolved team and Map data.
 *
 * Pure and deterministic. Seeds the skill map from every skill in
 * `data.skills` so zero-coverage skills are visible in the output.
 *
 * @param {ResolvedTeam} resolvedTeam
 * @param {object} data
 * @returns {TeamCoverage}
 */
export function computeCoverage(resolvedTeam, data) {
  const skills = seedSkillMap(data.skills ?? []);

  for (const member of resolvedTeam.members) {
    accumulateMember(skills, member);
  }

  const capabilities = buildCapabilityCoverage(skills, data);

  return {
    teamId: resolvedTeam.id,
    teamType: resolvedTeam.type,
    memberCount: resolvedTeam.members.length,
    effectiveFte: resolvedTeam.effectiveFte,
    managerEmail: resolvedTeam.managerEmail ?? null,
    capabilities,
    skills,
  };
}

function seedSkillMap(skills) {
  const map = new Map();
  for (const skill of skills) {
    map.set(skill.id, {
      skillId: skill.id,
      skillName: skill.name ?? skill.id,
      capabilityId: skill.capability ?? "unassigned",
      headcountDepth: 0,
      effectiveDepth: 0,
      maxProficiency: null,
      distribution: {},
      holders: [],
    });
  }
  return map;
}

function accumulateMember(skills, member) {
  for (const entry of member.matrix) {
    const coverage = skills.get(entry.skillId);
    if (!coverage) continue;
    coverage.holders.push({
      email: member.email,
      name: member.name,
      proficiency: entry.proficiency,
      allocation: member.allocation,
    });
    coverage.distribution[entry.proficiency] =
      (coverage.distribution[entry.proficiency] ?? 0) + 1;
    if (meetsWorking(entry.proficiency)) {
      coverage.headcountDepth += 1;
      coverage.effectiveDepth += member.allocation;
    }
    coverage.maxProficiency = higherProficiency(
      coverage.maxProficiency,
      entry.proficiency,
    );
  }
}

/**
 * Compute per-capability coverage from per-skill coverage.
 *
 * A capability's `depth` is the count of its skills where
 * `headcountDepth >= 1`, per the spec's "at least one skill at
 * working+" framing.
 */
function buildCapabilityCoverage(skills, data) {
  const capabilities = new Map();
  for (const cap of data.capabilities ?? []) {
    capabilities.set(cap.id, {
      capabilityId: cap.id,
      capabilityName: cap.name ?? cap.id,
      depth: 0,
      skillIds: [],
    });
  }

  for (const skill of skills.values()) {
    let bucket = capabilities.get(skill.capabilityId);
    if (!bucket) {
      bucket = {
        capabilityId: skill.capabilityId,
        capabilityName: skill.capabilityId,
        depth: 0,
        skillIds: [],
      };
      capabilities.set(skill.capabilityId, bucket);
    }
    bucket.skillIds.push(skill.skillId);
    if (skill.headcountDepth >= 1) bucket.depth += 1;
  }

  return capabilities;
}

function higherProficiency(a, b) {
  if (!a) return b;
  if (!b) return a;
  return getSkillProficiencyIndex(a) >= getSkillProficiencyIndex(b) ? a : b;
}

// Re-exports for the aggregation barrel.
export { computeEffectiveDepth, meetsWorking };
export { SkillProficiency };
