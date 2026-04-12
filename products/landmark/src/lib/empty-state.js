/**
 * Central registry of empty-state messages.
 *
 * Every entry corresponds to a row in spec § Empty States and Error
 * Behavior. Commands set `meta.emptyState` to one of these values when
 * a data source is missing or empty.
 */

export const EMPTY_STATES = {
  NO_EVIDENCE:
    "No evidence data available. Guide has not yet interpreted artifacts for this scope.",
  NO_MARKERS_FOR_SKILL: (skill) =>
    `No markers defined for ${skill}. Add markers to the capability YAML.`,
  NO_MARKERS_AT_TARGET:
    "No markers defined at target level — cannot generate checklist.",
  NO_SNAPSHOTS:
    "No GetDX snapshot data available. Run `fit-map getdx sync` (or `fit-map activity seed` for synthetic data) to ingest.",
  NO_COMMENTS:
    "Snapshot comments not available. The getdx_snapshot_comments table has not been created.",
  NO_INITIATIVES:
    "Initiative data not available. The getdx_initiatives table has not been created.",
  NO_ORGANIZATION:
    "No organization data available. Run `fit-map people push` to load roster data.",
  PERSON_NOT_FOUND: (email) =>
    `No person found with email ${email} in organization_people.`,
  MANAGER_NOT_FOUND: (email) => `No team found for manager ${email}.`,
  NO_HIGHER_LEVEL: (id) =>
    `No higher level defined in levels.yaml. Current level (${id}) is the highest.`,
  NO_ARTIFACTS_FOR_PERSON: (email) => `No artifacts found for ${email}.`,
  NO_EVIDENCE_WITH_NOTE:
    "No evidence data found. Evidenced depth reflects Guide-interpreted artifacts only.",
};
