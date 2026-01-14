/**
 * Job Cache
 *
 * Centralized caching for generated job definitions.
 * Provides consistent key generation and get-or-create pattern.
 */

import { deriveJob } from "../model/derivation.js";

/** @type {Map<string, Object>} */
const cache = new Map();

/**
 * Create a consistent cache key from job parameters
 * @param {string} disciplineId
 * @param {string} trackId
 * @param {string} gradeId
 * @returns {string}
 */
export function makeJobKey(disciplineId, trackId, gradeId) {
  return `${disciplineId}_${trackId}_${gradeId}`;
}

/**
 * Get or create a cached job definition
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.grade
 * @param {Object} params.track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} [params.capabilities]
 * @returns {Object|null}
 */
export function getOrCreateJob({
  discipline,
  grade,
  track,
  skills,
  behaviours,
  capabilities,
}) {
  const key = makeJobKey(discipline.id, track.id, grade.id);

  if (!cache.has(key)) {
    const job = deriveJob({
      discipline,
      grade,
      track,
      skills,
      behaviours,
      capabilities,
    });
    if (job) {
      cache.set(key, job);
    }
    return job;
  }

  return cache.get(key);
}

/**
 * Clear all cached jobs
 */
export function clearJobCache() {
  cache.clear();
}

/**
 * Invalidate a specific job from the cache
 * @param {string} disciplineId
 * @param {string} trackId
 * @param {string} gradeId
 */
export function invalidateJob(disciplineId, trackId, gradeId) {
  cache.delete(makeJobKey(disciplineId, trackId, gradeId));
}

/**
 * Get the number of cached jobs (for testing/debugging)
 * @returns {number}
 */
export function getCacheSize() {
  return cache.size;
}
