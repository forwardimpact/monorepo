/**
 * Progress presentation helpers
 *
 * Shared utilities for formatting career progression data across DOM and markdown outputs.
 */

import {
  isValidJobCombination,
  generateJobTitle,
} from "@forwardimpact/libpathway/derivation";
import {
  analyzeProgression,
  analyzeCustomProgression,
  getNextGrade,
} from "@forwardimpact/libpathway/progression";
import { getOrCreateJob } from "@forwardimpact/libpathway/job-cache";

/**
 * Get the next grade for progression
 * @param {Object} currentGrade
 * @param {Array} grades
 * @returns {Object|null}
 */
export function getDefaultTargetGrade(currentGrade, grades) {
  return getNextGrade(currentGrade, grades);
}

/**
 * Check if a job combination is valid
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.grade
 * @param {Object} params.track
 * @param {Array} [params.grades] - All grades for validation
 * @returns {boolean}
 */
export function isValidCombination({ discipline, grade, track, grades }) {
  return isValidJobCombination({ discipline, grade, track, grades });
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
 * @param {Object} params.grade
 * @param {Object} params.track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} [params.capabilities]
 * @returns {CurrentJobView|null}
 */
export function prepareCurrentJob({
  discipline,
  grade,
  track,
  skills,
  behaviours,
  capabilities,
}) {
  if (!discipline || !grade) return null;

  const job = getOrCreateJob({
    discipline,
    grade,
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
 * @property {Object|null} nextGrade
 * @property {Array} validTracks - Other valid tracks for comparison
 */

/**
 * Prepare career progress builder preview for form validation
 * @param {Object} params
 * @param {Object|null} params.discipline
 * @param {Object|null} params.grade
 * @param {Object|null} params.track
 * @param {Array} params.grades - All grades
 * @param {Array} params.tracks - All tracks
 * @returns {CareerProgressPreview}
 */
export function prepareCareerProgressPreview({
  discipline,
  grade,
  track,
  grades,
  tracks,
}) {
  // Track is optional (null = generalist)
  if (!discipline || !grade) {
    return {
      isValid: false,
      title: null,
      invalidReason: null,
      nextGrade: null,
      validTracks: [],
    };
  }

  const validCombination = isValidJobCombination({
    discipline,
    grade,
    track,
    grades,
  });

  if (!validCombination) {
    const reason = track
      ? `The ${track.name} track is not available for ${discipline.specialization}.`
      : `${discipline.specialization} requires a track specialization.`;
    return {
      isValid: false,
      title: null,
      invalidReason: reason,
      nextGrade: null,
      validTracks: [],
    };
  }

  const title = generateJobTitle(discipline, grade, track);
  const nextGrade = getNextGrade(grade, grades);

  // Find other valid tracks for comparison (exclude current track if any)
  const validTracks = tracks.filter(
    (t) =>
      (!track || t.id !== track.id) &&
      isValidJobCombination({ discipline, grade, track: t, grades }),
  );

  return {
    isValid: true,
    title,
    invalidReason: null,
    nextGrade: nextGrade
      ? { id: nextGrade.id, name: nextGrade.managementTitle }
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
 * @param {Object} params.fromGrade
 * @param {Object} params.fromTrack
 * @param {Object} params.toDiscipline
 * @param {Object} params.toGrade
 * @param {Object} params.toTrack
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} [params.capabilities]
 * @returns {ProgressDetailView|null}
 */
export function prepareProgressDetail({
  fromDiscipline,
  fromGrade,
  fromTrack,
  toDiscipline,
  toGrade,
  toTrack,
  skills,
  behaviours,
  capabilities,
}) {
  // Track is optional (null = generalist)
  if (!fromDiscipline || !fromGrade) return null;
  if (!toDiscipline || !toGrade) return null;

  const fromJob = getOrCreateJob({
    discipline: fromDiscipline,
    grade: fromGrade,
    track: fromTrack,
    skills,
    behaviours,
    capabilities,
  });

  const toJob = getOrCreateJob({
    discipline: toDiscipline,
    grade: toGrade,
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
    levelChange: s.change,
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
    skillsToImprove: skillChanges.filter((s) => s.levelChange > 0).length,
    behavioursToImprove: behaviourChanges.filter((b) => b.maturityChange > 0)
      .length,
    newSkills: skillChanges.filter((s) => !s.fromLevel && s.toLevel).length,
    totalChanges:
      skillChanges.filter((s) => s.levelChange !== 0).length +
      behaviourChanges.filter((b) => b.maturityChange !== 0).length,
  };

  return {
    fromTitle: fromJob.title,
    toTitle: toJob.title,
    fromJob: {
      disciplineId: fromDiscipline.id,
      gradeId: fromGrade.id,
      trackId: fromTrack?.id || null,
    },
    toJob: {
      disciplineId: toDiscipline.id,
      gradeId: toGrade.id,
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
 * @param {Object} params.currentGrade
 * @param {Object} params.currentTrack
 * @param {Object} params.targetDiscipline
 * @param {Object} params.targetGrade
 * @param {Object} params.targetTrack
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @returns {CustomProgressionView|null}
 */
export function prepareCustomProgression({
  discipline,
  currentGrade,
  currentTrack,
  targetDiscipline,
  targetGrade,
  targetTrack,
  skills,
  behaviours,
}) {
  const analysis = analyzeCustomProgression({
    discipline,
    currentGrade,
    currentTrack,
    targetDiscipline,
    targetGrade,
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
