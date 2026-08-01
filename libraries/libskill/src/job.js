/**
 * Job Model
 *
 * Pure functions that prepare job data for display.
 * This module parallels the structure of model/agent.js.
 *
 * Functions that need a cache accept a `jobCache` parameter. Create it
 * with `createJobCache()`. Callers without a cache can pass `null`. The
 * function then derives the job without a cache.
 */

import {
  calculateDriverCoverage,
  deriveJob,
  generateJobTitle,
  getDisciplineSkillIds,
} from "./derivation.js";
import { isValidJobCombination } from "./derivation-validation.js";
import { deriveToolkit } from "./toolkit.js";

/**
 * Get or derive a job, with an optional cache.
 * @param {import('./job-cache.js').JobCache|null} jobCache
 * @param {Object} params
 * @returns {Object|null}
 */
function getJob(jobCache, params) {
  if (jobCache) return jobCache.getOrCreate(params);
  return deriveJob(params);
}

/**
 * @typedef {Object} JobDetailView
 * @property {string} title
 * @property {string} disciplineId
 * @property {string} disciplineName
 * @property {string} levelId
 * @property {string} levelName
 * @property {string} trackId
 * @property {string} trackName
 * @property {Object} expectations
 * @property {Array} skillMatrix
 * @property {Array} behaviourProfile
 * @property {Array} derivedResponsibilities
 * @property {string[]} capabilityOrder - Capability IDs in display order (from derivedResponsibilities)
 * @property {Array} driverCoverage
 * @property {Array} toolkit - De-duplicated tools from skills
 */

/**
 * Format driver coverage for display
 * @param {Array} driverCoverage - Raw driver coverage data
 * @returns {Array} Formatted driver coverage
 */
function formatDriverCoverage(driverCoverage) {
  return driverCoverage.map((d) => ({
    id: d.driverId,
    name: d.driverName,
    coverage: d.overallScore,
    skillsCovered: d.coveredSkills?.length || 0,
    skillsTotal:
      (d.coveredSkills?.length || 0) + (d.missingSkills?.length || 0),
    behavioursCovered: d.coveredBehaviours?.length || 0,
    behavioursTotal:
      (d.coveredBehaviours?.length || 0) + (d.missingBehaviours?.length || 0),
  }));
}

/**
 * Build the detail view object from a derived job.
 */
function buildJobDetailView({
  job,
  discipline,
  level,
  track,
  skills,
  drivers,
}) {
  const driverCoverage = calculateDriverCoverage({ job, drivers });
  const toolkit = deriveToolkit({ skillMatrix: job.skillMatrix, skills });

  return {
    title: job.title,
    disciplineId: discipline.id,
    disciplineName: discipline.specialization || discipline.name,
    levelId: level.id,
    levelName: level.professionalTitle || level.id,
    trackId: track?.id || null,
    trackName: track?.name || null,
    expectations: job.expectations || {},
    skillMatrix: job.skillMatrix,
    behaviourProfile: job.behaviourProfile,
    derivedResponsibilities: job.derivedResponsibilities || [],
    capabilityOrder: (job.derivedResponsibilities || []).map(
      (r) => r.capability,
    ),
    toolkit,
    driverCoverage: formatDriverCoverage(driverCoverage),
  };
}

/**
 * Prepare a job for detail view
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.level
 * @param {Object} params.track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} params.drivers
 * @param {Array} [params.capabilities]
 * @param {import('./job-cache.js').JobCache} [params.jobCache] - Optional cache instance
 * @returns {JobDetailView|null}
 */
export function prepareJobDetail({
  discipline,
  level,
  track,
  skills,
  behaviours,
  drivers,
  capabilities,
  jobCache = null,
}) {
  if (!discipline || !level) return null;

  const job = getJob(jobCache, {
    discipline,
    level,
    track,
    skills,
    behaviours,
    capabilities,
  });

  if (!job) return null;

  return buildJobDetailView({
    job,
    discipline,
    level,
    track,
    skills,
    drivers,
  });
}

/**
 * Prepare a job for list view (summary only)
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.level
 * @param {Object} params.track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {import('./job-cache.js').JobCache} [params.jobCache] - Optional cache instance
 * @returns {Object|null}
 */
export function prepareJobSummary({
  discipline,
  level,
  track,
  skills,
  behaviours,
  jobCache = null,
}) {
  if (!discipline || !level) return null;

  const job = getJob(jobCache, {
    discipline,
    level,
    track,
    skills,
    behaviours,
  });

  if (!job) return null;

  return {
    title: job.title,
    disciplineId: discipline.id,
    disciplineName: discipline.specialization || discipline.name,
    levelId: level.id,
    trackId: track?.id || null,
    trackName: track?.name || null,
    skillCount: job.skillMatrix.length,
    behaviourCount: job.behaviourProfile.length,
    coreSkillCount: job.skillMatrix.filter((s) => s.type === "core").length,
  };
}

/**
 * @typedef {Object} JobBuilderPreview
 * @property {boolean} isValid
 * @property {string|null} title
 * @property {number} totalSkills
 * @property {number} totalBehaviours
 * @property {string|null} invalidReason
 */

/**
 * Prepare the job builder preview to validate the form
 * @param {Object} params
 * @param {Object|null} params.discipline
 * @param {Object|null} params.level
 * @param {Object|null} params.track
 * @param {number} params.behaviourCount - Total behaviours in the system
 * @param {Array} [params.levels] - All levels for validation
 * @returns {JobBuilderPreview}
 */
export function prepareJobBuilderPreview({
  discipline,
  level,
  track,
  behaviourCount,
  levels,
}) {
  // Track is optional (null = generalist)
  if (!discipline || !level) {
    return {
      isValid: false,
      title: null,
      totalSkills: 0,
      totalBehaviours: 0,
      invalidReason: null,
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
      totalSkills: 0,
      totalBehaviours: 0,
      invalidReason: reason,
    };
  }

  const title = generateJobTitle({ discipline, level, track });
  const totalSkills = getDisciplineSkillIds(discipline).length;

  return {
    isValid: true,
    title,
    totalSkills,
    totalBehaviours: behaviourCount,
    invalidReason: null,
  };
}
