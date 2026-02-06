/**
 * Job Model
 *
 * Pure functions for preparing job data for display.
 * Parallels model/agent.js in structure.
 */

import {
  calculateDriverCoverage,
  generateJobTitle,
  isValidJobCombination,
  getDisciplineSkillIds,
} from "./derivation.js";
import { deriveChecklist } from "./checklist.js";
import { deriveToolkit } from "./toolkit.js";
import { getOrCreateJob } from "./job-cache.js";

/**
 * @typedef {Object} JobDetailView
 * @property {string} title
 * @property {string} disciplineId
 * @property {string} disciplineName
 * @property {string} gradeId
 * @property {string} gradeName
 * @property {string} trackId
 * @property {string} trackName
 * @property {Object} expectations
 * @property {Array} skillMatrix
 * @property {Array} behaviourProfile
 * @property {Array} derivedResponsibilities
 * @property {Array} driverCoverage
 * @property {Array} toolkit - De-duplicated tools from skills
 * @property {Object} checklists - Handoff checklists keyed by handoff type
 */

/**
 * Prepare a job for detail view
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.grade
 * @param {Object} params.track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} params.drivers
 * @param {Array} [params.capabilities]
 * @returns {JobDetailView|null}
 */
export function prepareJobDetail({
  discipline,
  grade,
  track,
  skills,
  behaviours,
  drivers,
  capabilities,
}) {
  // Track is optional (null = generalist)
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

  const driverCoverage = calculateDriverCoverage({
    job,
    drivers,
  });

  // Derive checklists for each stage
  const checklists = {};
  if (capabilities) {
    const stageIds = ["plan", "code"];
    for (const stageId of stageIds) {
      checklists[stageId] = deriveChecklist({
        stageId,
        skillMatrix: job.skillMatrix,
        skills,
        capabilities,
      });
    }
  }

  // Derive toolkit from skill matrix
  const toolkit = deriveToolkit({
    skillMatrix: job.skillMatrix,
    skills,
  });

  return {
    title: job.title,
    disciplineId: discipline.id,
    disciplineName: discipline.specialization || discipline.name,
    gradeId: grade.id,
    gradeName: grade.professionalTitle || grade.id,
    trackId: track?.id || null,
    trackName: track?.name || null,
    expectations: job.expectations || {},
    // Raw model data for components that need the original shape
    skillMatrix: job.skillMatrix,
    behaviourProfile: job.behaviourProfile,
    derivedResponsibilities: job.derivedResponsibilities || [],
    // Derived toolkit
    toolkit,
    // Transformed driver coverage for display
    driverCoverage: driverCoverage.map((d) => ({
      id: d.driverId,
      name: d.driverName,
      coverage: d.overallScore,
      skillsCovered: d.coveredSkills?.length || 0,
      skillsTotal:
        (d.coveredSkills?.length || 0) + (d.missingSkills?.length || 0),
      behavioursCovered: d.coveredBehaviours?.length || 0,
      behavioursTotal:
        (d.coveredBehaviours?.length || 0) + (d.missingBehaviours?.length || 0),
    })),
    // Derived checklists by handoff type
    checklists,
  };
}

/**
 * Prepare a job for list view (summary only)
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.grade
 * @param {Object} params.track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @returns {Object|null}
 */
export function prepareJobSummary({
  discipline,
  grade,
  track,
  skills,
  behaviours,
}) {
  if (!discipline || !grade) return null;

  const job = getOrCreateJob({
    discipline,
    grade,
    track,
    skills,
    behaviours,
  });

  if (!job) return null;

  return {
    title: job.title,
    disciplineId: discipline.id,
    disciplineName: discipline.specialization || discipline.name,
    gradeId: grade.id,
    trackId: track?.id || null,
    trackName: track?.name || null,
    skillCount: job.skillMatrix.length,
    behaviourCount: job.behaviourProfile.length,
    primarySkillCount: job.skillMatrix.filter((s) => s.type === "primary")
      .length,
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
 * Prepare job builder preview for form validation
 * @param {Object} params
 * @param {Object|null} params.discipline
 * @param {Object|null} params.grade
 * @param {Object|null} params.track
 * @param {number} params.behaviourCount - Total behaviours in the system
 * @param {Array} [params.grades] - All grades for validation
 * @returns {JobBuilderPreview}
 */
export function prepareJobBuilderPreview({
  discipline,
  grade,
  track,
  behaviourCount,
  grades,
}) {
  // Track is optional (null = generalist)
  if (!discipline || !grade) {
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
      totalSkills: 0,
      totalBehaviours: 0,
      invalidReason: reason,
    };
  }

  const title = generateJobTitle(discipline, grade, track);
  const totalSkills = getDisciplineSkillIds(discipline).length;

  return {
    isValid: true,
    title,
    totalSkills,
    totalBehaviours: behaviourCount,
    invalidReason: null,
  };
}
