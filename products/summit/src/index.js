/**
 * @forwardimpact/summit
 *
 * Team capability planning from skill data. Public API re-exports.
 * Grown across parts — downstream consumers (currently Landmark) import
 * from here.
 */

export {
  loadRoster,
  parseRosterYaml,
  loadRosterFromMap,
  validateRosterAgainstFramework,
} from "./roster/index.js";
export {
  createSummitClient,
  SupabaseUnavailableError,
} from "./lib/supabase.js";
