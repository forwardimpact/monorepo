/**
 * `fit-benchmark run` handler (spec 870 plan-a Step 10).
 *
 * Parses CLI options, wires real dependencies (Anthropic SDK query),
 * iterates the runner's async result stream, and mirrors each record to
 * stdout as one JSON line for live visibility. The runner owns the JSONL
 * append (Step 8.4) — handlers do not double-write.
 */

import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { BenchmarkRunner } from "../benchmark/runner.js";

function parseRunsOption(raw) {
  if (raw == null) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("--runs must be a positive integer");
  }
  return n;
}

function parseMaxTurnsOption(raw) {
  if (raw == null) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("--max-turns must be a non-negative integer");
  }
  return n;
}

/**
 * @param {object} values
 * @param {string[]} _args
 */
export async function runBenchmarkRunCommand(values, _args) {
  const familyArg = values.family;
  const outputArg = values.output;
  if (!familyArg) throw new Error("--family is required");
  if (!outputArg) throw new Error("--output is required");

  const output = resolve(outputArg);
  mkdirSync(output, { recursive: true });

  const runs = parseRunsOption(values.runs);
  const maxTurns = parseMaxTurnsOption(values["max-turns"]);
  const model = values.model ?? "claude-opus-4-7[1m]";
  const profiles = {
    agent: values["agent-profile"] ?? undefined,
    judge: values["judge-profile"] ?? undefined,
  };

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const runner = new BenchmarkRunner({
    family: familyArg,
    runs,
    output,
    model,
    profiles,
    query,
    maxTurns,
  });

  let anyFail = false;
  for await (const record of runner.run()) {
    if (record.verdict !== "pass") anyFail = true;
    process.stdout.write(JSON.stringify(record) + "\n");
  }
  process.exit(anyFail ? 1 : 0);
}
