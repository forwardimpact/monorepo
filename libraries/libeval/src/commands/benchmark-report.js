/**
 * `fit-benchmark report` handler (spec 870 plan-a Step 10).
 *
 * Reads a run-output directory's `results.jsonl`, computes pass@k for
 * the requested k-values, and writes JSON (default) or a Markdown table.
 */

import { resolve } from "node:path";
import { aggregate, renderReportMarkdown } from "../benchmark/report.js";

function parseKValues(raw) {
  const text = raw ?? "1,3,5";
  return text.split(",").map((t) => {
    const n = Number.parseInt(t.trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(
        "--k must be a comma-separated list of positive integers",
      );
    }
    return n;
  });
}

/**
 * @param {object} values
 * @param {string[]} _args
 */
export async function runBenchmarkReportCommand(values, _args) {
  const inputArg = values.input;
  if (!inputArg) throw new Error("--input is required");
  const inputDir = resolve(inputArg);
  const kValues = parseKValues(values.k);
  const format = values.format ?? "json";

  const report = await aggregate({ inputDir, kValues });
  if (format === "text") {
    process.stdout.write(renderReportMarkdown(report, kValues) + "\n");
  } else {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  }
  process.exit(0);
}
