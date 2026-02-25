/**
 * Engineering Pathway Job Derivation Functions
 *
 * This module provides pure functions for deriving job definitions from
 * discipline, track, and level combinations.
 */

import {
  SkillType,
  SKILL_PROFICIENCY_ORDER,
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
 *
 * This returns the maximum skill proficiency index across primary, secondary, and broad
 * skill types for the given level. Used to cap positive skill modifiers.
 *
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
 *
 * Resolves capability-based modifiers (e.g., { scale: 1 }) by looking up the skill's capability.
 *
 * Positive modifiers are capped at the highest base skill proficiency for the level,
 * ensuring skills cannot exceed what's appropriate for that career level.
 * Negative modifiers can still bring skills below their base to create emphasis.
 *
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
  // 1. Determine skill type for discipline
  const skillType = getSkillTypeForDiscipline(discipline, skillId);

  // 2. Get base level from level for that skill type
  // Track-added skills (null skillType) use broad as base
  const effectiveType = skillType || SkillType.BROAD;
  const baseLevel = level.baseSkillProficiencies[effectiveType];
  const baseIndex = getSkillProficiencyIndex(baseLevel);

  // 3. Apply track modifier via capability lookup (if track provided)
  const effectiveTrack = track || { skillModifiers: {} };
  const modifier = resolveSkillModifier(
    skillId,
    effectiveTrack.skillModifiers,
    skills,
  );

  // Track-added skills require a positive modifier to be included
  if (!skillType && modifier <= 0) {
    return null;
  }

  let modifiedIndex = baseIndex + modifier;

  // 4. Cap positive modifications at the level's highest base skill proficiency
  // Negative modifiers can bring skills below base to create emphasis,
  // but positive modifiers should not push skills beyond the level ceiling
  if (modifier > 0) {
    const maxIndex = findMaxBaseSkillProficiency(level);
    modifiedIndex = Math.min(modifiedIndex, maxIndex);
  }

  // 5. Clamp to valid range
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
  // 1. Get base maturity from level
  const baseMaturity = level.baseBehaviourMaturity;
  const baseIndex = getBehaviourMaturityIndex(baseMaturity);

  // 2. Calculate behaviour modifiers (additive from discipline and track)
  const disciplineModifier = discipline.behaviourModifiers?.[behaviourId] ?? 0;
  const effectiveTrack = track || { behaviourModifiers: {} };
  const trackModifier = effectiveTrack.behaviourModifiers?.[behaviourId] ?? 0;
  const totalModifier = disciplineModifier + trackModifier;

  // 3. Apply modifier and clamp
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

  // Collect all skills for this discipline
  const allDisciplineSkills = new Set([
    ...(discipline.coreSkills || []),
    ...(discipline.supportingSkills || []),
    ...(discipline.broadSkills || []),
  ]);

  // Collect capabilities with positive track modifiers
  const trackCapabilities = new Set(
    Object.entries(effectiveTrack.skillModifiers || {})
      .filter(([_, modifier]) => modifier > 0)
      .map(([capability]) => capability),
  );

  for (const skill of skills) {
    // Include skill if it's in the discipline OR in a track-modified capability
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
      skills, // Pass skills array to enable capability-based modifiers
    });

    // Skip if deriveSkillProficiency returns null (track-added skill with no positive modifier)
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

  // Sort by type (primary first, then secondary, then broad, then track) and then by name
  // Use ORDER_SKILL_TYPE from policies for canonical ordering
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

  // Sort by name
  profile.sort((a, b) => a.behaviourName.localeCompare(b.behaviourName));

  return profile;
}

/**
 * Check if a job combination is valid
 * @param {Object} params
 * @param {import('./levels.js').Discipline} params.discipline - The discipline
 * @param {import('./levels.js').Level} params.level - The level
 * @param {import('./levels.js').Track} [params.track] - The track (optional)
 * @param {import('./levels.js').JobValidationRules} [params.validationRules] - Optional validation rules
 * @param {Array<import('./levels.js').Level>} [params.levels] - Optional array of all levels for minLevel validation
 * @returns {boolean} True if the combination is valid
 */
export function isValidJobCombination({
  discipline,
  level,
  track = null,
  validationRules,
  levels,
}) {
  // 1. Check discipline's minLevel constraint
  if (discipline.minLevel && levels) {
    const minLevelObj = levels.find((g) => g.id === discipline.minLevel);
    if (minLevelObj && level.ordinalRank < minLevelObj.ordinalRank) {
      return false;
    }
  }

  // 2. Handle trackless vs tracked jobs based on validTracks
  // validTracks semantics:
  // - null in array means "allow trackless (generalist)"
  // - string values mean "allow this specific track"
  // - empty array = discipline cannot have any jobs
  if (!track) {
    // Trackless job: only valid if null is in validTracks
    // Note: for backwards compatibility, empty array also allows trackless
    const validTracks = discipline.validTracks ?? [];
    if (validTracks.length === 0) {
      // Empty array = allow trackless (legacy behavior)
      return true;
    }
    // Check if null is explicitly in the array
    return validTracks.includes(null);
  }

  // 3. Check discipline's validTracks constraint for tracked jobs
  // Only string entries matter here (null = trackless, not a track ID)
  const validTracks = discipline.validTracks ?? [];
  if (validTracks.length > 0) {
    const trackIds = validTracks.filter((t) => t !== null);
    if (trackIds.length > 0 && !trackIds.includes(track.id)) {
      return false;
    }
    // If validTracks only contains null (no track IDs), reject all tracks
    if (trackIds.length === 0) {
      return false;
    }
  }

  // 4. Check track's minLevel constraint
  if (track.minLevel && levels) {
    const minLevelObj = levels.find((g) => g.id === track.minLevel);
    if (minLevelObj && level.ordinalRank < minLevelObj.ordinalRank) {
      return false;
    }
  }

  // 5. Apply framework-level validation rules
  if (validationRules?.invalidCombinations) {
    for (const combo of validationRules.invalidCombinations) {
      const disciplineMatch =
        !combo.discipline || combo.discipline === discipline.id;
      const trackMatch = !combo.track || combo.track === track.id;
      const levelMatch = !combo.level || combo.level === level.id;

      if (disciplineMatch && trackMatch && levelMatch) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Generate a job title from discipline, track, and level
 *
 * Rules:
 * - Management discipline without track: ${level.managementTitle}, ${discipline.specialization}
 * - Management discipline with track: ${level.managementTitle}, ${track.name}
 * - IC discipline with track: ${level.professionalTitle} ${discipline.roleTitle} - ${track.name}
 * - IC discipline without track: ${level.professionalTitle} ${discipline.roleTitle}
 *
 * @param {import('./levels.js').Discipline} discipline - The discipline
 * @param {import('./levels.js').Level} level - The level
 * @param {import('./levels.js').Track} [track] - The track (optional)
 * @returns {string} Generated job title
 */
export function generateJobTitle(discipline, level, track = null) {
  const { roleTitle, isManagement } = discipline;
  const { professionalTitle, managementTitle } = level;

  // Management discipline (no track needed)
  if (isManagement && !track) {
    return `${managementTitle}, ${roleTitle}`;
  }

  // Management discipline with track
  if (isManagement && track) {
    return `${managementTitle}, ${roleTitle} – ${track.name}`;
  }

  // IC discipline with track
  if (track) {
    if (professionalTitle.startsWith("Level")) {
      // Professional track with Level level: "Software Engineer Level II - Platform"
      return `${roleTitle} ${professionalTitle} - ${track.name}`;
    }
    // Professional track with non-Level level: "Staff Software Engineer - Platform"
    return `${professionalTitle} ${roleTitle} - ${track.name}`;
  }

  // IC discipline without track (generalist)
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
 * Derive role responsibilities from skill matrix and capabilities
 *
 * Responsibilities are determined by finding the maximum skill proficiency
 * achieved in each capability, then looking up the corresponding
 * responsibility statement from the capability definition.
 *
 * Capabilities are sorted by their maximum skill proficiency (descending),
 * so Expert-level capabilities appear before Practitioner-level, etc.
 * Within the same proficiency, capabilities with more skills at that
 * proficiency are sorted first.
 *
 * Uses professionalResponsibilities for professional disciplines (isProfessional: true)
 * and managementResponsibilities for management disciplines (isManagement: true).
 *
 * @param {Object} params
 * @param {import('./levels.js').SkillMatrixEntry[]} params.skillMatrix - Derived skill matrix for the job
 * @param {Object[]} params.capabilities - Capability definitions with responsibilities
 * @param {import('./levels.js').Discipline} params.discipline - The discipline (determines which responsibilities to use)
 * @returns {Array<{capability: string, capabilityName: string, emojiIcon: string, responsibility: string, level: string}>}
 */
export function deriveResponsibilities({
  skillMatrix,
  capabilities,
  discipline,
}) {
  if (!capabilities || capabilities.length === 0) {
    return [];
  }

  // Determine which responsibility set to use based on discipline type
  // Management disciplines use managementResponsibilities, professional disciplines use professionalResponsibilities
  const responsibilityKey = discipline?.isManagement
    ? "managementResponsibilities"
    : "professionalResponsibilities";

  // Group skills by capability and find max proficiency per capability
  const capabilityProficiencies = new Map();

  for (const skill of skillMatrix) {
    const currentProficiency = capabilityProficiencies.get(skill.capability);
    const skillProficiencyIndex = SKILL_PROFICIENCY_ORDER.indexOf(
      skill.proficiency,
    );
    const currentIndex = currentProficiency
      ? SKILL_PROFICIENCY_ORDER.indexOf(currentProficiency)
      : -1;

    if (skillProficiencyIndex > currentIndex) {
      capabilityProficiencies.set(skill.capability, skill.proficiency);
    }
  }

  // Count skills per capability at each capability's max proficiency
  const capabilitySkillCounts = new Map();
  for (const skill of skillMatrix) {
    const capMaxProf = capabilityProficiencies.get(skill.capability);
    if (skill.proficiency === capMaxProf) {
      const count = capabilitySkillCounts.get(skill.capability) || 0;
      capabilitySkillCounts.set(skill.capability, count + 1);
    }
  }

  // Build capability lookup map
  const capabilityMap = new Map(capabilities.map((c) => [c.id, c]));

  // Build responsibilities from all capabilities with meaningful proficiencies
  const responsibilities = [];

  for (const [capabilityId, proficiency] of capabilityProficiencies) {
    if (proficiency === "awareness") continue; // Skip awareness-only capabilities

    const capability = capabilityMap.get(capabilityId);
    const responsibilityText = capability?.[responsibilityKey]?.[proficiency];
    if (responsibilityText) {
      responsibilities.push({
        capability: capabilityId,
        capabilityName: capability.name,
        emojiIcon: capability.emojiIcon || "💡",
        ordinalRank: capability.ordinalRank ?? 999,
        responsibility: responsibilityText,
        proficiency,
        proficiencyIndex: SKILL_PROFICIENCY_ORDER.indexOf(proficiency),
        skillCount: capabilitySkillCounts.get(capabilityId) || 0,
      });
    }
  }

  // Sort by proficiency descending (expert first), then by skill count descending,
  // then by capability order as tiebreaker
  responsibilities.sort((a, b) => {
    if (b.proficiencyIndex !== a.proficiencyIndex) {
      return b.proficiencyIndex - a.proficiencyIndex;
    }
    if (b.skillCount !== a.skillCount) {
      return b.skillCount - a.skillCount;
    }
    return a.ordinalRank - b.ordinalRank;
  });

  // Remove internal fields from output
  return responsibilities.map(
    ({ proficiencyIndex: _proficiencyIndex, skillCount: _skillCount, ...rest }) =>
      rest,
  );
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
  // Check if combination is valid
  if (
    !isValidJobCombination({
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

  // Derive responsibilities if capabilities are provided
  let derivedResponsibilities = [];
  if (capabilities && capabilities.length > 0) {
    derivedResponsibilities = deriveResponsibilities({
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

  // Create lookup maps for the job's skills and behaviours
  const jobSkillProficiencies = new Map(
    job.skillMatrix.map((s) => [s.skillId, s.proficiency]),
  );
  const jobBehaviourMaturities = new Map(
    job.behaviourProfile.map((b) => [b.behaviourId, b.maturity]),
  );

  for (const driver of drivers) {
    const contributingSkills = driver.contributingSkills || [];
    const contributingBehaviours = driver.contributingBehaviours || [];

    // Calculate skill coverage (Working+ level threshold)
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

    // Calculate behaviour coverage (Practicing+ maturity threshold)
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

    // Overall score is weighted average (50/50)
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

  // Sort by overall score descending
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
 * Generates both trackless jobs and jobs with tracks based on discipline.validTracks
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
      // First, generate trackless job for this discipline/level
      if (
        isValidJobCombination({
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

      // Then, generate jobs with valid tracks
      for (const track of tracks) {
        if (
          !isValidJobCombination({
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
