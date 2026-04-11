/**
 * Structural risk detection.
 *
 * Summit surfaces three categories of structural risk from a team's
 * aggregated `TeamCoverage`:
 *
 * 1. Single points of failure — skills where exactly one person holds
 *    working+ proficiency.
 * 2. Critical gaps — skills the team's discipline/track composition
 *    suggests it needs but nobody holds at working+.
 * 3. Concentration risks — multiple engineers clustered at the same
 *    level in the same capability at the same proficiency.
 *
 * All functions are pure transformations over already-computed
 * coverage — no new aggregation pass is needed.
 */

import { expandModifiersToSkills } from "@forwardimpact/libskill/modifiers";

/**
 * Minimum engineer count for a concentration risk to register. Exposed
 * as a constant so it can be tuned without touching the detector body.
 */
export const CONCENTRATION_THRESHOLD = 3;

/**
 * @typedef {object} SingleFailureRisk
 * @property {string} skillId
 * @property {string} skillName
 * @property {{ email?: string, name?: string, proficiency: string, allocation: number }} holder
 * @property {"low"|"medium"|"high"} severity
 */

/**
 * @typedef {object} CriticalGap
 * @property {string} skillId
 * @property {string} skillName
 * @property {string} capabilityId
 * @property {string} reason
 */

/**
 * @typedef {object} ConcentrationRisk
 * @property {string} capabilityId
 * @property {string} level
 * @property {string} proficiency
 * @property {number} count
 * @property {number} totalMembers
 */

/**
 * @typedef {object} TeamRisks
 * @property {SingleFailureRisk[]} singlePointsOfFailure
 * @property {CriticalGap[]} criticalGaps
 * @property {ConcentrationRisk[]} concentrationRisks
 */

/**
 * Orchestrator — run all three detectors and return a combined
 * `TeamRisks` object.
 *
 * @param {object} params
 * @param {import("./coverage.js").ResolvedTeam} params.resolvedTeam
 * @param {import("./coverage.js").TeamCoverage} params.coverage
 * @param {object} params.data - Loaded Map data.
 * @returns {TeamRisks}
 */
export function detectRisks({ resolvedTeam, coverage, data }) {
  return {
    singlePointsOfFailure: detectSinglePointsOfFailure(coverage),
    criticalGaps: detectCriticalGaps(resolvedTeam, coverage, data),
    concentrationRisks: detectConcentrationRisks(resolvedTeam, coverage, data),
  };
}

/**
 * Detect skills where exactly one person holds working+ proficiency.
 *
 * @param {import("./coverage.js").TeamCoverage} coverage
 * @returns {SingleFailureRisk[]}
 */
export function detectSinglePointsOfFailure(coverage) {
  const risks = [];
  for (const skill of coverage.skills.values()) {
    if (skill.headcountDepth !== 1) continue;
    const holder = skill.holders.find(
      (h) => h.proficiency && isAtWorkingOrAbove(h.proficiency),
    );
    if (!holder) continue;
    risks.push({
      skillId: skill.skillId,
      skillName: skill.skillName,
      holder: { ...holder },
      severity: severityForAllocation(holder.allocation ?? 1.0),
    });
  }
  return risks.sort((a, b) => {
    const byTier = severityRank(b.severity) - severityRank(a.severity);
    if (byTier !== 0) return byTier;
    return a.skillId.localeCompare(b.skillId);
  });
}

/**
 * Detect critical gaps — skills the team's composition implies it
 * needs, but where no member holds working+ proficiency.
 *
 * The "needed" set is the union of each member's discipline core +
 * supporting + broad skills, plus any skills in capabilities where the
 * member's track applies a positive modifier.
 *
 * @param {import("./coverage.js").ResolvedTeam} resolvedTeam
 * @param {import("./coverage.js").TeamCoverage} coverage
 * @param {object} data
 * @returns {CriticalGap[]}
 */
export function detectCriticalGaps(resolvedTeam, coverage, data) {
  const disciplines = new Map((data.disciplines ?? []).map((d) => [d.id, d]));
  const tracks = new Map((data.tracks ?? []).map((t) => [t.id, t]));
  const skills = data.skills ?? [];

  const needed = collectNeededSkills(
    resolvedTeam,
    disciplines,
    tracks,
    skills,
  );
  return buildCriticalGaps(needed, coverage);
}

function collectNeededSkills(resolvedTeam, disciplines, tracks, skills) {
  const needed = new Map();
  for (const member of resolvedTeam.members) {
    const discipline = disciplines.get(member.job.discipline);
    if (!discipline) continue;
    addDisciplineSkills(needed, discipline);
    addTrackSkills(needed, member, tracks, skills);
  }
  return needed;
}

function addDisciplineSkills(needed, discipline) {
  for (const skillId of discipline.coreSkills ?? []) {
    needed.set(skillId, `core skill for ${discipline.id} discipline`);
  }
  for (const skillId of discipline.supportingSkills ?? []) {
    if (!needed.has(skillId)) {
      needed.set(skillId, `supporting skill for ${discipline.id} discipline`);
    }
  }
  for (const skillId of discipline.broadSkills ?? []) {
    if (!needed.has(skillId)) {
      needed.set(skillId, `broad skill for ${discipline.id} discipline`);
    }
  }
}

function addTrackSkills(needed, member, tracks, skills) {
  if (!member.job.track) return;
  const track = tracks.get(member.job.track);
  if (!track || !track.skillModifiers) return;
  const expanded = expandModifiersToSkills({
    skillModifiers: track.skillModifiers,
    skills,
  });
  for (const [skillId, modifier] of Object.entries(expanded)) {
    if (modifier > 0 && !needed.has(skillId)) {
      needed.set(
        skillId,
        `${member.job.track} track raises ${skillId} as a broad skill`,
      );
    }
  }
}

function buildCriticalGaps(needed, coverage) {
  const gaps = [];
  for (const [skillId, reason] of needed) {
    const skill = coverage.skills.get(skillId);
    if (!skill) continue;
    if (skill.headcountDepth === 0) {
      gaps.push({
        skillId,
        skillName: skill.skillName,
        capabilityId: skill.capabilityId,
        reason,
      });
    }
  }
  return gaps.sort((a, b) => a.skillId.localeCompare(b.skillId));
}

/**
 * Detect concentration risks — (level, capability, proficiency) buckets
 * with three or more team members all clustered together.
 *
 * @param {import("./coverage.js").ResolvedTeam} resolvedTeam
 * @param {import("./coverage.js").TeamCoverage} coverage
 * @param {object} data
 * @returns {ConcentrationRisk[]}
 */
export function detectConcentrationRisks(resolvedTeam, coverage, data) {
  const totalMembers = resolvedTeam.members.length;
  if (totalMembers < CONCENTRATION_THRESHOLD) return [];

  const skillToCapability = new Map();
  for (const skill of data.skills ?? []) {
    skillToCapability.set(skill.id, skill.capability);
  }

  // Bucket: level -> capability -> proficiency -> Set<email>
  const buckets = new Map();
  for (const member of resolvedTeam.members) {
    const levelId = member.job.level;
    for (const entry of member.matrix) {
      const capabilityId = skillToCapability.get(entry.skillId);
      if (!capabilityId) continue;
      if (!isAtWorkingOrAbove(entry.proficiency)) continue;
      const key = `${levelId}|${capabilityId}|${entry.proficiency}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          levelId,
          capabilityId,
          proficiency: entry.proficiency,
          people: new Set(),
        });
      }
      buckets.get(key).people.add(member.email);
    }
  }

  const risks = [];
  for (const bucket of buckets.values()) {
    if (bucket.people.size >= CONCENTRATION_THRESHOLD) {
      risks.push({
        capabilityId: bucket.capabilityId,
        level: bucket.levelId,
        proficiency: bucket.proficiency,
        count: bucket.people.size,
        totalMembers,
      });
    }
  }

  // Unused params silence complexity warnings but coverage is implicit
  // (we iterate per-member matrices which are derived into coverage).
  return risks.sort((a, b) => b.count - a.count);
}

function isAtWorkingOrAbove(proficiency) {
  if (!proficiency) return false;
  return (
    proficiency === "working" ||
    proficiency === "practitioner" ||
    proficiency === "expert"
  );
}

function severityForAllocation(allocation) {
  if (allocation < 0.5) return "high";
  if (allocation < 1.0) return "medium";
  return "low";
}

function severityRank(severity) {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  if (severity === "low") return 1;
  return 0;
}
