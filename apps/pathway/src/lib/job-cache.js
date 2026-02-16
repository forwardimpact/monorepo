/**
 * Job Cache
 *
 * Centralized caching for generated job definitions.
 * Provides consistent key generation and get-or-create pattern.
 */

import { deriveJob } from "@forwardimpact/libpathway/derivation";

/** @type {Map<string, Object>} */
const cache = new Map();

/**
 * Build a consistent cache key from job parameters
 * @param {string} disciplineId
 * @param {string} gradeId
 * @param {string} [trackId] - Optional track ID
 * @returns {string}
 */
export function buildJobKey(disciplineId, gradeId, trackId = null) {
  if (trackId) {
    return `${disciplineId}_${gradeId}_${trackId}`;
  }
  return `${disciplineId}_${gradeId}`;
}

/**
 * Get or create a cached job definition
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.grade
 * @param {Object} [params.track] - Optional track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} [params.capabilities]
 * @returns {Object|null}
 */
export function getOrCreateJob({
  discipline,
  grade,
  track = null,
  skills,
  behaviours,
  capabilities,
}) {
  const key = buildJobKey(discipline.id, grade.id, track?.id);

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
export function clearCache() {
  cache.clear();
}

/**
 * Invalidate a specific job from the cache
 * @param {string} disciplineId
 * @param {string} gradeId
 * @param {string} [trackId] - Optional track ID
 */
export function invalidateCachedJob(disciplineId, gradeId, trackId = null) {
  cache.delete(buildJobKey(disciplineId, gradeId, trackId));
}

/**
 * Get the number of cached jobs (for testing/debugging)
 * @returns {number}
 */
export function getCachedJobCount() {
  return cache.size;
}
