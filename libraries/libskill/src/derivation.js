/**
 * Engineering Pathway Job Derivation Functions
 *
 * This module provides pure functions for deriving job definitions from
 * discipline, track, and level combinations.
 */

import {
  SkillType,
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
  clampSkillProficiency,
  clampBehaviourMaturity,
  skillProficiencyMeetsRequirement,
} from "./levels.js";

import { resolveSkillModifier } from "./modifiers.js";
import { ORDER_SKILL_TYPE } from "./policies/orderings.js";
import {
  THRESHOLD_SENIOR_LEVEL,
  THRESHOLD_DRIVER_SKILL_PROFICIENCY,
  THRESHOLD_DRIVER_BEHAVIOUR_MATURITY,
} from "./policies/thresholds.js";
import { isValidJobCombination as _isValidJobCombination } from "./derivation-validation.js";
import { deriveResponsibilities as _deriveResponsibilities } from "./derivation-responsibilities.js";

export { isValidJobCombination } from "./derivation-validation.js";
export { deriveResponsibilities } from "./derivation-responsibilities.js";

/**
 * Build a Map of skillId → skillType for a discipline.
 * Enables O(1) lookup instead of repeated array scans.
 * @internal Used by deriveSkillMatrix; not part of the public API.
 * @param {import('./levels.js').Discipline} discipline - The discipline
 * @returns {Map<string, string>} Map of skill ID to skill type
 */
export function buildSkillTypeMap(discipline) {
  const map = new Map();
  for (const id of discipline.coreSkills || []) {
    map.set(id, SkillType.CORE);
  }
  for (const id of discipline.supportingSkills || []) {
    map.set(id, SkillType.SUPPORTING);
  }
  for (const id of discipline.broadSkills || []) {
    map.set(id, SkillType.BROAD);
  }
  return map;
}

/**
 * Determine the skill tier (core/supporting/broad) for a skill within a discipline
 * @param {import('./levels.js').Discipline} discipline - The discipline
 * @param {string} skillId - The skill ID
 * @returns {string|null} The skill tier or null if skill not in discipline
 */
export function getSkillTypeForDiscipline({ discipline, skillId }) {
  if (discipline.coreSkills?.includes(skillId)) {
    return SkillType.CORE;
  }
  if (discipline.supportingSkills?.includes(skillId)) {
    return SkillType.SUPPORTING;
  }
  if (discipline.broadSkills?.includes(skillId)) {
    return SkillType.BROAD;
  }
  return null;
}

/**
 * Find the highest base skill proficiency index for a level
 * @param {import('./levels.js').Level} level - The level
 * @returns {number} The highest base skill proficiency index
 */
export function findMaxBaseSkillProficiency(level) {
  const coreIndex = getSkillProficiencyIndex(level.baseSkillProficiencies.core);
  const supportingIndex = getSkillProficiencyIndex(
    level.baseSkillProficiencies.supporting,
  );
  const broadIndex = getSkillProficiencyIndex(
    level.baseSkillProficiencies.broad,
  );
  return Math.max(coreIndex, supportingIndex, broadIndex);
}

/**
 * Derive the skill proficiency for a specific skill given discipline, track, and level
 * @param {Object} params
 * @param {import('./levels.js').Discipline} params.discipline - The discipline
 * @param {import('./levels.js').Track} [params.track] - The track (optional)
 * @param {import('./levels.js').Level} params.level - The level
 * @param {string} params.skillId - The skill ID
 * @param {import('./levels.js').Skill[]} params.skills - All available skills (for capability lookup)
 * @returns {string|null} The derived skill proficiency or null if skill not in discipline
 */
export function deriveSkillProficiency({
  discipline,
  level,
  track = null,
  skillId,
  skills,
}) {
  const skillType = getSkillTypeForDiscipline({ discipline, skillId });
  const effectiveType = skillType || SkillType.BROAD;
  const baseLevel = level.baseSkillProficiencies[effectiveType];
  const baseIndex = getSkillProficiencyIndex(baseLevel);

  const effectiveTrack = track || { skillModifiers: {} };
  const modifier = resolveSkillModifier({
    skillId,
    skillModifiers: effectiveTrack.skillModifiers,
    skills,
  });

  if (!skillType && modifier <= 0) {
    return null;
  }

  let modifiedIndex = baseIndex + modifier;

  if (modifier > 0) {
    const maxIndex = findMaxBaseSkillProficiency(level);
    modifiedIndex = Math.min(modifiedIndex, maxIndex);
  }

  return clampSkillProficiency(modifiedIndex);
}

/**
 * Derive the behaviour maturity for a specific behaviour given discipline, track, and level
 * @param {Object} params
 * @param {import('./levels.js').Discipline} params.discipline - The discipline
 * @param {import('./levels.js').Track} [params.track] - The track (optional)
 * @param {import('./levels.js').Level} params.level - The level
 * @param {string} params.behaviourId - The behaviour ID
 * @returns {string} The derived maturity level
 */
export function deriveBehaviourMaturity({
  discipline,
  level,
  track = null,
  behaviourId,
}) {
  const baseMaturity = level.baseBehaviourMaturity;
  const baseIndex = getBehaviourMaturityIndex(baseMaturity);
  const disciplineModifier = discipline.behaviourModifiers?.[behaviourId] ?? 0;
  const effectiveTrack = track || { behaviourModifiers: {} };
  const trackModifier = effectiveTrack.behaviourModifiers?.[behaviourId] ?? 0;
  const totalModifier = disciplineModifier + trackModifier;
  const modifiedIndex = baseIndex + totalModifier;
  return clampBehaviourMaturity(modifiedIndex);
}

/** Build a single skill matrix entry, or null if the skill doesn't qualify. */
function buildSkillEntry(skill, discipline, level, track, skills, sets) {
  const { allDiscipline, trackCaps, typeMap, capRank } = sets;
  if (!allDiscipline.has(skill.id) && !trackCaps.has(skill.capability))
    return null;
  const proficiency = deriveSkillProficiency({
    discipline,
    level,
    track,
    skillId: skill.id,
    skills,
  });
  if (proficiency === null) return null;
  return {
    skillId: skill.id,
    skillName: skill.name,
    capability: skill.capability,
    capabilityRank: capRank.get(skill.capability) ?? 0,
    isHumanOnly: skill.isHumanOnly || false,
    type: typeMap.get(skill.id) ?? SkillType.TRACK,
    proficiency,
    proficiencyDescription: skill.proficiencyDescriptions?.[proficiency] || "",
  };
}

/** Derive the complete skill matrix for a job. */
export function deriveSkillMatrix({
  discipline,
  level,
  track = null,
  skills,
  capabilities = [],
}) {
  const matrix = [];
  const effectiveTrack = track || { skillModifiers: {} };
  const sets = {
    allDiscipline: new Set([
      ...(discipline.coreSkills || []),
      ...(discipline.supportingSkills || []),
      ...(discipline.broadSkills || []),
    ]),
    trackCaps: new Set(
      Object.entries(effectiveTrack.skillModifiers || {})
        .filter(([_, modifier]) => modifier > 0)
        .map(([capability]) => capability),
    ),
    typeMap: buildSkillTypeMap(discipline),
    capRank: new Map(capabilities.map((c) => [c.id, c.ordinalRank || 0])),
  };
  for (const skill of skills) {
    const entry = buildSkillEntry(
      skill,
      discipline,
      level,
      track,
      skills,
      sets,
    );
    if (entry) matrix.push(entry);
  }

  matrix.sort((a, b) => {
    const typeCompare =
      ORDER_SKILL_TYPE.indexOf(a.type) - ORDER_SKILL_TYPE.indexOf(b.type);
    if (typeCompare !== 0) return typeCompare;
    return a.skillName.localeCompare(b.skillName);
  });

  return matrix;
}

/**
 * Derive the complete behaviour profile for a job
 * @param {Object} params
 * @param {import('./levels.js').Discipline} params.discipline - The discipline
 * @param {import('./levels.js').Level} params.level - The level
 * @param {import('./levels.js').Track} [params.track] - The track (optional)
 * @param {import('./levels.js').Behaviour[]} params.behaviours - All available behaviours
 * @returns {import('./levels.js').BehaviourProfileEntry[]} Complete behaviour profile
 */
export function deriveBehaviourProfile({
  discipline,
  level,
  track = null,
  behaviours,
}) {
  const profile = [];

  for (const behaviour of behaviours) {
    const maturity = deriveBehaviourMaturity({
      discipline,
      level,
      track,
      behaviourId: behaviour.id,
    });

    profile.push({
      behaviourId: behaviour.id,
      behaviourName: behaviour.name,
      maturity,
      maturityDescription: behaviour.maturityDescriptions?.[maturity] || "",
    });
  }

  profile.sort((a, b) => a.behaviourName.localeCompare(b.behaviourName));

  return profile;
}

/** Generate a job title from discipline, track, and level. */
export function generateJobTitle({ discipline, level, track = null }) {
  const { roleTitle, isManagement } = discipline;
  const { professionalTitle, managementTitle } = level;
  if (isManagement) {
    const base = `${managementTitle}, ${roleTitle}`;
    return track ? `${base} \u2013 ${track.name}` : base;
  }
  const prefix = professionalTitle.startsWith("Level")
    ? `${roleTitle} ${professionalTitle}`
    : `${professionalTitle} ${roleTitle}`;
  return track ? `${prefix} - ${track.name}` : prefix;
}

/** Generate a user-facing job ID from discipline, level, and track. */
export function generateJobId({ discipline, level, track = null }) {
  const base = `${discipline.id}_${level.id}`;
  return track ? `${base}_${track.id}` : base;
}

/** Create a complete job definition from discipline, level, and optional track. */
export function deriveJob({
  discipline,
  level,
  track = null,
  skills,
  behaviours,
  capabilities,
  validationRules,
}) {
  if (
    !_isValidJobCombination({
      discipline,
      level,
      track,
      validationRules,
    })
  ) {
    return null;
  }

  const skillMatrix = deriveSkillMatrix({
    discipline,
    level,
    track,
    skills,
    capabilities,
  });
  const behaviourProfile = deriveBehaviourProfile({
    discipline,
    level,
    track,
    behaviours,
  });

  let derivedResponsibilities = [];
  if (capabilities && capabilities.length > 0) {
    derivedResponsibilities = _deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });
  }

  return {
    id: generateJobId({ discipline, level, track }),
    title: generateJobTitle({ discipline, level, track }),
    discipline,
    level,
    track,
    skillMatrix,
    behaviourProfile,
    derivedResponsibilities,
    expectations: level.expectations || {},
  };
}

/** Partition skill IDs into covered and missing based on proficiency threshold. */
function partitionSkillCoverage(skillIds, proficiencyMap) {
  const covered = [];
  const missing = [];
  for (const skillId of skillIds) {
    const level = proficiencyMap.get(skillId);
    if (
      level &&
      skillProficiencyMeetsRequirement(
        level,
        THRESHOLD_DRIVER_SKILL_PROFICIENCY,
      )
    ) {
      covered.push(skillId);
    } else {
      missing.push(skillId);
    }
  }
  return { covered, missing };
}

/** Partition behaviour IDs into covered and missing based on maturity threshold. */
function partitionBehaviourCoverage(behaviourIds, maturityMap) {
  const practicingIndex = getBehaviourMaturityIndex(
    THRESHOLD_DRIVER_BEHAVIOUR_MATURITY,
  );
  const covered = [];
  const missing = [];
  for (const behaviourId of behaviourIds) {
    const maturity = maturityMap.get(behaviourId);
    if (maturity && getBehaviourMaturityIndex(maturity) >= practicingIndex) {
      covered.push(behaviourId);
    } else {
      missing.push(behaviourId);
    }
  }
  return { covered, missing };
}

/** Compute coverage ratio: 1.0 when the list is empty. */
function coverageRatio(covered, total) {
  return total > 0 ? covered / total : 1;
}

/**
 * Calculate driver coverage for a job
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').Driver[]} params.drivers - All drivers
 * @returns {import('./levels.js').DriverCoverage[]} Coverage analysis for each driver
 */
export function calculateDriverCoverage({ job, drivers }) {
  const proficiencyMap = new Map(
    job.skillMatrix.map((s) => [s.skillId, s.proficiency]),
  );
  const maturityMap = new Map(
    job.behaviourProfile.map((b) => [b.behaviourId, b.maturity]),
  );

  const coverageResults = drivers.map((driver) => {
    const contributingSkills = driver.contributingSkills || [];
    const contributingBehaviours = driver.contributingBehaviours || [];

    const skills = partitionSkillCoverage(contributingSkills, proficiencyMap);
    const behaviours = partitionBehaviourCoverage(
      contributingBehaviours,
      maturityMap,
    );

    const skillCoverage = coverageRatio(
      skills.covered.length,
      contributingSkills.length,
    );
    const behaviourCoverage = coverageRatio(
      behaviours.covered.length,
      contributingBehaviours.length,
    );

    return {
      driverId: driver.id,
      driverName: driver.name,
      skillCoverage,
      behaviourCoverage,
      overallScore: (skillCoverage + behaviourCoverage) / 2,
      coveredSkills: skills.covered,
      coveredBehaviours: behaviours.covered,
      missingSkills: skills.missing,
      missingBehaviours: behaviours.missing,
    };
  });

  coverageResults.sort((a, b) => b.overallScore - a.overallScore);

  return coverageResults;
}

/**
 * Get all skills in a discipline
 * @param {import('./levels.js').Discipline} discipline - The discipline
 * @returns {string[]} All skill IDs in the discipline
 */
export function getDisciplineSkillIds(discipline) {
  return [
    ...(discipline.coreSkills || []),
    ...(discipline.supportingSkills || []),
    ...(discipline.broadSkills || []),
  ];
}

/**
 * Return the ordinalRank of a level for numeric comparison and sorting.
 * @param {import('./levels.js').Level} level - The level
 * @returns {number} The ordinal rank
 */
export function getLevelRank(level) {
  return level.ordinalRank;
}

/**
 * Return true if the level meets or exceeds the senior threshold (Staff+).
 * @param {import('./levels.js').Level} level - The level
 * @returns {boolean} True if the level is senior (Staff+)
 */
export function isSeniorLevel(level) {
  return level.ordinalRank >= THRESHOLD_SENIOR_LEVEL;
}

/** Try to derive a job for a given combination and push it if valid. */
function tryDeriveAndPush(
  jobs,
  { discipline, level, track, skills, behaviours, validationRules, levels },
) {
  if (
    !_isValidJobCombination({
      discipline,
      level,
      track,
      validationRules,
      levels,
    })
  ) {
    return;
  }
  const job = deriveJob({
    discipline,
    level,
    track,
    skills,
    behaviours,
    validationRules,
  });
  if (job) jobs.push(job);
}

/** Derive all valid jobs for a single discipline × level combination. */
function deriveJobsForLevel(
  jobs,
  { discipline, level, tracks, skills, behaviours, validationRules, levels },
) {
  tryDeriveAndPush(jobs, {
    discipline,
    level,
    track: null,
    skills,
    behaviours,
    validationRules,
    levels,
  });
  for (const track of tracks) {
    tryDeriveAndPush(jobs, {
      discipline,
      level,
      track,
      skills,
      behaviours,
      validationRules,
      levels,
    });
  }
}

/**
 * Generate all valid job definitions from the data
 * @param {Object} params
 * @param {import('./levels.js').Discipline[]} params.disciplines - All disciplines
 * @param {import('./levels.js').Level[]} params.levels - All levels
 * @param {import('./levels.js').Track[]} params.tracks - All tracks
 * @param {import('./levels.js').Skill[]} params.skills - All skills
 * @param {import('./levels.js').Behaviour[]} params.behaviours - All behaviours
 * @param {import('./levels.js').JobValidationRules} [params.validationRules] - Optional validation rules
 * @returns {import('./levels.js').JobDefinition[]} All valid job definitions
 */
export function generateAllJobs({
  disciplines,
  levels,
  tracks,
  skills,
  behaviours,
  validationRules,
}) {
  const jobs = [];
  for (const discipline of disciplines) {
    for (const level of levels) {
      deriveJobsForLevel(jobs, {
        discipline,
        level,
        tracks,
        skills,
        behaviours,
        validationRules,
        levels,
      });
    }
  }
  return jobs;
}
