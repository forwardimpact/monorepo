/**
 * Grading derivation — the sole home of the check-row arithmetic.
 *
 * Check rows are the single authoritative grading channel. Every row is a
 * check by default; a row declares its role with its own fields, checked in
 * order:
 *
 *   1. Gate       — `gate` is exactly `true`, `pass` is boolean, and no
 *                   `weight` key is present. Any failing gate → `gatesPass`
 *                   false.
 *   2. Diagnostic — no `gate` key and `weight` is exactly `0`. Free-form;
 *                   never graded.
 *   3. Scored     — no `gate` key, boolean `pass`, `weight` absent (defaults
 *                   to 1) or finite > 0.
 *   4. Malformed  — everything else: any `gate`+`weight` co-occurrence (a
 *                   stray weight must never silently disarm a gate), a
 *                   non-boolean `gate`, a missing or non-boolean `pass` on a
 *                   graded row, an invalid `weight`, an fd-3 line that failed
 *                   to parse, a non-object row. Counts as a **failing scored
 *                   check** — dropping a defect could mint full marks;
 *                   failing the whole run would zero completed work.
 *
 * The producers' `source` stamp is display metadata, never a grading input.
 */

/**
 * @typedef {object} GradeResult
 * @property {"pass" | "fail"} verdict - `healthy ∧ gatesPass ∧ fullMarks`.
 * @property {boolean} gatesPass - Every gate row passes (vacuously true).
 * @property {number | null} score - Weighted fraction of passing scored
 *   checks; `null` when the cell has zero scored checks (binary task).
 * @property {boolean} fullMarks - Integer count predicate: no malformed rows
 *   and every scored check passes. Never a float comparison, so fractional
 *   weights carry no equality hazard. Vacuously true with zero scored checks.
 * @property {number} malformed - Malformed row count.
 */

/**
 * Grade the merged check rows against grader health.
 *
 * `healthy` is the completion signal a crashed grader cannot fake: when it is
 * false the verdict is `fail` whatever the rows say, so a hook that dies
 * after emitting passing rows can never mint marks.
 * @param {unknown[]} details - Merged check rows from both producers.
 * @param {boolean} healthy - Invariants exited 0 AND the hidden-test engine
 *   did not throw.
 * @returns {GradeResult}
 */
export function gradeChecks(details, healthy) {
  const tally = {
    gatesPass: true,
    malformed: 0,
    scored: 0,
    passing: 0,
    weightAll: 0,
    weightPassing: 0,
  };
  for (const row of details) tallyRow(tally, row);

  const score =
    tally.scored + tally.malformed === 0
      ? null
      : tally.weightPassing / tally.weightAll;
  const fullMarks = tally.malformed === 0 && tally.passing === tally.scored;
  const verdict = healthy && tally.gatesPass && fullMarks ? "pass" : "fail";
  return {
    verdict,
    gatesPass: tally.gatesPass,
    score,
    fullMarks,
    malformed: tally.malformed,
  };
}

/**
 * Fold one row into the running tally per its classified role.
 * @param {{gatesPass: boolean, malformed: number, scored: number, passing: number, weightAll: number, weightPassing: number}} tally
 * @param {unknown} row
 */
function tallyRow(tally, row) {
  const role = classifyRow(row);
  if (role === "gate") {
    if (!row.pass) tally.gatesPass = false;
  } else if (role === "scored") {
    const weight = row.weight ?? 1;
    tally.scored++;
    tally.weightAll += weight;
    if (row.pass) {
      tally.passing++;
      tally.weightPassing += weight;
    }
  } else if (role === "malformed") {
    tally.malformed++;
    tally.weightAll += malformedWeight(row);
  }
}

/**
 * Run both check-row producers and grade the merged rows — the one
 * composition shared by the runner and the `grade` subcommand. An engine
 * throw is grader fault: its message lands on the returned `engineError`
 * and health fails, so a crashed grader can never mint marks from rows it
 * happened to emit first.
 * @param {import("./task-family.js").Task} task
 * @param {{cwd: string, port: number, runDir: string, familyDir?: string|null}} ctx
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {{runInvariants: Function, runHiddenTests: Function}} producers -
 *   The two producer functions (real implementations or test seams).
 * @returns {Promise<{invariants: object, hiddenRows: object[], engineError: Error|null, rows: unknown[], healthy: boolean, grade: object}>}
 */
export async function runProducersAndGrade(task, ctx, runtime, producers) {
  const invariants = await producers.runInvariants(task, ctx, runtime);
  let hiddenRows = [];
  let engineError = null;
  try {
    const hidden = await producers.runHiddenTests(task, ctx, runtime);
    hiddenRows = hidden.details;
  } catch (e) {
    engineError = e;
  }
  const rows = mergeRows(invariants.details, hiddenRows);
  const healthy = invariants.exitCode === 0 && !engineError;
  const grade = normalizeGrade(gradeChecks(rows, healthy));
  return { invariants, hiddenRows, engineError, rows, healthy, grade };
}

/**
 * Merge the two producers' rows (invariants first) and stamp each row's
 * provenance. The stamp is display metadata, never a grading input, and
 * non-object rows (malformed by contract) pass through verbatim.
 * @param {unknown[]} invariantsDetails
 * @param {unknown[]} hiddenDetails
 * @returns {unknown[]}
 */
export function mergeRows(invariantsDetails, hiddenDetails) {
  return [
    ...invariantsDetails.map((row) => stampSource(row, "invariants")),
    ...hiddenDetails.map((row) => stampSource(row, "tests")),
  ];
}

function stampSource(row, source) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return row;
  }
  return { ...row, source };
}

/**
 * Project the raw `gradeChecks` return onto the record schema: `fullMarks`
 * is derivable and dropped, `score` is omitted on binary tasks (`null`),
 * `malformed` is omitted when clean.
 * @param {GradeResult} raw
 * @returns {{verdict: "pass"|"fail", gatesPass: boolean, score?: number, malformed?: number}}
 */
export function normalizeGrade({ verdict, gatesPass, score, malformed }) {
  return {
    verdict,
    gatesPass,
    ...(score !== null && { score }),
    ...(malformed > 0 && { malformed }),
  };
}

/**
 * Classify one row per the role order in the module contract.
 * @param {unknown} row
 * @returns {"gate" | "diagnostic" | "scored" | "malformed"}
 */
function classifyRow(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return "malformed";
  }
  if ("gate" in row) return classifyGateRow(row);
  if ("weight" in row) return classifyWeightedRow(row);
  return typeof row.pass === "boolean" ? "scored" : "malformed";
}

/**
 * A row carrying a `gate` key: valid only as `gate: true` with a boolean
 * `pass` and no `weight` key — any co-occurring weight is malformed so a
 * stray weight can never silently disarm a gate.
 * @param {object} row
 * @returns {"gate" | "malformed"}
 */
function classifyGateRow(row) {
  if ("weight" in row) return "malformed";
  return row.gate === true && typeof row.pass === "boolean"
    ? "gate"
    : "malformed";
}

/**
 * A gate-less row carrying a `weight` key: exactly 0 is a diagnostic, a
 * finite positive weight with a boolean `pass` is scored, anything else is
 * malformed.
 * @param {object} row
 * @returns {"diagnostic" | "scored" | "malformed"}
 */
function classifyWeightedRow(row) {
  if (row.weight === 0) return "diagnostic";
  return isValidWeight(row.weight) && typeof row.pass === "boolean"
    ? "scored"
    : "malformed";
}

/**
 * A malformed row fails at its own weight when it carries a valid positive
 * one, else at unit weight 1.
 * @param {unknown} row
 * @returns {number}
 */
function malformedWeight(row) {
  if (row !== null && typeof row === "object" && isValidWeight(row.weight)) {
    return row.weight;
  }
  return 1;
}

function isValidWeight(w) {
  return typeof w === "number" && Number.isFinite(w) && w > 0;
}
