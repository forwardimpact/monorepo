/**
 * Job Cache
 *
 * Factory-based caching for generated job definitions.
 * Each consumer creates its own cache instance via createJobCache(),
 * eliminating module-level mutable state so libskill remains a pure-function
 * library.
 */

import { deriveJob } from "./derivation.js";

/**
 * Build a consistent cache key from job parameters.
 * Includes capabilities and validationRules so that calls with different
 * derivation inputs never collide.
 * For the user-facing job id, see `generateJobId` in derivation.js.
 * @param {Object} params
 * @param {string} params.disciplineId
 * @param {string} params.levelId
 * @param {string} [params.trackId]
 * @param {string[]} [params.capabilityIds]
 * @param {string} [params.validationRulesHash]
 * @returns {string}
 */
export function buildJobKey({
  disciplineId,
  levelId,
  trackId = null,
  capabilityIds = null,
  validationRulesHash = null,
}) {
  const parts = [disciplineId, levelId, trackId ?? "-"];
  if (capabilityIds?.length) parts.push(`caps:${capabilityIds.join(",")}`);
  if (validationRulesHash) parts.push(`rules:${validationRulesHash}`);
  return parts.join("_");
}

/**
 * Produce a stable hash string from validationRules for cache key use.
 * @param {Object} [validationRules]
 * @returns {string|null}
 */
function hashValidationRules(validationRules) {
  if (!validationRules) return null;
  const str = JSON.stringify(
    validationRules,
    Object.keys(validationRules).sort(),
  );
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * @typedef {Object} JobCache
 * @property {function(Object): Object|null} getOrCreate - Get or create a cached job
 * @property {function(Object): void} invalidate - Invalidate a specific job
 * @property {function(): void} clear - Clear all cached jobs
 * @property {function(): number} size - Get the number of cached jobs
 */

/**
 * Create a new job cache instance.
 * @returns {JobCache}
 */
export function createJobCache() {
  /** @type {Map<string, Object>} */
  const cache = new Map();

  return {
    /**
     * Get or create a cached job definition
     * @param {Object} params
     * @param {Object} params.discipline
     * @param {Object} params.level
     * @param {Object} [params.track]
     * @param {Array} params.skills
     * @param {Array} params.behaviours
     * @param {Array} [params.capabilities]
     * @param {Object} [params.validationRules]
     * @returns {Object|null}
     */
    getOrCreate({
      discipline,
      level,
      track = null,
      skills,
      behaviours,
      capabilities,
      validationRules,
    }) {
      const capabilityIds = capabilities?.map((c) => c.id).sort() ?? null;
      const key = buildJobKey({
        disciplineId: discipline.id,
        levelId: level.id,
        trackId: track?.id,
        capabilityIds,
        validationRulesHash: hashValidationRules(validationRules),
      });

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
    },

    /**
     * Invalidate a specific job from the cache
     * @param {Object} params
     * @param {string} params.disciplineId
     * @param {string} params.levelId
     * @param {string} [params.trackId]
     * @param {string[]} [params.capabilityIds]
     * @param {string} [params.validationRulesHash]
     */
    invalidate({
      disciplineId,
      levelId,
      trackId = null,
      capabilityIds = null,
      validationRulesHash = null,
    }) {
      cache.delete(
        buildJobKey({
          disciplineId,
          levelId,
          trackId,
          capabilityIds,
          validationRulesHash,
        }),
      );
    },

    /** Clear all cached jobs */
    clear() {
      cache.clear();
    },

    /** @returns {number} */
    size() {
      return cache.size;
    },
  };
}
