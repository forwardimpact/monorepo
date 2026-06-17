import { join, dirname } from "node:path";
import { isoTimestamp } from "@forwardimpact/libutil";
import { createTraceCollector, sumTraceCost } from "@forwardimpact/libeval";
import { createTraceQuery } from "../trace-query.js";
import { createTraceGitHub } from "../trace-github.js";
import { stripSignatures } from "../signature-filter.js";

// Every handler receives a libcli `InvocationContext`:
//   ctx.options — parsed flag values (`cli.parse().values`)
//   ctx.args    — named positionals declared on the subcommand
//   ctx.deps    — host-injected collaborators: `{ runtime, config }`
// Handlers read/write the filesystem and stdout exclusively through
// `ctx.deps.runtime` and return `{ ok: true }` on success.

// --- GitHub commands ---

/**
 * List recent workflow runs matching a pattern.
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 */
export async function runRunsCommand(ctx) {
  const { runtime, config } = ctx.deps;
  const gh = await createTraceGitHub({
    token: config.ghToken(),
    repo: ctx.options.repo,
    runtime,
  });
  const lookback = ctx.options.lookback ?? "7d";
  const runs = await gh.listRuns({
    pattern: ctx.args.pattern,
    lookback,
    participant: ctx.options.participant,
  });
  writeJSON(runtime, runs, ctx.options);
  return { ok: true };
}

/**
 * Resolve a participant's lane trace for a known run id in one keyed lookup.
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 */
export async function runFindCommand(ctx) {
  const { runtime, config } = ctx.deps;
  const gh = await createTraceGitHub({
    token: config.ghToken(),
    repo: ctx.options.repo,
    runtime,
  });
  const result = await gh.findByKey(ctx.args["run-id"], ctx.args.participant, {
    dir: ctx.options.dir,
  });
  writeJSON(runtime, result, ctx.options);
  return { ok: true };
}

/**
 * Download a trace artifact and auto-convert to structured JSON.
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 */
export async function runDownloadCommand(ctx) {
  const { runtime, config } = ctx.deps;
  const gh = await createTraceGitHub({
    token: config.ghToken(),
    repo: ctx.options.repo,
    runtime,
  });
  const result = await gh.downloadTrace(ctx.args["run-id"], {
    dir: ctx.options.dir,
    name: ctx.options.artifact,
  });

  const ndjsonFile = result.files.find((f) => f.endsWith(".ndjson"));
  if (ndjsonFile) {
    const ndjsonPath = join(result.dir, ndjsonFile);
    const collector = createTraceCollector({
      now: () => isoTimestamp(runtime.clock.now()),
    });
    for (const line of runtime.fsSync
      .readFileSync(ndjsonPath, "utf8")
      .split("\n")) {
      collector.addLine(line);
    }
    const structuredPath = join(result.dir, "structured.json");
    runtime.fsSync.writeFileSync(
      structuredPath,
      JSON.stringify(collector.toJSON()) + "\n",
    );
    result.files.push("structured.json");
  }

  writeJSON(runtime, result, ctx.options);
  return { ok: true };
}

// --- Query commands ---

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runOverviewCommand(ctx) {
  const { runtime } = ctx.deps;
  writeJSON(runtime, loadTrace(runtime, ctx.args.file).overview(), ctx.options);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runCountCommand(ctx) {
  const { runtime } = ctx.deps;
  runtime.proc.stdout.write(
    String(loadTrace(runtime, ctx.args.file).count()) + "\n",
  );
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runBatchCommand(ctx) {
  const { runtime } = ctx.deps;
  writeJSON(
    runtime,
    loadTrace(runtime, ctx.args.file).batch(
      parseInt(ctx.args.from, 10),
      parseInt(ctx.args.to, 10),
    ),
    ctx.options,
  );
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runHeadCommand(ctx) {
  const { runtime } = ctx.deps;
  const n = ctx.args.n ? parseInt(ctx.args.n, 10) : 10;
  writeJSON(runtime, loadTrace(runtime, ctx.args.file).head(n), ctx.options);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runTailCommand(ctx) {
  const { runtime } = ctx.deps;
  const n = ctx.args.n ? parseInt(ctx.args.n, 10) : 10;
  writeJSON(runtime, loadTrace(runtime, ctx.args.file).tail(n), ctx.options);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runSearchCommand(ctx) {
  const { runtime } = ctx.deps;
  const limit = ctx.options.limit ? parseInt(ctx.options.limit, 10) : 50;
  const context = ctx.options.context ? parseInt(ctx.options.context, 10) : 0;
  const full = ctx.options.full ?? false;
  writeJSON(
    runtime,
    loadTrace(runtime, ctx.args.file).search(ctx.args.pattern, {
      limit,
      context,
      full,
    }),
    ctx.options,
  );
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runToolsCommand(ctx) {
  const { runtime } = ctx.deps;
  writeJSON(
    runtime,
    loadTrace(runtime, ctx.args.file).toolFrequency(),
    ctx.options,
  );
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runToolCommand(ctx) {
  const { runtime } = ctx.deps;
  writeJSON(
    runtime,
    loadTrace(runtime, ctx.args.file).tool(ctx.args.name),
    ctx.options,
  );
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runErrorsCommand(ctx) {
  const { runtime } = ctx.deps;
  writeJSON(runtime, loadTrace(runtime, ctx.args.file).errors(), ctx.options);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runReasoningCommand(ctx) {
  const { runtime } = ctx.deps;
  const from = ctx.options.from ? parseInt(ctx.options.from, 10) : undefined;
  const to = ctx.options.to ? parseInt(ctx.options.to, 10) : undefined;
  writeJSON(
    runtime,
    loadTrace(runtime, ctx.args.file).reasoning({ from, to }),
    ctx.options,
  );
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runTimelineCommand(ctx) {
  const { runtime } = ctx.deps;
  const lines = loadTrace(runtime, ctx.args.file).timeline();
  runtime.proc.stdout.write(lines.join("\n") + "\n");
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runStatsCommand(ctx) {
  const { runtime } = ctx.deps;
  writeJSON(runtime, loadTrace(runtime, ctx.args.file).stats(), ctx.options);
  return { ok: true };
}

/**
 * Total run cost across every participant (agent, supervisor, judge, and any
 * named profile), summed from each `result` event in the trace and attributed
 * per source. The combined trace from a supervised, facilitated, or discuss
 * session already interleaves all participants, so one file yields the whole
 * run's spend. Default output is `{totalCostUsd, bySource}` JSON; `--markdown`
 * emits a GitHub-flavored block to redirect into `$GITHUB_STEP_SUMMARY`.
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 */
export async function runCostCommand(ctx) {
  const { runtime } = ctx.deps;
  const cost = computeTraceCost(
    runtime.fsSync.readFileSync(ctx.args.file, "utf8"),
  );
  if (ctx.options.markdown) {
    runtime.proc.stdout.write(renderCostMarkdown(cost));
  } else {
    writeJSON(runtime, cost, ctx.options);
  }
  return { ok: true };
}

/**
 * Render a cost summary as a GitHub-flavored markdown block for a CI step
 * summary: a headline total plus a per-participant table (descending).
 * @param {{totalCostUsd: number, bySource: Record<string, number>}} cost
 * @returns {string}
 */
function renderCostMarkdown(cost) {
  const lines = [
    `### 💰 Run cost: $${cost.totalCostUsd.toFixed(4)}`,
    "",
    "Summed across every participant (agent, supervisor, judge, named profiles).",
  ];
  const sources = Object.entries(cost.bySource).sort((a, b) => b[1] - a[1]);
  if (sources.length > 0) {
    lines.push("", "| Participant | Cost (USD) |", "| --- | --- |");
    for (const [source, usd] of sources) {
      lines.push(`| ${source} | ${usd.toFixed(4)} |`);
    }
  }
  return lines.join("\n") + "\n";
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runInitCommand(ctx) {
  const { runtime } = ctx.deps;
  writeJSON(runtime, loadTrace(runtime, ctx.args.file).init(), ctx.options);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runTurnCommand(ctx) {
  const { runtime } = ctx.deps;
  writeJSON(
    runtime,
    loadTrace(runtime, ctx.args.file).turn(parseInt(ctx.args.index, 10)),
    ctx.options,
  );
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runFilterCommand(ctx) {
  const { runtime } = ctx.deps;
  const opts = {};
  if (ctx.options.role) opts.role = ctx.options.role;
  if (ctx.options.tool) opts.toolName = ctx.options.tool;
  if (ctx.options.error) opts.isError = true;
  writeJSON(
    runtime,
    loadTrace(runtime, ctx.args.file).filter(opts),
    ctx.options,
  );
  return { ok: true };
}

// --- Split command ---

/** Valid source name pattern: lowercase letter, then lowercase alphanumeric or hyphen. */
const VALID_SOURCE_NAME = /^[a-z][a-z0-9-]*$/;

/** Sources whose name is itself a structural role; classified into the role they represent. */
const STRUCTURAL_ROLES = new Set(["agent", "supervisor", "facilitator"]);

/**
 * Split a combined NDJSON trace into per-source files using the
 * `trace--<case>--<participant>.<role>.ndjson` convention.
 *
 * Each valid envelope source becomes one output file. Structural sources
 * (`agent`, `supervisor`, `facilitator`) classify into the matching role and
 * use their own name as participant; profile-named sources (e.g.
 * `staff-engineer`) classify as agents with the profile in the participant
 * slot. Orchestrator events and invalid source names are dropped.
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 */
export async function runSplitCommand(ctx) {
  const { runtime } = ctx.deps;
  const file = ctx.args.file;
  if (!file) return { ok: false, code: 1, error: "split: missing input file" };

  const mode = ctx.options.mode;
  if (!mode) return { ok: false, code: 1, error: "split: --mode is required" };
  if (!["run", "supervise", "facilitate"].includes(mode)) {
    return { ok: false, code: 1, error: `split: invalid --mode "${mode}"` };
  }

  const caseId = ctx.options.case ?? "default";
  const outputDir = ctx.options["output-dir"] || dirname(file);
  runtime.fsSync.mkdirSync(outputDir, { recursive: true });

  const buckets = parseBuckets(runtime.fsSync.readFileSync(file, "utf8"));

  for (const [source, lines] of buckets.entries()) {
    if (!VALID_SOURCE_NAME.test(source)) continue;
    const role = STRUCTURAL_ROLES.has(source) ? source : "agent";
    const outPath = join(
      outputDir,
      `trace--${caseId}--${source}.${role}.ndjson`,
    );
    runtime.fsSync.writeFileSync(outPath, lines.join("\n") + "\n");
  }
  return { ok: true };
}

/**
 * Parse NDJSON content into per-source buckets of unwrapped event lines.
 * Skips empty lines, malformed JSON, non-envelope lines, and orchestrator events.
 * @param {string} content - Raw NDJSON file content
 * @returns {Map<string, string[]>} source name -> array of unwrapped JSON lines
 */
function parseBuckets(content) {
  const buckets = new Map();

  for (const raw of content.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let envelope;
    try {
      envelope = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!envelope.event || typeof envelope.source !== "string") continue;
    if (envelope.source === "orchestrator") continue;

    if (!buckets.has(envelope.source)) {
      buckets.set(envelope.source, []);
    }
    buckets.get(envelope.source).push(JSON.stringify(envelope.event));
  }

  return buckets;
}

// --- Shared helpers ---

/**
 * Compute total + per-source cost from raw file content. A structured JSON
 * trace (from `fit-trace download`) carries its total in `summary.totalCostUsd`
 * but no per-source split; raw NDJSON is summed via `sumTraceCost`.
 * @param {string} content - Raw file content (structured JSON or NDJSON).
 * @returns {{totalCostUsd: number, bySource: Record<string, number>}}
 */
function computeTraceCost(content) {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.summary?.totalCostUsd === "number") {
      return { totalCostUsd: parsed.summary.totalCostUsd, bySource: {} };
    }
  } catch {
    // Not a single JSON object — treat as NDJSON below.
  }
  return sumTraceCost(content.split("\n"));
}

/**
 * Load a trace file. Supports structured JSON and raw NDJSON.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {string} file
 * @returns {import("../trace-query.js").TraceQuery}
 */
function loadTrace(runtime, file) {
  const content = runtime.fsSync.readFileSync(file, "utf8");

  try {
    const parsed = JSON.parse(content);
    if (parsed.turns) {
      return createTraceQuery(parsed);
    }
  } catch {
    // Not valid JSON — fall through to NDJSON.
  }

  const collector = createTraceCollector({
    now: () => isoTimestamp(runtime.clock.now()),
  });
  for (const line of content.split("\n")) {
    collector.addLine(line);
  }
  return createTraceQuery(collector.toJSON());
}

/**
 * Write JSON output to stdout. By default strips `thinking.signature`
 * base64 blobs from the payload so they don't dominate terminal output;
 * pass `--signatures` (surfaced as `values.signatures`) to keep them.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {*} data
 * @param {object} [values]
 */
function writeJSON(runtime, data, values = {}) {
  const output = values.signatures ? data : stripSignatures(data);
  runtime.proc.stdout.write(JSON.stringify(output, null, 2) + "\n");
}
