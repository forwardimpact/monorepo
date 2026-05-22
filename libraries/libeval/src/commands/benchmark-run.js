/**
 * `fit-benchmark run` — run every task in a family for N runs, stream each
 * ResultRecord to stdout (one JSON line per record), and append to the
 * canonical `<output>/results.jsonl` for the report subcommand.
 */

import { resolve } from "node:path";

import { createConfig } from "@forwardimpact/libconfig";
import { createBenchmarkRunner } from "../benchmark/runner.js";

/**
 * @param {object} values
 * @param {string[]} _args
 */
export async function runBenchmarkRunCommand(values, _args) {
  const opts = parseRunOptions(values);
  const config = await createConfig("script", "benchmark");
  process.env.ANTHROPIC_API_KEY = await config.anthropicToken();
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
  const output = values.output ?? "benchmark-runs";
  const runs = Number.parseInt(values.runs ?? "5", 10);
  if (!Number.isFinite(runs) || runs < 1)
    throw new Error("--runs must be a positive integer");
  return {
    family,
    runs,
    output: resolve(output),
    agentModel: values["agent-model"] ?? "claude-sonnet-4-6",
    supervisorModel: values["lead-model"] ?? "claude-opus-4-7",
    judgeModel: values["judge-model"] ?? "claude-opus-4-7",
    profiles: {
      agent: values["agent-profile"] ?? null,
      judge: values["judge-profile"] ?? null,
    },
    maxTurns: parseMaxTurns(values["max-turns"]),
    allowedTools: values["allowed-tools"]
      ? values["allowed-tools"]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  };
}

function parseMaxTurns(raw) {
  if (raw === undefined) return undefined;
  if (raw === "0") return 0;
  return Number.parseInt(raw, 10);
}
