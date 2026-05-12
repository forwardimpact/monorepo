/**
 * ReportAggregator — read a run-output directory's `results.jsonl`, group
 * records by `taskId`, and compute pass@k via the OpenAI HumanEval
 * unbiased estimator: `1 - C(n-c, k) / C(n, k)`.
 *
 * When `includeRuns` is true, each task carries per-run detail (scoring
 * checks, judge commentary, cost, duration) and the text renderer produces
 * a full markdown report instead of just the pass@k table.
 *
 * Records that fail schema validation are skipped with a stderr warning
 * (counted under `totals.skipped`) so a corrupt line cannot abort the
 * whole report.
 */

import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { validateResultRecord } from "./result.js";

/**
 * @typedef {object} RunDetail
 * @property {number} runIndex
 * @property {"pass"|"fail"} verdict
 * @property {{verdict: string, details: unknown[], exitCode: number}} [scoring]
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
 * @param {{inputDir: string, kValues: number[], includeRuns?: boolean}} opts
 * @returns {Promise<{tasks: TaskReport[], totals: object}>}
 */
export async function aggregate({ inputDir, kValues, includeRuns = false }) {
  const records = await loadRecords(inputDir);
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
    ...(r.scoring && { scoring: r.scoring }),
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
// Compact report (legacy path)
// ---------------------------------------------------------------------------

function renderCompactReport(report, kValues) {
  const lines = [
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
  const lines = [
    "# Benchmark Report",
    "",
    `**Result: ${passing}/${totals.tasks} tasks passing** | ${totals.runs} runs${totals.skipped ? ` | ${totals.skipped} skipped` : ""}`,
  ];
  const meta = [];
  if (totals.model) meta.push(`Model: \`${totals.model}\``);
  if (totals.skillSetHash) meta.push(`Skill set: \`${totals.skillSetHash}\``);
  if (totals.familyRevision) meta.push(`Family: \`${totals.familyRevision}\``);
  if (meta.length) lines.push(meta.join(" | "));

  const stats = [];
  if (totals.costUsd != null) stats.push(`Cost: ${formatCost(totals.costUsd)}`);
  if (totals.medianDurationMs != null)
    stats.push(`Median duration: ${formatDuration(totals.medianDurationMs)}`);
  if (totals.medianTurns != null)
    stats.push(`Median turns: ${totals.medianTurns}`);
  if (stats.length) lines.push(stats.join(" | "));

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
  const status = task.c === task.n ? "PASS" : "FAIL";
  const singleRun = runs.length === 1;

  const lines = [
    `### ${task.taskId}`,
    "",
    `**${status} — ${task.c}/${task.n} runs passed**`,
  ];

  lines.push("", renderRunsTable(runs));

  const checks = renderScoringChecks(runs, singleRun);
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
    "Scoring",
    "Judge",
    "Cost",
    "Turns",
    "Duration",
  ];
  const rows = [header, header.map(() => "---")];
  for (const r of runs) {
    const scoringCell = r.preflightError
      ? "preflight error"
      : r.scoring
        ? r.scoring.verdict
        : "—";
    const judgeCell = r.preflightError
      ? "—"
      : r.judgeVerdict
        ? r.judgeVerdict.verdict
        : "—";
    rows.push([
      String(r.runIndex),
      r.verdict.toUpperCase(),
      scoringCell,
      judgeCell,
      formatCost(r.costUsd),
      String(r.turns),
      formatDuration(r.durationMs),
    ]);
  }
  return rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function renderScoringChecks(runs, singleRun) {
  const rows = collectScoringRows(runs);
  if (!rows.length) return null;

  const header = singleRun
    ? ["Check", "Result", "Message"]
    : ["Run", "Check", "Result", "Message"];
  const lines = [
    "#### Scoring Checks",
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

function collectScoringRows(runs) {
  const rows = [];
  for (const r of runs) {
    if (!r.scoring?.details?.length) continue;
    for (const d of r.scoring.details) {
      rows.push({
        run: r.runIndex,
        check: escapeCell(String(d.test ?? "(unnamed)")),
        result: d.pass ? "PASS" : "FAIL",
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

async function loadRecords(inputDir) {
  const path = join(inputDir, "results.jsonl");
  const stream = createReadStream(path);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const records = [];
  let skipped = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch (e) {
      process.stderr.write(
        `benchmark report: skipped malformed JSON line — ${e.message}\n`,
      );
      skipped++;
      continue;
    }
    try {
      validateResultRecord(record);
    } catch (e) {
      process.stderr.write(
        `benchmark report: skipped record failing schema — ${describeError(e)}\n`,
      );
      skipped++;
      continue;
    }
    records.push(record);
  }
  return { records, skipped };
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
