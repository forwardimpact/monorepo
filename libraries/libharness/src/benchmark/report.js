/**
 * ReportAggregator — read a run-output directory's `results.jsonl`, group
 * records by `taskId`, and compute pass@k via the OpenAI HumanEval
 * unbiased estimator: `1 - C(n-c, k) / C(n, k)`.
 *
 * When `includeRuns` is true, each task carries per-run detail (invariant
 * checks, judge commentary, cost, duration) and the text renderer produces
 * a full markdown report instead of just the pass@k table.
 *
 * Records that fail schema validation are skipped with a stderr warning
 * (counted under `totals.skipped`) so a corrupt line cannot abort the
 * whole report.
 */

import { join } from "node:path";

import { validateResultRecord } from "./result.js";

/**
 * @typedef {object} RunDetail
 * @property {number} runIndex
 * @property {"pass"|"fail"} verdict
 * @property {{verdict: string, details: unknown[], exitCode: number}} [invariants]
 * @property {{verdict: string, summary: string}} [judgeVerdict]
 * @property {number} costUsd
 * @property {number} turns
 * @property {number} durationMs
 * @property {{message: string, aborted: boolean}} [agentError]
 * @property {{phase: string, message: string, exitCode: number}} [preflightError]
 */

/**
 * @typedef {object} TaskReport
 * @property {string} taskId
 * @property {number} n - Total runs.
 * @property {number} c - Passing runs.
 * @property {Record<string|number, number|null>} passAtK
 * @property {RunDetail[]} [runs] - Per-run detail (only when includeRuns).
 */

/**
 * @param {{inputDir: string, kValues: number[], includeRuns?: boolean, runtime: import("@forwardimpact/libutil/runtime").Runtime}} opts
 * @returns {Promise<{tasks: TaskReport[], totals: object}>}
 */
export async function aggregate({
  inputDir,
  kValues,
  includeRuns = false,
  runtime,
}) {
  if (!runtime) throw new Error("runtime is required");
  const records = await loadRecords(inputDir, runtime);
  const grouped = groupByTask(records.records);
  const tasks = [];
  let totalRuns = 0;
  let totalCost = 0;
  const allDurations = [];
  const allTurns = [];
  let firstRecord = null;

  for (const [taskId, group] of grouped) {
    const n = group.length;
    const c = group.filter((r) => r.verdict === "pass").length;
    totalRuns += n;
    const passAtK = {};
    for (const k of kValues) passAtK[k] = passAtKValue(n, c, k);

    const task = { taskId, n, c, passAtK };

    // A group is scored iff any record carries an effective score. A
    // score-less record in a scored group (a preflight failure never reached
    // grading, or a binary run) contributes its verdict as the degenerate
    // score — skipping it would inflate the mean exactly when the agent
    // fails hardest.
    if (group.some((r) => r.score !== undefined)) {
      const scores = group.map(
        (r) => r.score ?? (r.verdict === "pass" ? 1 : 0),
      );
      task.meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      task.scoreAtK = {};
      for (const k of kValues) task.scoreAtK[k] = scoreAtKValue(scores, k);
    }

    if (includeRuns) {
      if (!firstRecord) firstRecord = group[0];
      const accumulators = { allDurations, allTurns };
      task.runs = group
        .map((r) => {
          totalCost += r.costUsd ?? 0;
          return buildRunDetail(r, accumulators);
        })
        .sort((a, b) => a.runIndex - b.runIndex);
    }

    tasks.push(task);
  }
  tasks.sort((a, b) =>
    a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0,
  );

  const totals = {
    tasks: tasks.length,
    runs: totalRuns,
    skipped: records.skipped,
  };

  if (includeRuns) {
    totals.costUsd = totalCost;
    totals.medianDurationMs = median(allDurations);
    totals.medianTurns = median(allTurns);
    totals.model = firstRecord?.model ?? "";
    totals.skillSetHash = firstRecord?.skillSetHash ?? "";
    totals.familyRevision = firstRecord?.familyRevision ?? "";
  }

  return { tasks, totals };
}

/**
 * Build a normalized per-run detail object and accumulate duration/turn
 * samples for median calculation. Extracted from `aggregate` to keep its
 * cognitive complexity below the lint ceiling.
 * @param {object} r - Raw record.
 * @param {{allDurations: number[], allTurns: number[]}} acc
 * @returns {RunDetail}
 */
function buildRunDetail(r, acc) {
  if (r.durationMs != null) acc.allDurations.push(r.durationMs);
  if (r.turns != null) acc.allTurns.push(r.turns);
  return {
    runIndex: r.runIndex,
    verdict: r.verdict,
    ...(r.invariants && { invariants: r.invariants }),
    ...(r.judgeVerdict && { judgeVerdict: r.judgeVerdict }),
    costUsd: r.costUsd ?? 0,
    turns: r.turns ?? 0,
    durationMs: r.durationMs ?? 0,
    ...(r.agentError && { agentError: r.agentError }),
    ...(r.preflightError && { preflightError: r.preflightError }),
  };
}

/**
 * Render an aggregate report as markdown. When the report contains per-run
 * detail (from `includeRuns: true`), renders a full report with summary,
 * pass@k table, and per-task detail sections. Otherwise falls back to the
 * compact pass@k table.
 * @param {Awaited<ReturnType<typeof aggregate>>} report
 * @param {number[]} kValues
 * @returns {string}
 */
export function renderTextReport(report, kValues) {
  if (report.tasks[0]?.runs) {
    return renderFullReport(report, kValues);
  }
  return renderCompactReport(report, kValues);
}

// ---------------------------------------------------------------------------
// Compact report — status line + pass@k table, no per-task detail. Selected by
// `report --detail=compact` (aggregate without `includeRuns`); the per-shard
// summary uses it so a sharded run stays short while the merge job renders the
// full report over the combined ledger.
// ---------------------------------------------------------------------------

function renderCompactReport(report, kValues) {
  const { totals } = report;
  const passing = report.tasks.filter((t) => t.c > 0 && t.c === t.n).length;
  const icon = statusIcon(passing === totals.tasks);
  const lines = [
    `${icon} **${passing}/${totals.tasks} tasks passing** | ${totals.runs} runs${totals.skipped ? ` | ${totals.skipped} skipped` : ""}`,
    "",
    renderPassAtKTable(report, kValues),
    "",
    renderTotalsLine(report),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

function renderFullReport(report, kValues) {
  const sections = [
    renderSummary(report),
    "## Pass@k",
    "",
    renderPassAtKTable(report, kValues),
    "",
    renderTotalsLine(report),
    "",
    "## Task Details",
  ];

  for (const task of report.tasks) {
    sections.push("");
    sections.push(renderTaskDetail(task));
  }

  return sections.join("\n");
}

function renderSummary(report) {
  const { totals } = report;
  const passing = report.tasks.filter((t) => t.c > 0 && t.c === t.n).length;
  const icon = statusIcon(passing === totals.tasks);
  const lines = [
    "# Benchmark Report",
    "",
    `${icon} **${passing}/${totals.tasks} tasks passing** | ${totals.runs} runs${totals.skipped ? ` | ${totals.skipped} skipped` : ""}`,
  ];

  const headers = [];
  const values = [];
  if (totals.costUsd != null) {
    headers.push("Cost");
    values.push(formatCost(totals.costUsd));
  }
  if (totals.medianDurationMs != null) {
    headers.push("Median Duration");
    values.push(formatDuration(totals.medianDurationMs));
  }
  if (totals.medianTurns != null) {
    headers.push("Median Turns");
    values.push(String(totals.medianTurns));
  }
  if (headers.length) {
    lines.push("");
    lines.push(`| ${headers.join(" | ")} |`);
    lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
    lines.push(`| ${values.join(" | ")} |`);
  }

  const meta = [];
  if (totals.model) {
    meta.push(`Agent: \`${totals.model.agent}\``);
    meta.push(`Supervisor: \`${totals.model.supervisor}\``);
    meta.push(`Judge: \`${totals.model.judge}\``);
  }
  if (totals.skillSetHash) meta.push(`Skill set: \`${totals.skillSetHash}\``);
  if (totals.familyRevision) meta.push(`Family: \`${totals.familyRevision}\``);
  if (meta.length) {
    lines.push("");
    lines.push(meta.join(" | "));
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Pass@k table (shared between compact and full)
// ---------------------------------------------------------------------------

function renderPassAtKTable(report, kValues) {
  const header = ["taskId", "n", "c", ...kValues.map((k) => `pass@${k}`)];
  const rows = [header, header.map(() => "---")];
  for (const t of report.tasks) {
    rows.push([
      t.taskId,
      String(t.n),
      String(t.c),
      ...kValues.map((k) => formatPassAt(t.passAtK[k])),
    ]);
  }
  return rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function renderTotalsLine(report) {
  return `Totals — tasks: ${report.totals.tasks}, runs: ${report.totals.runs}, skipped: ${report.totals.skipped}`;
}

// ---------------------------------------------------------------------------
// Per-task detail
// ---------------------------------------------------------------------------

function renderTaskDetail(task) {
  const runs = task.runs ?? [];
  const icon = statusIcon(task.c === task.n);
  const singleRun = runs.length === 1;

  const lines = [
    `### ${task.taskId}`,
    "",
    `${icon} **${task.c}/${task.n} runs passed**`,
  ];

  lines.push("", renderRunsTable(runs));

  const checks = renderInvariantChecks(runs, singleRun);
  if (checks) lines.push("", checks);

  const commentary = renderJudgeCommentary(runs, singleRun);
  if (commentary) lines.push("", commentary);

  const errors = renderErrors(runs);
  if (errors) lines.push("", errors);

  return lines.join("\n");
}

function renderRunsTable(runs) {
  const header = [
    "Run",
    "Verdict",
    "Invariants",
    "Judge",
    "Cost",
    "Turns",
    "Duration",
  ];
  const rows = [header, header.map(() => "---")];
  for (const r of runs) {
    const invariantsCell = r.preflightError
      ? "preflight error"
      : r.invariants
        ? statusIcon(r.invariants.verdict === "pass")
        : "—";
    const judgeCell = r.preflightError
      ? "—"
      : r.judgeVerdict
        ? statusIcon(r.judgeVerdict.verdict === "pass")
        : "—";
    rows.push([
      String(r.runIndex),
      statusIcon(r.verdict === "pass"),
      invariantsCell,
      judgeCell,
      formatCost(r.costUsd),
      String(r.turns),
      formatDuration(r.durationMs),
    ]);
  }
  return rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function renderInvariantChecks(runs, singleRun) {
  const rows = collectInvariantRows(runs);
  if (!rows.length) return null;

  const header = singleRun
    ? ["Check", "Result", "Message"]
    : ["Run", "Check", "Result", "Message"];
  const lines = [
    "#### Invariant Checks",
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    const cells = singleRun
      ? [row.check, row.result, row.message]
      : [String(row.run), row.check, row.result, row.message];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

function collectInvariantRows(runs) {
  const rows = [];
  for (const r of runs) {
    if (!r.invariants?.details?.length) continue;
    for (const d of r.invariants.details) {
      rows.push({
        run: r.runIndex,
        check: escapeCell(String(d.test ?? "(unnamed)")),
        result: statusIcon(d.pass),
        message: escapeCell(String(d.message ?? "")),
      });
    }
  }
  return rows;
}

function renderJudgeCommentary(runs, singleRun) {
  const entries = runs.filter((r) => r.judgeVerdict?.summary);
  if (!entries.length) return null;

  const lines = ["#### Judge Commentary", ""];
  for (let i = 0; i < entries.length; i++) {
    const r = entries[i];
    const summary = r.judgeVerdict.summary.replace(/\n/g, "\n> ");
    if (singleRun) {
      lines.push(`> ${summary}`);
    } else {
      lines.push(`> **Run ${r.runIndex}:** ${summary}`);
    }
    if (i < entries.length - 1) lines.push(">");
  }
  return lines.join("\n");
}

function renderErrors(runs) {
  const lines = [];
  for (const r of runs) {
    if (r.agentError) {
      lines.push(
        `- **Run ${r.runIndex}:** Agent error — "${escapeCell(r.agentError.message)}" (aborted: ${r.agentError.aborted})`,
      );
    }
    if (r.preflightError) {
      lines.push(
        `- **Run ${r.runIndex}:** Preflight error — "${escapeCell(r.preflightError.message)}" (exit ${r.preflightError.exitCode})`,
      );
    }
  }
  if (!lines.length) return null;
  return ["#### Errors", "", ...lines].join("\n");
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function statusIcon(pass) {
  return pass ? "✅" : "❌";
}

function formatPassAt(v) {
  if (v == null) return "—";
  if (typeof v === "object" && "error" in v) return v.error;
  return Number(v).toFixed(4);
}

function formatDuration(ms) {
  if (ms == null || ms === 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatCost(usd) {
  if (usd == null) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

function escapeCell(str) {
  return str.replace(/\|/g, "\\|");
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

// ---------------------------------------------------------------------------
// Record loading
// ---------------------------------------------------------------------------

// Directories never worth descending for a `results.jsonl`.
const SKIP_DIRS = new Set([".git", "node_modules"]);

/**
 * Load and union every `results.jsonl` found recursively under `inputDir`.
 *
 * A single non-sharded run has one root-level ledger — the trivial one-match
 * case of the same walk. A sharded run lays each shard's partial ledger in its
 * own subdirectory; merging them equals reporting a single run over the same
 * cells. An *existing* dir with no ledger yields the empty union (exit 0); a
 * *missing* dir lets `readdir`'s ENOENT propagate so `report` still errors.
 * @param {string} inputDir
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {Promise<{records: object[], skipped: number}>}
 */
async function loadRecords(inputDir, runtime) {
  let files;
  try {
    files = await collectResultsFiles(inputDir, runtime);
  } catch (e) {
    // Re-throw with the stack collapsed to the message line so the CLI's
    // error rendering stays free of node-internal async `readdir` frames
    // (a missing --input dir surfaces its ENOENT as exit 1, matching the
    // pre-1370 stream-error shape the golden captured).
    const err = new Error(e.message);
    if (e.code) err.code = e.code;
    err.stack = `Error: ${e.message}`;
    throw err;
  }
  const records = [];
  let skipped = 0;
  for (const file of files) {
    const content = await runtime.fs.readFile(file, "utf8");
    skipped += parseLedgerInto(content, records, runtime);
  }
  warnOnDuplicateCells(records, runtime);
  return { records, skipped };
}

/**
 * Parse one ledger's JSONL into `records`, skipping malformed or schema-invalid
 * lines with a stderr warning. Returns the skipped count. Extracted from
 * `loadRecords` to keep its cognitive complexity under the lint ceiling.
 * @param {string} content
 * @param {object[]} records - Accumulator, appended in place.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {number} Skipped line count.
 */
function parseLedgerInto(content, records, runtime) {
  let skipped = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch (e) {
      runtime.proc.stderr.write(
        `benchmark report: skipped malformed JSON line — ${e.message}\n`,
      );
      skipped++;
      continue;
    }
    try {
      validateResultRecord(record);
    } catch (e) {
      runtime.proc.stderr.write(
        `benchmark report: skipped record failing schema — ${describeError(e)}\n`,
      );
      skipped++;
      continue;
    }
    records.push(record);
  }
  return skipped;
}

/**
 * Recursively collect paths of every file named `results.jsonl` under `dir`,
 * skipping `.git`/`node_modules` and never following symlinks. A purpose-built
 * `readdir` walk — `task-family.js`'s private `walkFiles` resolves symlinks and
 * is unexported, which is the wrong contract here.
 * @param {string} dir
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {Promise<string[]>}
 */
async function collectResultsFiles(dir, runtime) {
  const entries = await runtime.fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const out = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...(await collectResultsFiles(full, runtime)));
    } else if (entry.isFile() && entry.name === "results.jsonl") {
      out.push(full);
    }
  }
  return out;
}

/**
 * Warn (do not silently merge) when a `(taskId, runIndex)` cell appears more
 * than once across shard ledgers. The shard partition guarantees uniqueness, so
 * a duplicate signals misconfiguration; both copies stay in the group so the
 * count is honest.
 * @param {object[]} records
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 */
function warnOnDuplicateCells(records, runtime) {
  const counts = new Map();
  for (const r of records) {
    const key = `${r.taskId}#${r.runIndex}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, n] of counts) {
    if (n > 1)
      runtime.proc.stderr.write(
        `benchmark report: duplicate cell ${key} appears ${n} times across shard ledgers — the shard partition should make each cell unique\n`,
      );
  }
}

function describeError(e) {
  if (e && Array.isArray(e.issues)) {
    return e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  return e.message ?? String(e);
}

function groupByTask(records) {
  const out = new Map();
  for (const r of records) {
    if (!out.has(r.taskId)) out.set(r.taskId, []);
    out.get(r.taskId).push(r);
  }
  return out;
}

/**
 * pass@k = 1 - C(n - c, k) / C(n, k). Compute with BigInt to avoid
 * floating-point loss on large n.
 * @param {number} n
 * @param {number} c
 * @param {number} k
 * @returns {number | {error: string}}
 */
function passAtKValue(n, c, k) {
  if (k > n) return { error: "k > n" };
  if (n - c < k) return 1;
  const total = binomial(BigInt(n), BigInt(k));
  const fail = binomial(BigInt(n - c), BigInt(k));
  const passing = total - fail;
  return Number(passing) / Number(total);
}

/**
 * score@k — the expected **maximum** score over k runs drawn without
 * replacement from the n recorded scores; the continuous analog of pass@k.
 * With scores sorted ascending s₍₁₎…s₍ₙ₎:
 *
 *   score@k = Σ_{i=k..n} s₍ᵢ₎ · C(i−1, k−1) / C(n, k)
 *
 * Each term weights s₍ᵢ₎ by the probability it is the k-subset's maximum.
 * Binary scores reduce exactly to the pass@k estimator (same BigInt binomial
 * helper); `k > n` yields the same `{error}` value — one idiom.
 * @param {number[]} scores - Effective per-record scores.
 * @param {number} k
 * @returns {number | {error: string}}
 */
function scoreAtKValue(scores, k) {
  const n = scores.length;
  if (k > n) return { error: "k > n" };
  const sorted = [...scores].sort((a, b) => a - b);
  const total = Number(binomial(BigInt(n), BigInt(k)));
  let sum = 0;
  for (let i = k; i <= n; i++) {
    const weight = Number(binomial(BigInt(i - 1), BigInt(k - 1))) / total;
    sum += sorted[i - 1] * weight;
  }
  return sum;
}

function binomial(n, k) {
  if (k < 0n || k > n) return 0n;
  if (k === 0n || k === n) return 1n;
  let kk = k;
  if (kk > n - kk) kk = n - kk;
  let result = 1n;
  for (let i = 0n; i < kk; i++) {
    result = (result * (n - i)) / (i + 1n);
  }
  return result;
}
