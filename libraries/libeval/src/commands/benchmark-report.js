/**
 * `fit-benchmark report` — aggregate `results.jsonl` into pass@k via the
 * OpenAI HumanEval estimator. Output is JSON by default; pass --format=text
 * to render a markdown table.
 */

import { resolve } from "node:path";

import { aggregate, renderTextReport } from "../benchmark/report.js";

/**
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: true} | {ok: false, code: number, error: string}>}
 */
export async function runBenchmarkReportCommand(ctx) {
  const values = ctx.options;
  const runtime = ctx.deps.runtime;
  const inputDir = values.input ?? "benchmark-runs";
  const kRaw = values.k ?? "1,3,5";
  let kValues;
  try {
    kValues = kRaw.split(",").map((t) => {
      const n = Number.parseInt(t.trim(), 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(
          "--k must be a comma-separated list of positive integers",
        );
      }
      return n;
    });
  } catch (err) {
    return { ok: false, code: 1, error: err.message };
  }
  const format = values.format ?? "json";
  if (format !== "json" && format !== "text") {
    return { ok: false, code: 1, error: "--format must be 'json' or 'text'" };
  }

  const report = await aggregate({
    inputDir: resolve(inputDir),
    kValues,
    includeRuns: format === "text",
    runtime,
  });
  if (format === "text") {
    runtime.proc.stdout.write(renderTextReport(report, kValues) + "\n");
  } else {
    runtime.proc.stdout.write(JSON.stringify(report, null, 2) + "\n");
  }
  return { ok: true };
}
