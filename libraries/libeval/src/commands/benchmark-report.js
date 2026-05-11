/**
 * `fit-benchmark report` — aggregate `results.jsonl` into pass@k via the
 * OpenAI HumanEval estimator. Output is JSON by default; pass --format=text
 * to render a markdown table.
 */

import { resolve } from "node:path";

import { aggregate, renderTextReport } from "../benchmark/report.js";

/**
 * @param {object} values
 * @param {string[]} _args
 */
export async function runBenchmarkReportCommand(values, _args) {
  const inputDir = values.input;
  if (!inputDir) throw new Error("--input is required");
  const kRaw = values.k ?? "1,3,5";
  const kValues = kRaw.split(",").map((t) => {
    const n = Number.parseInt(t.trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(
        "--k must be a comma-separated list of positive integers",
      );
    }
    return n;
  });
  const format = values.format ?? "json";
  if (format !== "json" && format !== "text") {
    throw new Error("--format must be 'json' or 'text'");
  }

  const report = await aggregate({ inputDir: resolve(inputDir), kValues });
  if (format === "text") {
    process.stdout.write(renderTextReport(report, kValues) + "\n");
  } else {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  }
}
