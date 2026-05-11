/**
 * ReportAggregator (spec 870 plan-a Step 9).
 *
 * Walks a run-output directory's `results.jsonl`, validates each record,
 * groups by `taskId`, and computes pass@k via the OpenAI HumanEval
 * unbiased estimator (`1 - C(n-c, k) / C(n, k)`).
 *
 * Malformed lines are skipped with a structured warning to stderr; the
 * skipped count surfaces on the report so reviewers see drift instead of
 * a silently shrunk denominator.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { validateResultRecord } from "./result.js";

/**
 * Compute the OpenAI HumanEval unbiased pass@k estimator:
 *   pass@k = 1 - C(n - c, k) / C(n, k)
 *
 * BigInt arithmetic is used to avoid loss-of-precision for large n.
 * Returns `null` when `k > n` (caller surfaces this as an error row).
 *
 * @param {number} n - Total runs for a task.
 * @param {number} c - Number of passing runs.
 * @param {number} k
 * @returns {number | null}
 */
export function passAtK(n, c, k) {
  if (k > n) return null;
  if (c >= n) return 1;
  if (n - c < k) return 1;
  const num = binomial(BigInt(n - c), BigInt(k));
  const den = binomial(BigInt(n), BigInt(k));
  if (den === 0n) return null;
  return 1 - Number((num * 10n ** 12n) / den) / 1e12;
}

function binomial(n, k) {
  if (k < 0n || k > n) return 0n;
  if (k === 0n || k === n) return 1n;
  const kk = k > n - k ? n - k : k;
  let result = 1n;
  for (let i = 0n; i < kk; i++) {
    result = (result * (n - i)) / (i + 1n);
  }
  return result;
}

/**
 * @typedef {{
 *   tasks: Array<{ taskId: string, n: number, c: number, passAtK: Record<number, number | { value: null, error: string }> }>,
 *   totals: { tasks: number, runs: number, skipped: number },
 * }} Report
 */

/**
 * Read `<inputDir>/results.jsonl`, validate each line, and compute pass@k
 * across the configured k-values.
 *
 * @param {{ inputDir: string, kValues: number[] }} deps
 * @returns {Promise<Report>}
 */
export async function aggregate({ inputDir, kValues }) {
  const buckets = new Map();
  let skipped = 0;
  let totalRuns = 0;

  const rl = createInterface({
    input: createReadStream(join(inputDir, "results.jsonl"), {
      encoding: "utf8",
    }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record;
    try {
      record = JSON.parse(trimmed);
      validateResultRecord(record);
    } catch (err) {
      skipped++;
      process.stderr.write(
        `[fit-benchmark report] skipping malformed record: ${err.message}\n`,
      );
      continue;
    }
    totalRuns++;
    const taskId = record.taskId;
    const bucket = buckets.get(taskId) ?? { n: 0, c: 0 };
    bucket.n++;
    if (record.verdict === "pass") bucket.c++;
    buckets.set(taskId, bucket);
  }

  const tasks = [];
  for (const [taskId, { n, c }] of buckets) {
    const passAtKBag = {};
    for (const k of kValues) {
      const value = passAtK(n, c, k);
      passAtKBag[k] = value === null ? { value: null, error: "k > n" } : value;
    }
    tasks.push({ taskId, n, c, passAtK: passAtKBag });
  }
  tasks.sort((a, b) => (a.taskId < b.taskId ? -1 : 1));

  return {
    tasks,
    totals: { tasks: tasks.length, runs: totalRuns, skipped },
  };
}

/**
 * Render a `Report` as a Markdown table for `--format=text`.
 * @param {Report} report
 * @param {number[]} kValues
 * @returns {string}
 */
export function renderReportMarkdown(report, kValues) {
  const headers = ["taskId", "n", "c", ...kValues.map((k) => `pass@${k}`)];
  const lines = [`| ${headers.join(" | ")} |`];
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const t of report.tasks) {
    const row = [t.taskId, String(t.n), String(t.c)];
    for (const k of kValues) {
      const v = t.passAtK[k];
      if (typeof v === "number") row.push(v.toFixed(4));
      else row.push("n/a");
    }
    lines.push(`| ${row.join(" | ")} |`);
  }
  lines.push("");
  lines.push(
    `Totals — tasks: ${report.totals.tasks}, runs: ${report.totals.runs}, skipped: ${report.totals.skipped}`,
  );
  return lines.join("\n");
}
