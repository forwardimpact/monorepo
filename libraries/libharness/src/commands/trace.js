import { join, dirname, basename } from "node:path";
import { isoTimestamp } from "@forwardimpact/libutil";
import { createTraceCollector, sumTraceCost } from "@forwardimpact/libharness";
import { createTraceQuery } from "../trace-query.js";
import { createTraceGitHub } from "../trace-github.js";
import { splitTrace } from "../trace-split.js";
import { stripSignatures } from "../signature-filter.js";
import { runOver, aggregate, compareTwo } from "../trace-multi.js";
import {
  renderToolCalls,
  renderCommands,
  renderPaths,
  renderCompare,
  renderStatsByTool,
  renderStatsSummary,
  renderSearch,
  renderDefault,
} from "../trace-render.js";

// Every handler receives a libcli `InvocationContext`:
//   ctx.options — parsed flag values (`cli.parse().values`)
//   ctx.args    — named positionals declared on the subcommand
//   ctx.deps    — host-injected collaborators: `{ runtime, config }`
// Handlers read/write the filesystem and stdout exclusively through
// `ctx.deps.runtime` and return `{ ok: true }` on success.

/** Characters whose presence in a `--file` value marks it as a glob. */
const GLOB_CHARS = /[*?[\]{}]/;

/**
 * Resolve the cross-trace `--file` option (`ctx.options.file`) into a sorted
 * flat list of file paths. A literal path passes through; a value carrying
 * glob metacharacters expands via `runtime.fsSync.globSync`. The literal-path
 * fast path means the common single-file and shell-pre-expanded cases never
 * touch `globSync`.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {string[]}
 */
function resolveFiles(runtime, ctx) {
  const raw = ctx.options.file;
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const value of values) {
    if (GLOB_CHARS.test(value)) {
      out.push(...runtime.fsSync.globSync(value));
    } else {
      out.push(value);
    }
  }
  return out.sort();
}

/**
 * Emit a query result for a cross-trace verb: under `--format json` write the
 * JSON payload (single-object verbs unwrap when single-file so the envelope
 * deep-equals today's output); otherwise render text to stdout. Source
 * attribution is the renderer's job, gated by `multi`.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {object|object[]} result
 * @param {Function} renderer
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @param {boolean} multi
 * @param {boolean} [unwrap=false] - Single-object verb wrapped in a one-element array.
 */
function emit(runtime, result, renderer, ctx, multi, unwrap = false) {
  if (ctx.options.format === "json") {
    const payload = unwrap && !multi ? result[0] : result;
    writeJSON(runtime, payload, ctx.options);
    return;
  }
  const text = renderer(result, {
    multi,
    signatures: !!ctx.options.signatures,
  });
  runtime.proc.stdout.write(text + "\n");
}

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
 * Resolve a trace lane for a known run id in one keyed lookup. The key may
 * be an exact member filename, a case id, or a participant name; ambiguous
 * keys error with the matching candidates.
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 */
export async function runFindCommand(ctx) {
  const { runtime, config } = ctx.deps;
  const gh = await createTraceGitHub({
    token: config.ghToken(),
    repo: ctx.options.repo,
    runtime,
  });
  const result = await gh.findByKey(ctx.args["run-id"], ctx.args.key, {
    dir: ctx.options.dir,
  });
  writeJSON(runtime, result, ctx.options);
  return { ok: true };
}

/**
 * The single `.ndjson` member to auto-convert to structured JSON, or null
 * when the artifact carries zero or several. Multi-member bundles (kata
 * dispatch, harness matrix, eval shards) get no `structured.json` — the
 * prior first-member conversion picked an arbitrary lane, which was actively
 * misleading; the analysis verbs read the `.ndjson` members directly.
 * @param {string[]} files - Extracted member paths, relative to the artifact dir.
 * @returns {string|null}
 */
export function structuredConvertTarget(files) {
  const ndjson = files.filter((f) => f.endsWith(".ndjson"));
  return ndjson.length === 1 ? ndjson[0] : null;
}

/**
 * Download a trace artifact; auto-convert to structured JSON only when the
 * artifact carries exactly one `.ndjson` member.
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

  const ndjsonFile = structuredConvertTarget(result.files);
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

/**
 * Build the injected loader the orchestrator uses (wires the runtime IO seam).
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {(file: string) => import("../trace-query.js").TraceQuery}
 */
function loader(runtime) {
  return (file) => loadTrace(runtime, file);
}

/** No-files error envelope for a cross-trace verb. */
function noFiles(verb) {
  return { ok: false, code: 1, error: `${verb}: no files (use --file)` };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runOverviewCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("overview");
  const result = runOver(files, (tq) => [tq.overview()], loader(runtime));
  emit(runtime, result, renderDefault, ctx, files.length > 1, true);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runCountCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("count");
  const multi = files.length > 1;
  const result = runOver(
    files,
    (tq) => [{ count: tq.count() }],
    loader(runtime),
  );
  for (const r of result) {
    const prefix = multi && r.source ? `${r.source}:` : "";
    runtime.proc.stdout.write(`${prefix}${r.count}\n`);
  }
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runBatchCommand(ctx) {
  const { runtime } = ctx.deps;
  const result = loadTrace(runtime, ctx.args.file).batch(
    parseInt(ctx.args.from, 10),
    parseInt(ctx.args.to, 10),
  );
  emit(runtime, result, renderDefault, ctx, false);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runHeadCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("head");
  const n = ctx.options.lines ? parseInt(ctx.options.lines, 10) : 10;
  const result = runOver(files, (tq) => tq.head(n), loader(runtime));
  emit(runtime, result, renderDefault, ctx, files.length > 1);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runTailCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("tail");
  const n = ctx.options.lines ? parseInt(ctx.options.lines, 10) : 10;
  const result = runOver(files, (tq) => tq.tail(n), loader(runtime));
  emit(runtime, result, renderDefault, ctx, files.length > 1);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runSearchCommand(ctx) {
  const { runtime } = ctx.deps;
  const limit = ctx.options.limit ? parseInt(ctx.options.limit, 10) : 50;
  const context = ctx.options.context ? parseInt(ctx.options.context, 10) : 0;
  const full = ctx.options.full ?? false;
  const result = loadTrace(runtime, ctx.args.file).search(ctx.args.pattern, {
    limit,
    context,
    full,
  });
  emit(runtime, result, renderSearch, ctx, false);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runToolsCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("tools");
  const result = aggregate(
    files,
    (tq) => tq.toolFrequency(),
    (r) => r.tool,
    loader(runtime),
  );
  emit(runtime, result, renderDefault, ctx, files.length > 1);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runToolCommand(ctx) {
  const { runtime } = ctx.deps;
  const result = loadTrace(runtime, ctx.args.file).tool(ctx.args.name);
  emit(runtime, result, renderDefault, ctx, false);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runErrorsCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("errors");
  const result = runOver(files, (tq) => tq.errors(), loader(runtime));
  emit(runtime, result, renderDefault, ctx, files.length > 1);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runReasoningCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("reasoning");
  const from = ctx.options.from ? parseInt(ctx.options.from, 10) : undefined;
  const to = ctx.options.to ? parseInt(ctx.options.to, 10) : undefined;
  const result = runOver(
    files,
    (tq) => tq.reasoning({ from, to }),
    loader(runtime),
  );
  emit(runtime, result, renderDefault, ctx, files.length > 1);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runTimelineCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("timeline");
  const multi = files.length > 1;
  for (const file of files) {
    if (multi) runtime.proc.stdout.write(`# ${basename(file)}\n`);
    runtime.proc.stdout.write(
      loadTrace(runtime, file).timeline().join("\n") + "\n",
    );
  }
  return { ok: true };
}

/** Select the per-file `stats` query for the active flag combination. */
function statsQuery(ctx) {
  if (ctx.options.summary) return (tq) => tq.statsSummary();
  if (ctx.options["by-tool"]) return (tq) => tq.statsByTool();
  return (tq) => tq.stats();
}

/** Select the `stats` text renderer for the active flag combination. */
function statsRenderer(ctx) {
  if (ctx.options.summary) return renderStatsSummary;
  if (ctx.options["by-tool"]) return renderStatsByTool;
  return (result) => renderDefault(result);
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runStatsCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("stats");
  const multi = files.length > 1;
  const query = statsQuery(ctx);
  // stats results are per-file objects; one block per file (no cross-file sum),
  // tagged with source only when multi-file.
  const results = files.map((file) => ({
    result: query(loadTrace(runtime, file)),
    source: multi ? basename(file) : undefined,
  }));

  if (ctx.options.format === "json") {
    const payloads = results.map((r) =>
      multi ? { ...r.result, source: r.source } : r.result,
    );
    writeJSON(runtime, multi ? payloads : payloads[0], ctx.options);
    return { ok: true };
  }

  const render = statsRenderer(ctx);
  const blocks = results.map((r) =>
    multi ? `# ${r.source}\n${render(r.result)}` : render(r.result),
  );
  runtime.proc.stdout.write(blocks.join("\n") + "\n");
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
  // Tolerate a missing/empty trace: a CI step reports cost under `always()`,
  // so the trace may not exist (the run failed before producing one). Print
  // nothing and exit 0 rather than throwing — the caller needs no `if [ -f ]`.
  const file = ctx.args.file;
  if (!file || !runtime.fsSync.existsSync(file)) return { ok: true };
  const cost = computeTraceCost(runtime.fsSync.readFileSync(file, "utf8"));
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
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("init");
  const result = runOver(files, (tq) => [tq.init()], loader(runtime));
  emit(runtime, result, renderDefault, ctx, files.length > 1, true);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runTurnCommand(ctx) {
  const { runtime } = ctx.deps;
  const result = loadTrace(runtime, ctx.args.file).turn(
    parseInt(ctx.args.index, 10),
  );
  emit(runtime, result, renderDefault, ctx, false);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runFilterCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("filter");
  const opts = {};
  if (ctx.options.role) opts.role = ctx.options.role;
  if (ctx.options.tool) opts.toolName = ctx.options.tool;
  if (ctx.options.error) opts.isError = true;
  const result = runOver(files, (tq) => tq.filter(opts), loader(runtime));
  emit(runtime, result, renderDefault, ctx, files.length > 1);
  return { ok: true };
}

// --- Aggregator verbs (tool-calls, commands, paths, compare) ---

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runToolCallsCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("tool-calls");
  const result = runOver(files, (tq) => tq.toolCalls(), loader(runtime));
  emit(runtime, result, renderToolCalls, ctx, files.length > 1);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runCommandsCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("commands");
  const result = runOver(
    files,
    (tq) => tq.commands(ctx.options.match),
    loader(runtime),
  );
  emit(runtime, result, renderCommands, ctx, files.length > 1);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runPathsCommand(ctx) {
  const { runtime } = ctx.deps;
  const files = resolveFiles(runtime, ctx);
  if (files.length === 0) return noFiles("paths");
  const result = aggregate(
    files,
    (tq) => tq.paths(ctx.options.prefix),
    (r) => r.path,
    loader(runtime),
  );
  emit(runtime, result, renderPaths, ctx, files.length > 1);
  return { ok: true };
}

/** @param {import("@forwardimpact/libcli").InvocationContext} ctx */
export async function runCompareCommand(ctx) {
  const { runtime } = ctx.deps;
  const result = compareTwo(
    ctx.args["file-a"],
    ctx.args["file-b"],
    loader(runtime),
  );
  emit(runtime, result, renderCompare, ctx, false);
  return { ok: true };
}

// --- Split command ---

/**
 * Split a combined NDJSON trace into per-source files using the
 * `trace--<case>--<participant>.<role>.ndjson` convention.
 *
 * CLI concerns only — input and `--mode` validation, defaults, and output-dir
 * creation; the split itself is the shared `splitTrace` implementation.
 * Structural sources (`agent`, `supervisor`, `facilitator`, `judge`) classify
 * into the matching role and use their own name as participant; profile-named
 * sources (e.g. `staff-engineer`) classify as agents with the profile in the
 * participant slot. Orchestrator events and invalid source names are dropped.
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 */
export async function runSplitCommand(ctx) {
  const { runtime } = ctx.deps;
  const file = ctx.args.file;
  if (!file) return { ok: false, code: 1, error: "split: missing input file" };

  // `discuss` has the same lead + N-participants shape as `facilitate`, and the
  // splitter buckets purely by envelope `source` (mode-independent), so it is
  // accepted alongside the structural modes — the CLI owns this, not callers.
  // `--mode` stays required-but-inert: the harness action passes it and that
  // surface is out of scope for the shared-split extraction.
  const mode = ctx.options.mode;
  if (!mode) return { ok: false, code: 1, error: "split: --mode is required" };
  if (!["run", "supervise", "facilitate", "discuss"].includes(mode)) {
    return { ok: false, code: 1, error: `split: invalid --mode "${mode}"` };
  }

  const caseId = ctx.options.case ?? "default";
  const outputDir = ctx.options["output-dir"] || dirname(file);
  runtime.fsSync.mkdirSync(outputDir, { recursive: true });

  await splitTrace(runtime, file, { caseId, outputDir });
  return { ok: true };
}

// --- Shared helpers ---

/**
 * Compute total + per-source cost from raw file content. A structured JSON
 * trace (from `gemba-trace download`) carries its total in `summary.totalCostUsd`
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
export function loadTrace(runtime, file) {
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
