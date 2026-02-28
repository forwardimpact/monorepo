/**
 * Progress presentation helpers
 *
 * Shared utilities for formatting career progression data across DOM and markdown outputs.
 */

import {
  isValidJobCombination,
  generateJobTitle,
} from "@forwardimpact/libskill/derivation";
import {
  analyzeProgression,
  analyzeCustomProgression,
  getNextLevel,
} from "@forwardimpact/libskill/progression";
import { getOrCreateJob } from "@forwardimpact/libskill/job-cache";

/**
 * Get the next level for progression
 * @param {Object} currentLevel
 * @param {Array} levels
 * @returns {Object|null}
 */
export function getDefaultTargetLevel(currentLevel, levels) {
  return getNextLevel(currentLevel, levels);
}

/**
 * Check if a job combination is valid
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.level
 * @param {Object} params.track
 * @param {Array} [params.levels] - All levels for validation
 * @returns {boolean}
 */
export function isValidCombination({ discipline, level, track, levels }) {
  return isValidJobCombination({ discipline, level, track, levels });
}

/**
 * @typedef {Object} CurrentJobView
 * @property {string} title
 * @property {number} skillCount
 * @property {number} behaviourCount
 * @property {number} primarySkillCount
 * @property {Array} skillMatrix - Raw skill matrix for components
 * @property {Array} behaviourProfile - Raw behaviour profile for components
 */

/**
 * Prepare current job summary for progress detail page
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.level
 * @param {Object} params.track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} [params.capabilities]
 * @returns {CurrentJobView|null}
 */
export function prepareCurrentJob({
  discipline,
  level,
  track,
  skills,
  behaviours,
  capabilities,
}) {
  if (!discipline || !level) return null;

  const job = getOrCreateJob({
    discipline,
    level,
    track,
    skills,
    behaviours,
    capabilities,
  });

  if (!job) return null;

  return {
    title: job.title,
    skillCount: job.skillMatrix.length,
    behaviourCount: job.behaviourProfile.length,
    primarySkillCount: job.skillMatrix.filter((s) => s.type === "primary")
      .length,
    skillMatrix: job.skillMatrix,
    behaviourProfile: job.behaviourProfile,
  };
}

/**
 * @typedef {Object} CareerProgressPreview
 * @property {boolean} isValid
 * @property {string|null} title
 * @property {string|null} invalidReason
 * @property {Object|null} nextLevel
 * @property {Array} validTracks - Other valid tracks for comparison
 */

/**
 * Prepare career progress builder preview for form validation
 * @param {Object} params
 * @param {Object|null} params.discipline
 * @param {Object|null} params.level
 * @param {Object|null} params.track
 * @param {Array} params.levels - All levels
 * @param {Array} params.tracks - All tracks
 * @returns {CareerProgressPreview}
 */
export function prepareCareerProgressPreview({
  discipline,
  level,
  track,
  levels,
  tracks,
}) {
  // Track is optional (null = generalist)
  if (!discipline || !level) {
    return {
      isValid: false,
      title: null,
      invalidReason: null,
      nextLevel: null,
      validTracks: [],
    };
  }

  const validCombination = isValidJobCombination({
    discipline,
    level,
    track,
    levels,
  });

  if (!validCombination) {
    const reason = track
      ? `The ${track.name} track is not available for ${discipline.specialization}.`
      : `${discipline.specialization} requires a track specialization.`;
    return {
      isValid: false,
      title: null,
      invalidReason: reason,
      nextLevel: null,
      validTracks: [],
    };
  }

  const title = generateJobTitle(discipline, level, track);
  const nextLevel = getNextLevel(level, levels);

  // Find other valid tracks for comparison (exclude current track if any)
  const validTracks = tracks.filter(
    (t) =>
      (!track || t.id !== track.id) &&
      isValidJobCombination({ discipline, level, track: t, levels }),
  );

  return {
    isValid: true,
    title,
    invalidReason: null,
    nextLevel: nextLevel
      ? { id: nextLevel.id, name: nextLevel.managementTitle }
      : null,
    validTracks: validTracks.map((t) => ({ id: t.id, name: t.name })),
  };
}

/**
 * @typedef {Object} ProgressDetailView
 * @property {string} fromTitle
 * @property {string} toTitle
 * @property {Object} fromJob
 * @property {Object} toJob
 * @property {Array} skillChanges
 * @property {Array} behaviourChanges
 * @property {Object} summary
 */

/**
 * Prepare career progression between two roles
 * @param {Object} params
 * @param {Object} params.fromDiscipline
 * @param {Object} params.fromLevel
 * @param {Object} params.fromTrack
 * @param {Object} params.toDiscipline
 * @param {Object} params.toLevel
 * @param {Object} params.toTrack
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} [params.capabilities]
 * @returns {ProgressDetailView|null}
 */
export function prepareProgressDetail({
  fromDiscipline,
  fromLevel,
  fromTrack,
  toDiscipline,
  toLevel,
  toTrack,
  skills,
  behaviours,
  capabilities,
}) {
  // Track is optional (null = generalist)
  if (!fromDiscipline || !fromLevel) return null;
  if (!toDiscipline || !toLevel) return null;

  const fromJob = getOrCreateJob({
    discipline: fromDiscipline,
    level: fromLevel,
    track: fromTrack,
    skills,
    behaviours,
    capabilities,
  });

  const toJob = getOrCreateJob({
    discipline: toDiscipline,
    level: toLevel,
    track: toTrack,
    skills,
    behaviours,
    capabilities,
  });

  if (!fromJob || !toJob) return null;

  const progression = analyzeProgression(fromJob, toJob);

  // Transform skill changes
  const skillChanges = progression.skillChanges.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    fromLevel: s.currentLevel,
    toLevel: s.targetLevel,
    proficiencyChange: s.change,
  }));

  // Transform behaviour changes
  const behaviourChanges = progression.behaviourChanges.map((b) => ({
    id: b.id,
    name: b.name,
    fromMaturity: b.currentLevel,
    toMaturity: b.targetLevel,
    maturityChange: b.change,
  }));

  const summary = {
    skillsToImprove: skillChanges.filter((s) => s.proficiencyChange > 0).length,
    behavioursToImprove: behaviourChanges.filter((b) => b.maturityChange > 0)
      .length,
    newSkills: skillChanges.filter((s) => !s.fromLevel && s.toLevel).length,
    totalChanges:
      skillChanges.filter((s) => s.proficiencyChange !== 0).length +
      behaviourChanges.filter((b) => b.maturityChange !== 0).length,
  };

  return {
    fromTitle: fromJob.title,
    toTitle: toJob.title,
    fromJob: {
      disciplineId: fromDiscipline.id,
      levelId: fromLevel.id,
      trackId: fromTrack?.id || null,
    },
    toJob: {
      disciplineId: toDiscipline.id,
      levelId: toLevel.id,
      trackId: toTrack?.id || null,
    },
    skillChanges,
    behaviourChanges,
    summary,
  };
}

/**
 * @typedef {Object} CustomProgressionView
 * @property {Object} current - Current job info
 * @property {Object} target - Target job info
 * @property {Array} skillChanges
 * @property {Array} behaviourChanges
 * @property {Object} summary
 */

/**
 * Prepare custom progression analysis between any two roles
 * @param {Object} params
 * @param {Object} params.discipline - Current discipline
 * @param {Object} params.currentLevel
 * @param {Object} params.currentTrack
 * @param {Object} params.targetDiscipline
 * @param {Object} params.targetLevel
 * @param {Object} params.targetTrack
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @returns {CustomProgressionView|null}
 */
export function prepareCustomProgression({
  discipline,
  currentLevel,
  currentTrack,
  targetDiscipline,
  targetLevel,
  targetTrack,
  skills,
  behaviours,
}) {
  const analysis = analyzeCustomProgression({
    discipline,
    currentLevel,
    currentTrack,
    targetDiscipline,
    targetLevel,
    targetTrack,
    skills,
    behaviours,
  });

  if (!analysis) return null;

  return {
    current: {
      title: analysis.current.title,
      skillMatrix: analysis.current.skillMatrix,
      behaviourProfile: analysis.current.behaviourProfile,
    },
    target: {
      title: analysis.target.title,
      skillMatrix: analysis.target.skillMatrix,
      behaviourProfile: analysis.target.behaviourProfile,
    },
    skillChanges: analysis.skillChanges,
    behaviourChanges: analysis.behaviourChanges,
    summary: analysis.summary,
  };
}
