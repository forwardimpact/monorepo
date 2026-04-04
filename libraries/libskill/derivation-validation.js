/**
 * Job Combination Validation
 *
 * Pure functions for validating discipline × track × level combinations.
 * Extracted from derivation.js for max-lines compliance.
 */

/**
 * Check if a discipline allows trackless jobs
 * @param {Array|undefined} validTracks - The discipline's validTracks array
 * @returns {boolean} True if trackless jobs are allowed
 */
function allowsTrackless(validTracks) {
  if (!validTracks || validTracks.length === 0) {
    return true;
  }
  return validTracks.includes(null);
}

/**
 * Check if a discipline allows a specific track
 * @param {Array|undefined} validTracks - The discipline's validTracks array
 * @param {string} trackId - The track ID to check
 * @returns {boolean} True if the track is allowed
 */
function allowsTrack(validTracks, trackId) {
  if (!validTracks || validTracks.length === 0) {
    return true;
  }
  const trackIds = validTracks.filter((t) => t !== null);
  if (trackIds.length === 0) {
    return false;
  }
  return trackIds.includes(trackId);
}

/**
 * Check if a level meets a minimum level requirement
 * @param {Object} level - The level to check
 * @param {string} minLevelId - The minimum level ID
 * @param {Array} levels - All levels for lookup
 * @returns {boolean} True if the level meets the minimum
 */
function meetsMinLevel(level, minLevelId, levels) {
  if (!minLevelId || !levels) return true;
  const minLevelObj = levels.find((g) => g.id === minLevelId);
  if (!minLevelObj) return true;
  return level.ordinalRank >= minLevelObj.ordinalRank;
}

/**
 * Check if a combination matches any invalid combination rule
 * @param {Object} params
 * @param {string} disciplineId - The discipline ID
 * @param {string|null} trackId - The track ID (or null)
 * @param {string} levelId - The level ID
 * @param {Array} invalidCombinations - Invalid combination rules
 * @returns {boolean} True if the combination is invalid
 */
function matchesInvalidCombination(
  disciplineId,
  trackId,
  levelId,
  invalidCombinations,
) {
  for (const combo of invalidCombinations) {
    const disciplineMatch =
      !combo.discipline || combo.discipline === disciplineId;
    const trackMatch = !combo.track || combo.track === trackId;
    const levelMatch = !combo.level || combo.level === levelId;
    if (disciplineMatch && trackMatch && levelMatch) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a job combination is valid
 * @param {Object} params
 * @param {import('./levels.js').Discipline} params.discipline - The discipline
 * @param {import('./levels.js').Level} params.level - The level
 * @param {import('./levels.js').Track} [params.track] - The track (optional)
 * @param {import('./levels.js').JobValidationRules} [params.validationRules] - Optional validation rules
 * @param {Array<import('./levels.js').Level>} [params.levels] - Optional array of all levels for minLevel validation
 * @returns {boolean} True if the combination is valid
 */
export function isValidJobCombination({
  discipline,
  level,
  track = null,
  validationRules,
  levels,
}) {
  if (!meetsMinLevel(level, discipline.minLevel, levels)) {
    return false;
  }

  const validTracks = discipline.validTracks ?? [];

  if (!track) {
    return allowsTrackless(validTracks);
  }

  if (!allowsTrack(validTracks, track.id)) {
    return false;
  }

  if (!meetsMinLevel(level, track.minLevel, levels)) {
    return false;
  }

  if (validationRules?.invalidCombinations) {
    if (
      matchesInvalidCombination(
        discipline.id,
        track.id,
        level.id,
        validationRules.invalidCombinations,
      )
    ) {
      return false;
    }
  }

  return true;
}
