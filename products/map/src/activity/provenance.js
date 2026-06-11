/**
 * Provenance class vocabulary for evidence rows.
 * Shared between WriteEvidence (services/map) and the activity transform
 * producers (products/map/src/activity/transform/).
 */

export const PROVENANCE_CLASSES = Object.freeze([
  "synthetic_placeholder",
  "artifact_interpreted",
  "agent_attested",
  "human_attested",
]);

const VALID = new Set(PROVENANCE_CLASSES);

/**
 * Throw if `value` is not one of PROVENANCE_CLASSES. Empty / undefined is
 * allowed — callers map it to the DB default before insert.
 * @param {string | undefined | null} value
 */
export function assertProvenance(value) {
  if (value === undefined || value === null || value === "") return;
  if (!VALID.has(value)) {
    throw new Error(
      `Invalid provenance "${value}". Must be one of: ${PROVENANCE_CLASSES.join(", ")}.`,
    );
  }
}
