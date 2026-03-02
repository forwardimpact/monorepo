/**
 * Job Cache
 *
 * Centralized caching for generated job definitions.
 * Provides consistent key generation and get-or-create pattern.
 */

import { deriveJob } from "./derivation.js";

/** @type {Map<string, Object>} */
const cache = new Map();

/**
 * Build a consistent cache key from job parameters
 * @param {string} disciplineId
 * @param {string} levelId
 * @param {string} [trackId] - Optional track ID
 * @returns {string}
 */
export function buildJobKey(disciplineId, levelId, trackId = null) {
  if (trackId) {
    return `${disciplineId}_${levelId}_${trackId}`;
  }
  return `${disciplineId}_${levelId}`;
}

/**
 * Get or create a cached job definition
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.level
 * @param {Object} [params.track] - Optional track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} [params.capabilities]
 * @returns {Object|null}
 */
export function getOrCreateJob({
  discipline,
  level,
  track = null,
  skills,
  behaviours,
  capabilities,
}) {
  const key = buildJobKey(discipline.id, level.id, track?.id);

  if (!cache.has(key)) {
    const job = deriveJob({
      discipline,
      level,
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
 * @param {string} levelId
 * @param {string} [trackId] - Optional track ID
 */
export function invalidateCachedJob(disciplineId, levelId, trackId = null) {
  cache.delete(buildJobKey(disciplineId, levelId, trackId));
}

/**
 * Get the number of cached jobs (for testing/debugging)
 * @returns {number}
 */
export function getCachedJobCount() {
  return cache.size;
}
