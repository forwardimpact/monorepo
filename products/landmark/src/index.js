/**
 * @forwardimpact/landmark
 *
 * Analysis and recommendation layer on top of Map activity data.
 * Public API re-exports.
 */

export {
  createLandmarkClient,
  SupabaseUnavailableError,
} from "./lib/supabase.js";
export { EMPTY_STATES } from "./lib/empty-state.js";
