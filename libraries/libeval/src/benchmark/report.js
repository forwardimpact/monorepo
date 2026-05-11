/**
 * ReportAggregator — read a run-output directory's `results.jsonl`, group
 * records by `taskId`, and compute pass@k via the OpenAI HumanEval
 * unbiased estimator: `1 - C(n-c, k) / C(n, k)`.
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
 * @typedef {object} TaskReport
 * @property {string} taskId
 * @property {number} n - Total runs.
 * @property {number} c - Passing runs.
 * @property {Record<string|number, number|null>} passAtK
 */

/**
 * @param {{inputDir: string, kValues: number[]}} opts
 * @returns {Promise<{tasks: TaskReport[], totals: {tasks: number, runs: number, skipped: number}}>}
 */
export async function aggregate({ inputDir, kValues }) {
  const records = await loadRecords(inputDir);
  const grouped = groupByTask(records.records);
  const tasks = [];
  let runs = 0;
  for (const [taskId, group] of grouped) {
    const n = group.length;
    const c = group.filter((r) => r.verdict === "pass").length;
    runs += n;
    const passAtK = {};
    for (const k of kValues) passAtK[k] = passAtKValue(n, c, k);
    tasks.push({ taskId, n, c, passAtK });
  }
  tasks.sort((a, b) =>
    a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0,
  );
  return {
    tasks,
    totals: { tasks: tasks.length, runs, skipped: records.skipped },
  };
}

/**
 * Render an aggregate report as a Markdown table. Columns: taskId | n | c |
 * pass@k1 | pass@k2 ... — one column per kValues entry, in the same order.
 * @param {Awaited<ReturnType<typeof aggregate>>} report
 * @param {number[]} kValues
 * @returns {string}
 */
export function renderTextReport(report, kValues) {
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
  const lines = rows.map((r) => `| ${r.join(" | ")} |`);
  lines.push("");
  lines.push(
    `Totals — tasks: ${report.totals.tasks}, runs: ${report.totals.runs}, skipped: ${report.totals.skipped}`,
  );
  return lines.join("\n");
}

function formatPassAt(v) {
  if (v == null) return "—";
  if (typeof v === "object" && "error" in v) return v.error;
  return Number(v).toFixed(4);
}

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
  // Compute the ratio as a single division so we avoid `1 - x` which
  // accumulates IEEE-754 error (e.g. 1 - 0.6 = 0.39999...).
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
