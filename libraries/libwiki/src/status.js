// STATUS.md rows come in two kinds. A spec row's id is four digits with an
// optional `/<unit>` suffix denoting a per-migration-unit sub-row of a master
// spec (`1370/libutil`, …); the master `NNNN` row advances only when every
// sub-row reads `plan implemented`. An experiment row's id is `exp:<issue>`
// and the row carries four tab cells — `exp:<issue><TAB><state><TAB><pin>
// <TAB><plan-ref>` — keying the merge-gate approval path for a spec-less
// experiment PR. The `exp:` namespace cannot match the spec id's `^\d{4}`
// anchor, so the two kinds never collide for any issue-number width.

/** Matches a status-row id: a four-digit spec id (optional `/<unit>`) or `exp:<issue>`. */
export const STATUS_ID_REGEX = /^(\d{4}(\/[a-z0-9-]+)?|exp:\d+)$/;

/**
 * Classify a status-row id into its kind and parts. Experiment rows are
 * identified by an `exp:` id together with a four-cell row; the optional
 * `cells` array supplies that count (a bare `exp:` id without four cells is
 * not a valid row and yields null).
 * @param {string} id - The id field (cell 0) of a STATUS.md row.
 * @param {string[]} [cells] - The full tab-separated cells of the row, when
 *   available. Required to classify an experiment row.
 * @returns {(
 *   {kind: "spec", specId: string, unit: string|null} |
 *   {kind: "experiment", issue: string, state: string, pin: string, planRef: string} |
 *   null
 * )} Parsed parts, or null when the id/row does not match a known kind.
 */
export function parseStatusRowId(id, cells) {
  if (typeof id !== "string" || !STATUS_ID_REGEX.test(id)) return null;
  if (id.startsWith("exp:")) {
    if (!Array.isArray(cells) || cells.length !== 4) return null;
    return {
      kind: "experiment",
      issue: id.slice("exp:".length),
      state: cells[1],
      pin: cells[2],
      planRef: cells[3],
    };
  }
  const slash = id.indexOf("/");
  if (slash === -1) return { kind: "spec", specId: id, unit: null };
  return {
    kind: "spec",
    specId: id.slice(0, slash),
    unit: id.slice(slash + 1),
  };
}
