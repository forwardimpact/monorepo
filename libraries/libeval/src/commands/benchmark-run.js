/**
 * `fit-benchmark run` — run every task in a family for N runs, stream each
 * ResultRecord to stdout (one JSON line per record), and append to the
 * canonical `<output>/results.jsonl` for the report subcommand.
 */

import { resolve } from "node:path";

import { createBenchmarkRunner } from "../benchmark/runner.js";

/**
 * @param {object} values
 * @param {string[]} _args
 */
export async function runBenchmarkRunCommand(values, _args) {
  const opts = parseRunOptions(values);
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const runner = createBenchmarkRunner({ ...opts, query });

  let anyFail = false;
  for await (const record of runner.run()) {
    process.stdout.write(JSON.stringify(record) + "\n");
    if (record.verdict !== "pass") anyFail = true;
  }
  process.exit(anyFail ? 1 : 0);
}

function parseRunOptions(values) {
  const family = values.family;
  if (!family) throw new Error("--family is required");
  const output = values.output;
  if (!output) throw new Error("--output is required");
  const runs = Number.parseInt(values.runs ?? "1", 10);
  if (!Number.isFinite(runs) || runs < 1)
    throw new Error("--runs must be a positive integer");
  return {
    family,
    runs,
    output: resolve(output),
    model: values.model ?? "claude-opus-4-7[1m]",
    profiles: {
      agent: values["agent-profile"] ?? null,
      judge: values["judge-profile"] ?? null,
    },
    maxTurns: parseMaxTurns(values["max-turns"]),
  };
}

function parseMaxTurns(raw) {
  if (raw === undefined) return undefined;
  if (raw === "0") return 0;
  return Number.parseInt(raw, 10);
}
