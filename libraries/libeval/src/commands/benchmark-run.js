/**
 * `fit-benchmark run` — run every task in a family for N runs, stream each
 * ResultRecord to stdout (one JSON line per record), and append to the
 * canonical `<output>/results.jsonl` for the report subcommand.
 */

import { resolve } from "node:path";

import { createConfig } from "@forwardimpact/libconfig";
import { createBenchmarkRunner } from "../benchmark/runner.js";
import {
  BENCHMARK_AGENT_MODEL,
  LEAD_MODEL,
} from "@forwardimpact/libutil/models";

/**
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: true} | {ok: false, code: number, error: string}>}
 */
export async function runBenchmarkRunCommand(ctx) {
  const values = ctx.options;
  const runtime = ctx.deps.runtime;
  let opts;
  try {
    opts = parseRunOptions(values);
  } catch (err) {
    return { ok: false, code: 1, error: err.message };
  }
  const config = await createConfig("script", "benchmark");
  runtime.proc.env.ANTHROPIC_API_KEY = await config.anthropicToken();

  // The Claude Agent SDK spawns a `claude` subprocess that inherits
  // process.env. NODE_EXTRA_CA_CERTS causes undici (the HTTP client
  // inside that subprocess) to fail with UND_ERR_INVALID_ARG on
  // Node 22+, aborting every API call after 10 retries. Strip it
  // before the SDK loads so the subprocess gets a clean environment.
  delete runtime.proc.env.NODE_EXTRA_CA_CERTS;

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const runner = createBenchmarkRunner({ ...opts, query, runtime });

  let anyFail = false;
  for await (const record of runner.run()) {
    runtime.proc.stdout.write(JSON.stringify(record) + "\n");
    if (record.verdict !== "pass") anyFail = true;
  }
  return anyFail ? { ok: false, code: 1, error: "" } : { ok: true };
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
    agentModel: values["agent-model"] || BENCHMARK_AGENT_MODEL,
    supervisorModel: values["lead-model"] || LEAD_MODEL,
    judgeModel: values["judge-model"] || LEAD_MODEL,
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
