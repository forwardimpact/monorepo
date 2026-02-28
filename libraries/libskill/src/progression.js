/**
 * Career Progression Functions
 *
 * This module provides pure functions for calculating skill and behaviour
 * changes between job definitions, supporting both level progression and
 * track comparison scenarios.
 */

import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
} from "@forwardimpact/map/levels";
import { deriveJob, isValidJobCombination } from "./derivation.js";
import {
  compareBySkillChange,
  compareByBehaviourChange,
} from "./policies/orderings.js";

/**
 * @typedef {Object} SkillChange
 * @property {string} id - Skill ID
 * @property {string} name - Skill name
 * @property {string} capability - Skill capability
 * @property {string} type - Skill type (primary/secondary/broad)
 * @property {string|null} currentLevel - Current skill proficiency (null if skill is gained)
 * @property {string|null} targetLevel - Target skill proficiency (null if skill is lost)
 * @property {number} currentIndex - Current level index (0-4, or -1 if not present)
 * @property {number} targetIndex - Target level index (0-4, or -1 if not present)
 * @property {number} change - Difference between target and current index
 * @property {string|null} currentDescription - Description at current level
 * @property {string|null} targetDescription - Description at target level
 * @property {boolean} [isGained] - True if skill is new in target (not in current)
 * @property {boolean} [isLost] - True if skill is removed in target (not in target)
 */

/**
 * @typedef {Object} BehaviourChange
 * @property {string} id - Behaviour ID
 * @property {string} name - Behaviour name
 * @property {string} currentLevel - Current maturity level
 * @property {string} targetLevel - Target maturity level
 * @property {number} currentIndex - Current level index (0-4)
 * @property {number} targetIndex - Target level index (0-4)
 * @property {number} change - Difference between target and current index

 * @property {string} currentDescription - Description at current level
 * @property {string} targetDescription - Description at target level
 */

/**
 * @typedef {Object} ProgressionAnalysis
 * @property {Object} current - Current job definition
 * @property {Object} target - Target job definition
 * @property {SkillChange[]} skillChanges - All skill changes
 * @property {BehaviourChange[]} behaviourChanges - All behaviour changes
 * @property {Object} summary - Summary statistics
 */

/**
 * Calculate skill proficiency changes between two skill matrices
 * Handles cross-discipline comparisons by including gained and lost skills
 * @param {Array} currentMatrix - Current skill matrix entries
 * @param {Array} targetMatrix - Target skill matrix entries
 * @returns {SkillChange[]} Array of skill changes, sorted by change magnitude
 */
export function calculateSkillChanges(currentMatrix, targetMatrix) {
  const changes = [];
  const processedSkillIds = new Set();

  // Process skills in current matrix
  for (const current of currentMatrix) {
    processedSkillIds.add(current.skillId);
    const target = targetMatrix.find((t) => t.skillId === current.skillId);

    if (target) {
      // Skill exists in both - calculate level change
      const currentIndex = getSkillProficiencyIndex(current.proficiency);
      const targetIndex = getSkillProficiencyIndex(target.proficiency);
      const change = targetIndex - currentIndex;

      changes.push({
        id: current.skillId,
        name: current.skillName,
        capability: current.capability,
        type: current.type,
        currentLevel: current.proficiency,
        targetLevel: target.proficiency,
        currentIndex,
        targetIndex,
        change,
        currentDescription: current.proficiencyDescription,
        targetDescription: target.proficiencyDescription,
      });
    } else {
      // Skill is lost (in current but not in target)
      const currentIndex = getSkillProficiencyIndex(current.proficiency);
      changes.push({
        id: current.skillId,
        name: current.skillName,
        capability: current.capability,
        type: current.type,
        currentLevel: current.proficiency,
        targetLevel: null,
        currentIndex,
        targetIndex: -1,
        change: -(currentIndex + 1), // Negative change representing loss
        currentDescription: current.proficiencyDescription,
        targetDescription: null,
        isLost: true,
      });
    }
  }

  // Process skills only in target matrix (gained skills)
  for (const target of targetMatrix) {
    if (!processedSkillIds.has(target.skillId)) {
      const targetIndex = getSkillProficiencyIndex(target.proficiency);
      changes.push({
        id: target.skillId,
        name: target.skillName,
        capability: target.capability,
        type: target.type,
        currentLevel: null,
        targetLevel: target.proficiency,
        currentIndex: -1,
        targetIndex,
        change: targetIndex + 1, // Positive change representing gain
        currentDescription: null,
        targetDescription: target.proficiencyDescription,
        isGained: true,
      });
    }
  }

  // Sort using policy comparator
  changes.sort(compareBySkillChange);

  return changes;
}

/**
 * Calculate behaviour maturity changes between two profiles
 * @param {Array} currentProfile - Current behaviour profile entries
 * @param {Array} targetProfile - Target behaviour profile entries
 * @returns {BehaviourChange[]} Array of behaviour changes, sorted by change magnitude
 */
export function calculateBehaviourChanges(currentProfile, targetProfile) {
  const changes = [];

  for (const current of currentProfile) {
    const target = targetProfile.find(
      (t) => t.behaviourId === current.behaviourId,
    );
    if (target) {
      const currentIndex = getBehaviourMaturityIndex(current.maturity);
      const targetIndex = getBehaviourMaturityIndex(target.maturity);
      const change = targetIndex - currentIndex;

      changes.push({
        id: current.behaviourId,
        name: current.behaviourName,
        currentLevel: current.maturity,
        targetLevel: target.maturity,
        currentIndex,
        targetIndex,
        change,
        currentDescription: current.maturityDescription,
        targetDescription: target.maturityDescription,
      });
    }
  }

  // Sort using policy comparator
  changes.sort(compareByBehaviourChange);

  return changes;
}

/**
 * Analyze progression between two job definitions
 * @param {Object} currentJob - Current job definition
 * @param {Object} targetJob - Target job definition
 * @returns {ProgressionAnalysis} Complete progression analysis
 */
export function analyzeProgression(currentJob, targetJob) {
  const skillChanges = calculateSkillChanges(
    currentJob.skillMatrix,
    targetJob.skillMatrix,
  );
  const behaviourChanges = calculateBehaviourChanges(
    currentJob.behaviourProfile,
    targetJob.behaviourProfile,
  );

  const skillsUp = skillChanges.filter(
    (s) => s.change > 0 && !s.isGained,
  ).length;
  const skillsDown = skillChanges.filter(
    (s) => s.change < 0 && !s.isLost,
  ).length;
  const skillsSame = skillChanges.filter((s) => s.change === 0).length;
  const skillsGained = skillChanges.filter((s) => s.isGained).length;
  const skillsLost = skillChanges.filter((s) => s.isLost).length;

  const behavioursUp = behaviourChanges.filter((b) => b.change > 0).length;
  const behavioursDown = behaviourChanges.filter((b) => b.change < 0).length;
  const behavioursSame = behaviourChanges.filter((b) => b.change === 0).length;

  return {
    current: currentJob,
    target: targetJob,
    skillChanges,
    behaviourChanges,
    summary: {
      skillsUp,
      skillsDown,
      skillsSame,
      skillsGained,
      skillsLost,
      totalSkillChange: skillChanges.reduce((sum, s) => sum + s.change, 0),
      behavioursUp,
      behavioursDown,
      behavioursSame,
      totalBehaviourChange: behaviourChanges.reduce(
        (sum, b) => sum + b.change,
        0,
      ),
    },
  };
}

/**
 * Analyze level progression for a role
 * @param {Object} params
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.level - Current level
 * @param {Object} params.track - The track
 * @param {Object} params.nextLevel - Target level (optional, will find next if not provided)
 * @param {Array} params.levels - All levels (needed if nextLevel not provided)
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @returns {ProgressionAnalysis|null} Progression analysis or null if no next level
 */
export function analyzeLevelProgression({
  discipline,
  level,
  track,
  nextLevel,
  levels,
  skills,
  behaviours,
}) {
  // Find next level if not provided
  let targetLevel = nextLevel;
  if (!targetLevel && levels) {
    const sortedLevels = [...levels].sort(
      (a, b) => a.ordinalRank - b.ordinalRank,
    );
    const currentIndex = sortedLevels.findIndex((g) => g.id === level.id);
    targetLevel = sortedLevels[currentIndex + 1];
  }

  if (!targetLevel) {
    return null;
  }

  // Create job definitions
  const currentJob = deriveJob({
    discipline,
    level,
    track,
    skills,
    behaviours,
  });

  const targetJob = deriveJob({
    discipline,
    level: targetLevel,
    track,
    skills,
    behaviours,
  });

  if (!currentJob || !targetJob) {
    return null;
  }

  return analyzeProgression(currentJob, targetJob);
}

/**
 * Analyze track comparison at the same level
 * @param {Object} params
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.level - The level
 * @param {Object} params.currentTrack - Current track
 * @param {Object} params.targetTrack - Target track to compare
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @param {Array} params.levels - All levels (for validation)
 * @returns {ProgressionAnalysis|null} Progression analysis or null if invalid combination
 */
export function analyzeTrackComparison({
  discipline,
  level,
  currentTrack,
  targetTrack,
  skills,
  behaviours,
  levels,
}) {
  // Check if target track is valid for this discipline
  if (
    !isValidJobCombination({ discipline, level, track: targetTrack, levels })
  ) {
    return null;
  }

  // Create job definitions
  const currentJob = deriveJob({
    discipline,
    level,
    track: currentTrack,
    skills,
    behaviours,
  });

  const targetJob = deriveJob({
    discipline,
    level,
    track: targetTrack,
    skills,
    behaviours,
  });

  if (!currentJob || !targetJob) {
    return null;
  }

  return analyzeProgression(currentJob, targetJob);
}

/**
 * Get all valid tracks for comparison given a discipline and level
 * @param {Object} params
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.level - The level
 * @param {Object} params.currentTrack - Current track (will be excluded from results)
 * @param {Array} params.tracks - All available tracks
 * @param {Array} params.levels - All levels (for validation)
 * @returns {Array} Valid tracks for comparison
 */
export function getValidTracksForComparison({
  discipline,
  level,
  currentTrack,
  tracks,
  levels,
}) {
  return tracks.filter(
    (t) =>
      t.id !== currentTrack.id &&
      isValidJobCombination({ discipline, level, track: t, levels }),
  );
}

/**
 * Get the next level in the progression
 * @param {Object} level - Current level
 * @param {Array} levels - All levels
 * @returns {Object|null} Next level or null if at highest
 */
export function getNextLevel(level, levels) {
  const sortedLevels = [...levels].sort(
    (a, b) => a.ordinalRank - b.ordinalRank,
  );
  const currentIndex = sortedLevels.findIndex((g) => g.id === level.id);
  return sortedLevels[currentIndex + 1] || null;
}

/**
 * Get the previous level in the progression
 * @param {Object} level - Current level
 * @param {Array} levels - All levels
 * @returns {Object|null} Previous level or null if at lowest
 */
export function getPreviousLevel(level, levels) {
  const sortedLevels = [...levels].sort(
    (a, b) => a.ordinalRank - b.ordinalRank,
  );
  const currentIndex = sortedLevels.findIndex((g) => g.id === level.id);
  return currentIndex > 0 ? sortedLevels[currentIndex - 1] : null;
}

/**
 * Analyze custom progression from current role to any target discipline × level × track combination
 * This is the main abstraction for comparing arbitrary role combinations.
 *
 * @param {Object} params
 * @param {Object} params.discipline - Current discipline
 * @param {Object} params.currentLevel - Current level
 * @param {Object} params.currentTrack - Current track
 * @param {Object} [params.targetDiscipline] - Target discipline (defaults to current discipline)
 * @param {Object} params.targetLevel - Target level for comparison
 * @param {Object} params.targetTrack - Target track for comparison
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @param {Array} params.levels - All levels (for validation)
 * @returns {ProgressionAnalysis|null} Progression analysis or null if invalid combination
 */
export function analyzeCustomProgression({
  discipline,
  currentLevel,
  currentTrack,
  targetDiscipline,
  targetLevel,
  targetTrack,
  skills,
  behaviours,
  levels,
}) {
  // Use current discipline if target not specified
  const targetDisc = targetDiscipline || discipline;

  // Validate target combination is valid
  if (
    !isValidJobCombination({
      discipline: targetDisc,
      level: targetLevel,
      track: targetTrack,
      levels,
    })
  ) {
    return null;
  }

  // Create current job definition
  const currentJob = deriveJob({
    discipline,
    level: currentLevel,
    track: currentTrack,
    skills,
    behaviours,
  });

  // Create target job definition
  const targetJob = deriveJob({
    discipline: targetDisc,
    level: targetLevel,
    track: targetTrack,
    skills,
    behaviours,
  });

  if (!currentJob || !targetJob) {
    return null;
  }

  return analyzeProgression(currentJob, targetJob);
}

/**
 * Get all valid level × track combinations for a discipline
 * Useful for populating dropdowns in the UI
 *
 * @param {Object} params
 * @param {Object} params.discipline - The discipline
 * @param {Array} params.levels - All levels
 * @param {Array} params.tracks - All tracks
 * @param {Object} [params.excludeLevel] - Optional level to exclude
 * @param {Object} [params.excludeTrack] - Optional track to exclude
 * @returns {Array<{level: Object, track: Object}>} Valid combinations
 */
export function getValidLevelTrackCombinations({
  discipline,
  levels,
  tracks,
  excludeLevel,
  excludeTrack,
}) {
  const combinations = [];

  for (const level of levels) {
    for (const track of tracks) {
      // Skip if this is the excluded combination
      if (excludeLevel?.id === level.id && excludeTrack?.id === track.id) {
        continue;
      }

      if (isValidJobCombination({ discipline, level, track, levels })) {
        combinations.push({ level, track });
      }
    }
  }

  // Sort by level rank, then by track name
  combinations.sort((a, b) => {
    if (a.level.ordinalRank !== b.level.ordinalRank) {
      return a.level.ordinalRank - b.level.ordinalRank;
    }
    return a.track.name.localeCompare(b.track.name);
  });

  return combinations;
}
