/**
 * Growth alignment.
 *
 * Summit's growth pipeline identifies team gaps, ranks them by impact
 * (critical gap > SPOF reduction > coverage strengthening), then
 * matches team members as candidates for each gap based on their
 * current proficiency for that skill.
 *
 * `computeGrowthAlignment` is also exported publicly from the package
 * root — Landmark imports it and renders its output inline in health
 * views. The signature is stable across parts; Part 07 layers on evidence
 * filtering and outcome weighting through the optional `evidence` and
 * `driverScores` parameters without changing the shape.
 */

import { getSkillProficiencyIndex } from "@forwardimpact/libskill/levels";

import { computeCoverage, derivePersonMatrix } from "./coverage.js";
import { detectRisks } from "./risks.js";
import { UnknownJobFieldError } from "./errors.js";

/** Signals a contract violation in the growth alignment pipeline, such as an unknown job field on a team member. */
export class GrowthContractError extends Error {
  /** Create a GrowthContractError with a machine-readable code and optional context object. */
  constructor(code, message, context) {
    super(message);
    this.code = code;
    this.context = context;
  }
}

/**
 * @typedef {object} GrowthCandidate
 * @property {string} [email]
 * @property {string} [name]
 * @property {string} currentLevel
 * @property {string} currentProficiency
 * @property {string} targetLevel - Always "working" in Part 05.
 */

/**
 * @typedef {object} GrowthRecommendation
 * @property {string} skill - skill id (stable contract name per spec.md:583)
 * @property {"critical"|"spof-reduction"|"coverage-strengthening"} impact
 * @property {GrowthCandidate[]} candidates
 * @property {object|null} driverContext
 */

/**
 * Compute growth recommendations for a team.
 *
 * This function is Summit's public cross-product export — its
 * signature must match spec.md:575–584 exactly.
 *
 * @param {object} params
 * @param {Array<object>} params.team - Roster team members
 *   ({ email, name, job: { discipline, level, track? } }).
 * @param {object} params.mapData - Loaded Map data.
 * @param {Map<string, object>} [params.evidence] - Optional Part 07
 *   evidence map (skillId → { practitioners: Set<email>, count }).
 *   Passing `null`/`undefined` behaves as "no evidence".
 * @param {Map<string, object>} [params.driverScores] - Optional Part 07
 *   driver scores map.
 * @returns {GrowthRecommendation[]}
 */
export function computeGrowthAlignment({
  team,
  mapData,
  evidence,
  driverScores,
} = {}) {
  if (!Array.isArray(team) || team.length === 0) return [];

  const personMatrices = team.map((person) => safeDerive(person, mapData));
  const resolved = {
    id: "__growth",
    type: "reporting",
    members: personMatrices,
    effectiveFte: personMatrices.reduce((sum, m) => sum + m.allocation, 0),
    managerEmail: null,
  };
  const coverage = computeCoverage(resolved, mapData);
  const risks = detectRisks({
    resolvedTeam: resolved,
    coverage,
    data: mapData,
  });

  const criticalSkillIds = new Set(risks.criticalGaps.map((g) => g.skillId));
  const spofSkillIds = new Set(
    risks.singlePointsOfFailure.map((s) => s.skillId),
  );
  const personLookup = buildPersonLookup(personMatrices);
  const driverLookup = buildDriverLookup(mapData, driverScores);

  const recommendations = [];
  for (const skill of mapData.skills ?? []) {
    const rec = buildRecommendation({
      skill,
      coverage,
      criticalSkillIds,
      spofSkillIds,
      personMatrices,
      personLookup,
      evidence,
      driverLookup,
    });
    if (rec) recommendations.push(rec);
  }

  recommendations.sort(compareRecommendations);
  return recommendations;
}

function safeDerive(person, mapData) {
  try {
    return derivePersonMatrix(person, mapData);
  } catch (e) {
    if (e instanceof UnknownJobFieldError) {
      throw new GrowthContractError(
        `UNKNOWN_${e.field.toUpperCase()}`,
        `computeGrowthAlignment: ${person.email ?? person.name ?? "(unknown)"} has unknown ${e.field} "${e.value}".`,
        { person: person.email, field: e.field, value: e.value },
      );
    }
    throw e;
  }
}

function buildPersonLookup(personMatrices) {
  const lookup = new Map();
  for (const member of personMatrices) {
    const skillMap = new Map();
    for (const entry of member.matrix) {
      skillMap.set(entry.skillId, entry.proficiency);
    }
    lookup.set(member.email, skillMap);
  }
  return lookup;
}

function buildRecommendation({
  skill,
  coverage,
  criticalSkillIds,
  spofSkillIds,
  personMatrices,
  personLookup,
  evidence,
  driverLookup,
}) {
  const skillCoverage = coverage.skills.get(skill.id);
  if (!skillCoverage) return null;

  const impact = classifyImpact(
    skill.id,
    skillCoverage,
    criticalSkillIds,
    spofSkillIds,
  );
  if (!impact) return null;

  const alreadyPracticed = evidencedPractitioners(skill.id, evidence);
  const candidates = rankCandidates(
    skill.id,
    personMatrices,
    personLookup,
    alreadyPracticed,
  );
  if (candidates.length === 0 && impact === "coverage-strengthening") {
    return null;
  }

  return {
    skill: skill.id,
    impact,
    candidates,
    driverContext: driverLookup.get(skill.id) ?? null,
  };
}

/**
 * Build a skillId → worst driver context lookup. Each skill can
 * contribute to multiple drivers (via `data.drivers[].contributingSkills`);
 * the lookup carries the worst (lowest percentile) score.
 *
 * @param {object} data
 * @param {Map<string, object>} [driverScores]
 * @returns {Map<string, object>}
 */
function buildDriverLookup(data, driverScores) {
  const lookup = new Map();
  if (!isNonEmptyMap(driverScores)) return lookup;
  for (const driver of data.drivers ?? []) {
    const score = driverScores.get(driver.id);
    if (!score) continue;
    applyDriverScore(lookup, driver, score);
  }
  return lookup;
}

function isNonEmptyMap(value) {
  return value instanceof Map && value.size > 0;
}

function applyDriverScore(lookup, driver, score) {
  for (const skillId of driver.contributingSkills ?? []) {
    const existing = lookup.get(skillId);
    if (!existing || (score.percentile ?? 100) < (existing.percentile ?? 100)) {
      lookup.set(skillId, { driverId: driver.id, ...score });
    }
  }
}

function classifyImpact(
  skillId,
  skillCoverage,
  criticalSkillIds,
  spofSkillIds,
) {
  if (criticalSkillIds.has(skillId)) return "critical";
  if (spofSkillIds.has(skillId)) return "spof-reduction";
  if (skillCoverage.maxProficiency === "expert") return null;
  return "coverage-strengthening";
}

function evidencedPractitioners(skillId, evidence) {
  if (!evidence || !(evidence instanceof Map)) return new Set();
  const entry = evidence.get(skillId);
  if (!entry || !entry.practitioners) return new Set();
  return entry.practitioners instanceof Set
    ? entry.practitioners
    : new Set(entry.practitioners);
}

/**
 * Rank members as candidates to develop a specific skill toward working+.
 *
 * Sorted descending by current proficiency: candidates closest to "working"
 * appear first, as they require the least investment to reach the target.
 *
 * @param {string} skillId
 * @param {Array<object>} personMatrices
 * @param {Map<string, Map<string, string>>} personLookup
 * @param {Set<string>} alreadyPracticed
 * @returns {GrowthCandidate[]}
 */
export function rankCandidates(
  skillId,
  personMatrices,
  personLookup,
  alreadyPracticed = new Set(),
) {
  const candidates = [];
  for (const member of personMatrices) {
    if (alreadyPracticed.has(member.email)) continue;
    const current = personLookup.get(member.email)?.get(skillId) ?? null;
    if (!current) continue;
    if (
      getSkillProficiencyIndex(current) >= getSkillProficiencyIndex("working")
    ) {
      continue;
    }
    candidates.push({
      email: member.email,
      name: member.name,
      currentLevel: member.job.level,
      currentProficiency: current,
      targetLevel: "working",
    });
  }
  candidates.sort((a, b) => {
    const diff =
      getSkillProficiencyIndex(b.currentProficiency) -
      getSkillProficiencyIndex(a.currentProficiency);
    if (diff !== 0) return diff;
    return a.currentLevel.localeCompare(b.currentLevel);
  });
  return candidates;
}

const IMPACT_RANK = {
  critical: 0,
  "spof-reduction": 1,
  "coverage-strengthening": 2,
};

function compareRecommendations(a, b) {
  const rankDiff = IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact];
  if (rankDiff !== 0) return rankDiff;
  // Within a tier, prefer skills with the worst driver percentile.
  // Spec.md:451 — a gap aligned with a poorly-scoring GetDX driver
  // gets boosted within its impact tier.
  const aPct = a.driverContext?.percentile ?? null;
  const bPct = b.driverContext?.percentile ?? null;
  if (aPct !== null && bPct !== null && aPct !== bPct) return aPct - bPct;
  if (aPct !== null && bPct === null) return -1;
  if (bPct !== null && aPct === null) return 1;
  return a.skill.localeCompare(b.skill);
}
