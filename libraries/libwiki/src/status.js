// STATUS.md row ids may carry a `/<unit>` suffix denoting a
// per-migration-unit sub-row of a master spec (`1370/libutil`, …). The master
// `NNNN` row advances only when every sub-row reads `plan implemented`.

/** Matches a status-row id: four digits, optionally a `/<unit>` suffix. */
export const STATUS_ID_REGEX = /^\d{4}(\/[a-z0-9-]+)?$/;

/**
 * Parse a status-row id into its master spec id and optional unit suffix.
 * @param {string} id - The id field of a STATUS.md row.
 * @returns {{ specId: string, unit: string|null }|null} Parsed parts, or null
 *   when the id does not match {@link STATUS_ID_REGEX}.
 */
export function parseStatusRowId(id) {
  if (typeof id !== "string" || !STATUS_ID_REGEX.test(id)) return null;
  const slash = id.indexOf("/");
  if (slash === -1) return { specId: id, unit: null };
  return { specId: id.slice(0, slash), unit: id.slice(slash + 1) };
}
