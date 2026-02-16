/**
 * Career Progression Functions
 *
 * This module provides pure functions for calculating skill and behaviour
 * changes between job definitions, supporting both grade progression and
 * track comparison scenarios.
 */

import {
  getSkillLevelIndex,
  getBehaviourMaturityIndex,
} from "@forwardimpact/schema/levels";
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
 * @property {string|null} currentLevel - Current skill level (null if skill is gained)
 * @property {string|null} targetLevel - Target skill level (null if skill is lost)
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
 * Calculate skill level changes between two skill matrices
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
      const currentIndex = getSkillLevelIndex(current.level);
      const targetIndex = getSkillLevelIndex(target.level);
      const change = targetIndex - currentIndex;

      changes.push({
        id: current.skillId,
        name: current.skillName,
        capability: current.capability,
        type: current.type,
        currentLevel: current.level,
        targetLevel: target.level,
        currentIndex,
        targetIndex,
        change,
        currentDescription: current.levelDescription,
        targetDescription: target.levelDescription,
      });
    } else {
      // Skill is lost (in current but not in target)
      const currentIndex = getSkillLevelIndex(current.level);
      changes.push({
        id: current.skillId,
        name: current.skillName,
        capability: current.capability,
        type: current.type,
        currentLevel: current.level,
        targetLevel: null,
        currentIndex,
        targetIndex: -1,
        change: -(currentIndex + 1), // Negative change representing loss
        currentDescription: current.levelDescription,
        targetDescription: null,
        isLost: true,
      });
    }
  }

  // Process skills only in target matrix (gained skills)
  for (const target of targetMatrix) {
    if (!processedSkillIds.has(target.skillId)) {
      const targetIndex = getSkillLevelIndex(target.level);
      changes.push({
        id: target.skillId,
        name: target.skillName,
        capability: target.capability,
        type: target.type,
        currentLevel: null,
        targetLevel: target.level,
        currentIndex: -1,
        targetIndex,
        change: targetIndex + 1, // Positive change representing gain
        currentDescription: null,
        targetDescription: target.levelDescription,
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
 * Analyze grade progression for a role
 * @param {Object} params
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.grade - Current grade
 * @param {Object} params.track - The track
 * @param {Object} params.nextGrade - Target grade (optional, will find next if not provided)
 * @param {Array} params.grades - All grades (needed if nextGrade not provided)
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @returns {ProgressionAnalysis|null} Progression analysis or null if no next grade
 */
export function analyzeGradeProgression({
  discipline,
  grade,
  track,
  nextGrade,
  grades,
  skills,
  behaviours,
}) {
  // Find next grade if not provided
  let targetGrade = nextGrade;
  if (!targetGrade && grades) {
    const sortedGrades = [...grades].sort(
      (a, b) => a.ordinalRank - b.ordinalRank,
    );
    const currentIndex = sortedGrades.findIndex((g) => g.id === grade.id);
    targetGrade = sortedGrades[currentIndex + 1];
  }

  if (!targetGrade) {
    return null;
  }

  // Create job definitions
  const currentJob = deriveJob({
    discipline,
    grade,
    track,
    skills,
    behaviours,
  });

  const targetJob = deriveJob({
    discipline,
    grade: targetGrade,
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
 * Analyze track comparison at the same grade
 * @param {Object} params
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.grade - The grade
 * @param {Object} params.currentTrack - Current track
 * @param {Object} params.targetTrack - Target track to compare
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @param {Array} params.grades - All grades (for validation)
 * @returns {ProgressionAnalysis|null} Progression analysis or null if invalid combination
 */
export function analyzeTrackComparison({
  discipline,
  grade,
  currentTrack,
  targetTrack,
  skills,
  behaviours,
  grades,
}) {
  // Check if target track is valid for this discipline
  if (
    !isValidJobCombination({ discipline, grade, track: targetTrack, grades })
  ) {
    return null;
  }

  // Create job definitions
  const currentJob = deriveJob({
    discipline,
    grade,
    track: currentTrack,
    skills,
    behaviours,
  });

  const targetJob = deriveJob({
    discipline,
    grade,
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
 * Get all valid tracks for comparison given a discipline and grade
 * @param {Object} params
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.grade - The grade
 * @param {Object} params.currentTrack - Current track (will be excluded from results)
 * @param {Array} params.tracks - All available tracks
 * @param {Array} params.grades - All grades (for validation)
 * @returns {Array} Valid tracks for comparison
 */
export function getValidTracksForComparison({
  discipline,
  grade,
  currentTrack,
  tracks,
  grades,
}) {
  return tracks.filter(
    (t) =>
      t.id !== currentTrack.id &&
      isValidJobCombination({ discipline, grade, track: t, grades }),
  );
}

/**
 * Get the next grade in the progression
 * @param {Object} grade - Current grade
 * @param {Array} grades - All grades
 * @returns {Object|null} Next grade or null if at highest
 */
export function getNextGrade(grade, grades) {
  const sortedGrades = [...grades].sort(
    (a, b) => a.ordinalRank - b.ordinalRank,
  );
  const currentIndex = sortedGrades.findIndex((g) => g.id === grade.id);
  return sortedGrades[currentIndex + 1] || null;
}

/**
 * Get the previous grade in the progression
 * @param {Object} grade - Current grade
 * @param {Array} grades - All grades
 * @returns {Object|null} Previous grade or null if at lowest
 */
export function getPreviousGrade(grade, grades) {
  const sortedGrades = [...grades].sort(
    (a, b) => a.ordinalRank - b.ordinalRank,
  );
  const currentIndex = sortedGrades.findIndex((g) => g.id === grade.id);
  return currentIndex > 0 ? sortedGrades[currentIndex - 1] : null;
}

/**
 * Analyze custom progression from current role to any target discipline × grade × track combination
 * This is the main abstraction for comparing arbitrary role combinations.
 *
 * @param {Object} params
 * @param {Object} params.discipline - Current discipline
 * @param {Object} params.currentGrade - Current grade
 * @param {Object} params.currentTrack - Current track
 * @param {Object} [params.targetDiscipline] - Target discipline (defaults to current discipline)
 * @param {Object} params.targetGrade - Target grade for comparison
 * @param {Object} params.targetTrack - Target track for comparison
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @param {Array} params.grades - All grades (for validation)
 * @returns {ProgressionAnalysis|null} Progression analysis or null if invalid combination
 */
export function analyzeCustomProgression({
  discipline,
  currentGrade,
  currentTrack,
  targetDiscipline,
  targetGrade,
  targetTrack,
  skills,
  behaviours,
  grades,
}) {
  // Use current discipline if target not specified
  const targetDisc = targetDiscipline || discipline;

  // Validate target combination is valid
  if (
    !isValidJobCombination({
      discipline: targetDisc,
      grade: targetGrade,
      track: targetTrack,
      grades,
    })
  ) {
    return null;
  }

  // Create current job definition
  const currentJob = deriveJob({
    discipline,
    grade: currentGrade,
    track: currentTrack,
    skills,
    behaviours,
  });

  // Create target job definition
  const targetJob = deriveJob({
    discipline: targetDisc,
    grade: targetGrade,
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
 * Get all valid grade × track combinations for a discipline
 * Useful for populating dropdowns in the UI
 *
 * @param {Object} params
 * @param {Object} params.discipline - The discipline
 * @param {Array} params.grades - All grades
 * @param {Array} params.tracks - All tracks
 * @param {Object} [params.excludeGrade] - Optional grade to exclude
 * @param {Object} [params.excludeTrack] - Optional track to exclude
 * @returns {Array<{grade: Object, track: Object}>} Valid combinations
 */
export function getValidGradeTrackCombinations({
  discipline,
  grades,
  tracks,
  excludeGrade,
  excludeTrack,
}) {
  const combinations = [];

  for (const grade of grades) {
    for (const track of tracks) {
      // Skip if this is the excluded combination
      if (excludeGrade?.id === grade.id && excludeTrack?.id === track.id) {
        continue;
      }

      if (isValidJobCombination({ discipline, grade, track, grades })) {
        combinations.push({ grade, track });
      }
    }
  }

  // Sort by grade level, then by track name
  combinations.sort((a, b) => {
    if (a.grade.ordinalRank !== b.grade.ordinalRank) {
      return a.grade.ordinalRank - b.grade.ordinalRank;
    }
    return a.track.name.localeCompare(b.track.name);
  });

  return combinations;
}
