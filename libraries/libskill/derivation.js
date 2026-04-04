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
} from "@forwardimpact/map/levels";

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
 * Build a Map of skillId → skillType for a discipline
 * Enables O(1) lookup instead of repeated array scans
 * @param {import('./levels.js').Discipline} discipline - The discipline
 * @returns {Map<string, string>} Map of skill ID to skill type
 */
export function buildSkillTypeMap(discipline) {
  const map = new Map();
  for (const id of discipline.coreSkills || []) {
    map.set(id, SkillType.PRIMARY);
  }
  for (const id of discipline.supportingSkills || []) {
    map.set(id, SkillType.SECONDARY);
  }
  for (const id of discipline.broadSkills || []) {
    map.set(id, SkillType.BROAD);
  }
  return map;
}

/**
 * Determine the skill type (primary/secondary/broad) for a skill within a discipline
 * @param {import('./levels.js').Discipline} discipline - The discipline
 * @param {string} skillId - The skill ID
 * @returns {string|null} The skill type or null if skill not in discipline
 */
export function getSkillTypeForDiscipline(discipline, skillId) {
  if (discipline.coreSkills?.includes(skillId)) {
    return SkillType.PRIMARY;
  }
  if (discipline.supportingSkills?.includes(skillId)) {
    return SkillType.SECONDARY;
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
  const primaryIndex = getSkillProficiencyIndex(
    level.baseSkillProficiencies.primary,
  );
  const secondaryIndex = getSkillProficiencyIndex(
    level.baseSkillProficiencies.secondary,
  );
  const broadIndex = getSkillProficiencyIndex(
    level.baseSkillProficiencies.broad,
  );
  return Math.max(primaryIndex, secondaryIndex, broadIndex);
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
  const skillType = getSkillTypeForDiscipline(discipline, skillId);
  const effectiveType = skillType || SkillType.BROAD;
  const baseLevel = level.baseSkillProficiencies[effectiveType];
  const baseIndex = getSkillProficiencyIndex(baseLevel);

  const effectiveTrack = track || { skillModifiers: {} };
  const modifier = resolveSkillModifier(
    skillId,
    effectiveTrack.skillModifiers,
    skills,
  );

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

/**
 * Derive the complete skill matrix for a job
 * @param {Object} params
 * @param {import('./levels.js').Discipline} params.discipline - The discipline
 * @param {import('./levels.js').Level} params.level - The level
 * @param {import('./levels.js').Track} [params.track] - The track (optional)
 * @param {import('./levels.js').Skill[]} params.skills - All available skills
 * @returns {import('./levels.js').SkillMatrixEntry[]} Complete skill matrix
 */
export function deriveSkillMatrix({ discipline, level, track = null, skills }) {
  const matrix = [];
  const effectiveTrack = track || { skillModifiers: {} };

  const allDisciplineSkills = new Set([
    ...(discipline.coreSkills || []),
    ...(discipline.supportingSkills || []),
    ...(discipline.broadSkills || []),
  ]);

  const trackCapabilities = new Set(
    Object.entries(effectiveTrack.skillModifiers || {})
      .filter(([_, modifier]) => modifier > 0)
      .map(([capability]) => capability),
  );

  for (const skill of skills) {
    const inDiscipline = allDisciplineSkills.has(skill.id);
    const inTrackCapability = trackCapabilities.has(skill.capability);

    if (!inDiscipline && !inTrackCapability) {
      continue;
    }

    const skillType = getSkillTypeForDiscipline(discipline, skill.id);
    const proficiency = deriveSkillProficiency({
      discipline,
      level,
      track,
      skillId: skill.id,
      skills,
    });

    if (proficiency === null) {
      continue;
    }

    matrix.push({
      skillId: skill.id,
      skillName: skill.name,
      capability: skill.capability,
      isHumanOnly: skill.isHumanOnly || false,
      type: skillType || SkillType.TRACK,
      proficiency,
      proficiencyDescription:
        skill.proficiencyDescriptions?.[proficiency] || "",
    });
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

/**
 * Generate a job title from discipline, track, and level
 * @param {import('./levels.js').Discipline} discipline - The discipline
 * @param {import('./levels.js').Level} level - The level
 * @param {import('./levels.js').Track} [track] - The track (optional)
 * @returns {string} Generated job title
 */
export function generateJobTitle(discipline, level, track = null) {
  const { roleTitle, isManagement } = discipline;
  const { professionalTitle, managementTitle } = level;

  if (isManagement && !track) {
    return `${managementTitle}, ${roleTitle}`;
  }

  if (isManagement && track) {
    return `${managementTitle}, ${roleTitle} \u2013 ${track.name}`;
  }

  if (track) {
    if (professionalTitle.startsWith("Level")) {
      return `${roleTitle} ${professionalTitle} - ${track.name}`;
    }
    return `${professionalTitle} ${roleTitle} - ${track.name}`;
  }

  if (professionalTitle.startsWith("Level")) {
    return `${roleTitle} ${professionalTitle}`;
  }
  return `${professionalTitle} ${roleTitle}`;
}

/**
 * Generate a job ID from discipline, level, and track
 * @param {import('./levels.js').Discipline} discipline - The discipline
 * @param {import('./levels.js').Level} level - The level
 * @param {import('./levels.js').Track} [track] - The track (optional)
 * @returns {string} Generated job ID
 */
function generateJobId(discipline, level, track = null) {
  if (track) {
    return `${discipline.id}_${level.id}_${track.id}`;
  }
  return `${discipline.id}_${level.id}`;
}

/**
 * Create a complete job definition from discipline, level, and optional track
 * @param {Object} params
 * @param {import('./levels.js').Discipline} params.discipline - The discipline
 * @param {import('./levels.js').Level} params.level - The level
 * @param {import('./levels.js').Track} [params.track] - The track (optional)
 * @param {import('./levels.js').Skill[]} params.skills - All available skills
 * @param {import('./levels.js').Behaviour[]} params.behaviours - All available behaviours
 * @param {Object[]} [params.capabilities] - Optional capabilities for responsibility derivation
 * @param {import('./levels.js').JobValidationRules} [params.validationRules] - Optional validation rules
 * @returns {import('./levels.js').JobDefinition|null} The job definition or null if invalid
 */
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
      levels: validationRules?.levels,
    })
  ) {
    return null;
  }

  const skillMatrix = deriveSkillMatrix({ discipline, level, track, skills });
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
    id: generateJobId(discipline, level, track),
    title: generateJobTitle(discipline, level, track),
    discipline,
    level,
    track,
    skillMatrix,
    behaviourProfile,
    derivedResponsibilities,
    expectations: level.expectations || {},
  };
}

/**
 * Calculate driver coverage for a job
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').Driver[]} params.drivers - All drivers
 * @returns {import('./levels.js').DriverCoverage[]} Coverage analysis for each driver
 */
export function calculateDriverCoverage({ job, drivers }) {
  const coverageResults = [];

  const jobSkillProficiencies = new Map(
    job.skillMatrix.map((s) => [s.skillId, s.proficiency]),
  );
  const jobBehaviourMaturities = new Map(
    job.behaviourProfile.map((b) => [b.behaviourId, b.maturity]),
  );

  for (const driver of drivers) {
    const contributingSkills = driver.contributingSkills || [];
    const contributingBehaviours = driver.contributingBehaviours || [];

    const coveredSkills = [];
    const missingSkills = [];

    for (const skillId of contributingSkills) {
      const level = jobSkillProficiencies.get(skillId);
      if (
        level &&
        skillProficiencyMeetsRequirement(
          level,
          THRESHOLD_DRIVER_SKILL_PROFICIENCY,
        )
      ) {
        coveredSkills.push(skillId);
      } else {
        missingSkills.push(skillId);
      }
    }

    const skillCoverage =
      contributingSkills.length > 0
        ? coveredSkills.length / contributingSkills.length
        : 1;

    const coveredBehaviours = [];
    const missingBehaviours = [];
    const practicingIndex = getBehaviourMaturityIndex(
      THRESHOLD_DRIVER_BEHAVIOUR_MATURITY,
    );

    for (const behaviourId of contributingBehaviours) {
      const maturity = jobBehaviourMaturities.get(behaviourId);
      if (maturity && getBehaviourMaturityIndex(maturity) >= practicingIndex) {
        coveredBehaviours.push(behaviourId);
      } else {
        missingBehaviours.push(behaviourId);
      }
    }

    const behaviourCoverage =
      contributingBehaviours.length > 0
        ? coveredBehaviours.length / contributingBehaviours.length
        : 1;

    const overallScore = (skillCoverage + behaviourCoverage) / 2;

    coverageResults.push({
      driverId: driver.id,
      driverName: driver.name,
      skillCoverage,
      behaviourCoverage,
      overallScore,
      coveredSkills,
      coveredBehaviours,
      missingSkills,
      missingBehaviours,
    });
  }

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
 * Get the level level number (for comparison/sorting)
 * @param {import('./levels.js').Level} level - The level
 * @returns {number} The level level
 */
export function getLevelRank(level) {
  return level.ordinalRank;
}

/**
 * Check if a level is senior levels (Staff+)
 * @param {import('./levels.js').Level} level - The level
 * @returns {boolean} True if the level is senior levels
 */
export function isSeniorLevel(level) {
  return level.ordinalRank >= THRESHOLD_SENIOR_LEVEL;
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
      if (
        _isValidJobCombination({
          discipline,
          level,
          track: null,
          validationRules,
          levels,
        })
      ) {
        const tracklessJob = deriveJob({
          discipline,
          level,
          track: null,
          skills,
          behaviours,
          validationRules,
        });
        if (tracklessJob) {
          jobs.push(tracklessJob);
        }
      }

      for (const track of tracks) {
        if (
          !_isValidJobCombination({
            discipline,
            level,
            track,
            validationRules,
            levels,
          })
        ) {
          continue;
        }

        const job = deriveJob({
          discipline,
          level,
          track,
          skills,
          behaviours,
          validationRules,
        });

        if (job) {
          jobs.push(job);
        }
      }
    }
  }

  return jobs;
}
