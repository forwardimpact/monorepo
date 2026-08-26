/**
 * Trace identity grammar — the single owner of case ids and lane filenames.
 *
 * Builds case ids (`<taskId>-r<runIndex>`), builds raw/lane filenames under
 * the shared `trace--` convention, validates task ids, and parses names back
 * into identity. Workdir allocation, task-family loading, the shared split
 * module, and GitHub discovery all invoke this module — files agreeing by
 * convention is the drifted-copies pattern this module retires.
 */

import { basename } from "node:path";

/**
 * Task ids must not contain "--" or start/end with "-": the "--" delimiter
 * and the terminal "-r<digits>" suffix then parse unambiguously.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidTaskId(id) {
  if (typeof id !== "string" || id.length === 0) return false;
  if (id.includes("--")) return false;
  if (id.startsWith("-") || id.endsWith("-")) return false;
  return true;
}

/**
 * Build the grid-unique case id `<taskId>-r<runIndex>`. Shards partition one
 * grid, so (task, runIndex) is already grid- and shard-unique.
 * @param {string} taskId
 * @param {number} runIndex
 * @returns {string}
 * @throws {Error} when `isValidTaskId(taskId)` is false or `runIndex` is not
 *   a non-negative integer.
 */
export function buildCaseId(taskId, runIndex) {
  if (!isValidTaskId(taskId)) {
    throw new Error(
      `invalid task id '${taskId}': task ids must not contain "--" or start/end with "-"`,
    );
  }
  if (!Number.isInteger(runIndex) || runIndex < 0) {
    throw new Error(`invalid run index '${runIndex}': must be an integer ≥ 0`);
  }
  return `${taskId}-r${runIndex}`;
}

/**
 * Filename of the combined raw envelope trace: `trace--<caseId>.raw.ndjson`.
 * @param {string} caseId
 * @returns {string}
 */
export function rawTraceFilename(caseId) {
  return `trace--${caseId}.raw.ndjson`;
}

/**
 * Filename of a per-participant lane:
 * `trace--<caseId>--<participant>.<role>.ndjson`.
 * @param {string} caseId
 * @param {string} participant
 * @param {string} role
 * @returns {string}
 */
export function laneFilename(caseId, participant, role) {
  return `trace--${caseId}--${participant}.${role}.ndjson`;
}

/**
 * Parse `trace--<case>--<participant>.<role>.ndjson` into `{caseName,
 * participant}`. On no match, `caseName` is the basename minus its final
 * `.ndjson` extension only and `participant` is null.
 * @param {string} file
 * @returns {{caseName: string, participant: string|null}}
 */
export function parseIdentity(file) {
  const name = basename(file);
  const match = name.match(/^trace--(.+?)--(.+?)\.[^.]+\.ndjson$/);
  if (match) {
    return { caseName: match[1], participant: match[2] };
  }
  return { caseName: name.replace(/\.ndjson$/, ""), participant: null };
}

/**
 * Test whether a participant's trace lane is present in a list of names.
 *
 * Matches the two trace-naming shapes by *name* only (never by content):
 *   - matrix artifact name: `trace--<participant>`
 *   - dispatch member filename: `trace--<case>--<participant>.<role>.ndjson`
 *
 * The participant segment is delimited by `--` and ends at the next `--`, `.`,
 * or end-of-string, so a substring like `release` does not match
 * `release-engineer` and vice versa.
 *
 * Kept as a distinct shape from {@link parseIdentity} deliberately: this
 * matcher also accepts bare artifact names with no extension, which the
 * filename regex cannot.
 *
 * @param {string[]} names - Artifact names or extracted member filenames.
 * @param {string} participant - Participant name to look for.
 * @returns {boolean}
 */
export function participantInNames(names, participant) {
  return names.some((name) => {
    if (!name.startsWith("trace--")) return false;
    const rest = name.slice("trace--".length);
    // Matrix: `<participant>` is the whole remainder (artifact name).
    if (rest === participant) return true;
    // Dispatch: `<case>--<participant>.<role>.ndjson`.
    const sep = rest.indexOf("--");
    if (sep === -1) return false;
    const afterCase = rest.slice(sep + 2);
    const participantSegment = afterCase.split(".")[0];
    return participantSegment === participant;
  });
}

/**
 * Keyed-lookup rule for one name: true when `key` equals the exact basename,
 * the parsed case segment, or the parsed participant segment. Derives case
 * and participant via {@link parseIdentity} and reuses the
 * {@link participantInNames} single-name check — no second grammar.
 * @param {string} name - A member basename or artifact name.
 * @param {string} key - Exact filename, case id, or participant name.
 * @returns {boolean}
 */
export function nameMatchesKey(name, key) {
  if (name === key) return true;
  const identity = parseIdentity(name);
  if (identity.participant !== null && identity.caseName === key) return true;
  return participantInNames([name], key);
}
