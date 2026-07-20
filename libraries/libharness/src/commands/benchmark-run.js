/**
 * `gemba-benchmark run` — run every task in a family for N runs, stream each
 * ResultRecord to stdout (one JSON line per record), and append to the
 * canonical `<output>/results.jsonl` for the report subcommand.
 */

import { resolve } from "node:path";
import { availableParallelism } from "node:os";

import { createConfig } from "@forwardimpact/libconfig";
import { createBenchmarkRunner } from "../benchmark/runner.js";
import { resolveWorkTracker } from "./work-tracker.js";
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
    opts = parseRunOptions(values, runtime.proc.env);
  } catch (err) {
    return { ok: false, code: 1, error: err.message };
  }
  const config = await createConfig("script", "benchmark");
  runtime.proc.env.ANTHROPIC_API_KEY = await config.anthropicToken();
  // The benchmark agent runs via createBenchmarkRunner, not the supervise
  // command, so the active-tracker env must land here before the runner
  // spawns the subprocess that inherits process.env.
  runtime.proc.env.LIBHARNESS_WORK_TRACKER = opts.workTracker;

  // The Claude Agent SDK spawns a `claude` subprocess that inherits
  // process.env. NODE_EXTRA_CA_CERTS causes undici (the HTTP client
  // inside that subprocess) to fail with UND_ERR_INVALID_ARG on
  // Node 22+, aborting every API call after 10 retries. Strip it
  // before the SDK loads so the subprocess gets a clean environment.
  delete runtime.proc.env.NODE_EXTRA_CA_CERTS;

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const runner = createBenchmarkRunner({ ...opts, query, runtime });

  let anyFail = false;
  let count = 0;
  for await (const record of runner.run()) {
    count++;
    runtime.proc.stdout.write(JSON.stringify(record) + "\n");
    if (record.verdict !== "pass") anyFail = true;
  }
  if (count === 0) return resolveZeroRecordOutcome(opts, runtime);
  return anyFail ? { ok: false, code: 1, error: "" } : { ok: true };
}

/**
 * Decide the exit outcome when a run streamed zero records. A run that emits no
 * records normally did nothing (no tasks discovered, or the agent never
 * produced output) — a failure, surfaced loudly so CI does not go green on an
 * empty benchmark. The one exception is a deliberately-empty shard: a
 * high-index `--shard=i/N` with `N > cell count` legitimately selects zero
 * cells, so it exits 0 with a stderr note. Exported so the relaxed-guard branch
 * is testable without the full handler's config/SDK setup.
 * @param {{shard: {index: number, total: number} | null}} opts
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {{ok: true} | {ok: false, code: number, error: string}}
 */
export function resolveZeroRecordOutcome(opts, runtime) {
  if (opts.shard) {
    runtime.proc.stderr.write(
      `shard ${opts.shard.index}/${opts.shard.total} selected no cells\n`,
    );
    return { ok: true };
  }
  return {
    ok: false,
    code: 1,
    error:
      "benchmark produced no result records — no task ran to completion; check the family's tasks/, apm install, and agent availability (ANTHROPIC_API_KEY / claude CLI / IS_SANDBOX)",
  };
}

/**
 * Parse and validate benchmark run options. Exported so tests can verify
 * defaults, including the resolved work tracker.
 * @param {Record<string, string|undefined>} values - Parsed option values
 * @param {Record<string, string|undefined>} [env] - Process environment, read
 *   for the `LIBHARNESS_WORK_TRACKER` fallback when `--work-tracker` is absent.
 * @returns {object}
 */
export function parseRunOptions(values, env = {}) {
  const family = values.family;
  if (!family) throw new Error("--family is required");
  const output = values.output ?? "benchmark-runs";
  const runs = Number.parseInt(values.runs ?? "5", 10);
  if (!Number.isFinite(runs) || runs < 1)
    throw new Error("--runs must be a positive integer");
  return {
    family,
    runs,
    task: values.task ?? null,
    skillsFrom: values["skills-from"] ?? null,
    output: resolve(output),
    agentModel: values["agent-model"] || BENCHMARK_AGENT_MODEL,
    supervisorModel: values["lead-model"] || LEAD_MODEL,
    judgeModel: values["judge-model"] || LEAD_MODEL,
    workTracker: resolveWorkTracker(values, env),
    profiles: {
      agent: values["agent-profile"] ?? null,
      judge: values["judge-profile"] ?? null,
    },
    maxTurns: parseMaxTurns(values["max-turns"]),
    concurrency: resolveConcurrency(values, env),
    shard: parseShard(values.shard),
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

/**
 * Parse a `--shard=<i>/<N>` selector into `{index, total}` (1-based), or `null`
 * for an unsharded run. Validates `1 ≤ index ≤ total` with integer parts.
 * @param {string|undefined} raw
 * @returns {{index: number, total: number} | null}
 */
export function parseShard(raw) {
  if (raw == null || raw === "") return null;
  const m = /^(\d+)\/(\d+)$/.exec(raw.trim());
  if (!m) throw new Error("--shard must be in the form i/N (e.g. 1/4)");
  const index = Number.parseInt(m[1], 10);
  const total = Number.parseInt(m[2], 10);
  if (total < 1 || index < 1 || index > total)
    throw new Error("--shard requires 1 ≤ i ≤ N");
  return { index, total };
}

// Conservative because each cell spawns ~3 agent subprocesses (lead +
// agent-under-test + judge); a low ceiling keeps a single runner from
// thrashing. The bulk of the CI speedup comes from Layer-2 sharding across
// machines, not from raising this in-job default.
const CONCURRENCY_CEILING = 4;

/**
 * Resolve the cell concurrency: `--concurrency` flag > the
 * `LIBHARNESS_BENCHMARK_CONCURRENCY` env var > a CPU-aware default of
 * `min(CONCURRENCY_CEILING, max(2, ⌊cores/2⌋))`. The default is `> 1` so
 * concurrency is on transparently without any consumer opting in.
 * @param {Record<string, string|undefined>} values
 * @param {Record<string, string|undefined>} [env]
 * @returns {number}
 */
export function resolveConcurrency(values, env = {}) {
  const raw = values.concurrency ?? env.LIBHARNESS_BENCHMARK_CONCURRENCY;
  if (raw != null && raw !== "") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1)
      throw new Error("--concurrency must be a positive integer");
    return n;
  }
  const cores = availableParallelism();
  return Math.min(CONCURRENCY_CEILING, Math.max(2, Math.floor(cores / 2)));
}
