import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createTraceCollector } from "@forwardimpact/libeval";
import { createTraceQuery } from "../trace-query.js";
import { createTraceGitHub } from "../trace-github.js";
import { stripSignatures } from "../signature-filter.js";

// --- GitHub commands ---

/**
 * List recent workflow runs matching a pattern.
 * @param {object} values - Parsed option values
 * @param {string[]} args - [pattern?]
 * @param {{config: import("@forwardimpact/libconfig").Config}} ctx
 */
export async function runRunsCommand(values, args, ctx) {
  const gh = await createTraceGitHub({
    token: ctx.config.ghToken(),
    repo: values.repo,
  });
  const pattern = args[0] ?? "agent";
  const lookback = values.lookback ?? "7d";
  const runs = await gh.listRuns({ pattern, lookback });
  writeJSON(runs, values);
}

/**
 * Download a trace artifact and auto-convert to structured JSON.
 * @param {object} values - Parsed option values
 * @param {string[]} args - [run-id]
 * @param {{config: import("@forwardimpact/libconfig").Config}} ctx
 */
export async function runDownloadCommand(values, args, ctx) {
  const gh = await createTraceGitHub({
    token: ctx.config.ghToken(),
    repo: values.repo,
  });
  const result = await gh.downloadTrace(args[0], {
    dir: values.dir,
    name: values.artifact,
  });

  const ndjsonFile = result.files.find((f) => f.endsWith(".ndjson"));
  if (ndjsonFile) {
    const ndjsonPath = join(result.dir, ndjsonFile);
    const collector = createTraceCollector();
    for (const line of readFileSync(ndjsonPath, "utf8").split("\n")) {
      collector.addLine(line);
    }
    const structuredPath = join(result.dir, "structured.json");
    writeFileSync(structuredPath, JSON.stringify(collector.toJSON()) + "\n");
    result.files.push("structured.json");
  }

  writeJSON(result, values);
}

// --- Query commands ---

/** @param {object} values @param {string[]} args - [file] */
export async function runOverviewCommand(values, args) {
  writeJSON(loadTrace(args[0]).overview(), values);
}

/** @param {object} values @param {string[]} args - [file] */
export async function runCountCommand(values, args) {
  process.stdout.write(String(loadTrace(args[0]).count()) + "\n");
}

/** @param {object} values @param {string[]} args - [file, from, to] */
export async function runBatchCommand(values, args) {
  writeJSON(
    loadTrace(args[0]).batch(parseInt(args[1], 10), parseInt(args[2], 10)),
    values,
  );
}

/** @param {object} values @param {string[]} args - [file, N?] */
export async function runHeadCommand(values, args) {
  const n = args[1] ? parseInt(args[1], 10) : 10;
  writeJSON(loadTrace(args[0]).head(n), values);
}

/** @param {object} values @param {string[]} args - [file, N?] */
export async function runTailCommand(values, args) {
  const n = args[1] ? parseInt(args[1], 10) : 10;
  writeJSON(loadTrace(args[0]).tail(n), values);
}

/** @param {object} values @param {string[]} args - [file, pattern] */
export async function runSearchCommand(values, args) {
  const limit = values.limit ? parseInt(values.limit, 10) : 50;
  const context = values.context ? parseInt(values.context, 10) : 0;
  const full = values.full ?? false;
  writeJSON(
    loadTrace(args[0]).search(args[1], { limit, context, full }),
    values,
  );
}

/** @param {object} values @param {string[]} args - [file] */
export async function runToolsCommand(values, args) {
  writeJSON(loadTrace(args[0]).toolFrequency(), values);
}

/** @param {object} values @param {string[]} args - [file, name] */
export async function runToolCommand(values, args) {
  writeJSON(loadTrace(args[0]).tool(args[1]), values);
}

/** @param {object} values @param {string[]} args - [file] */
export async function runErrorsCommand(values, args) {
  writeJSON(loadTrace(args[0]).errors(), values);
}

/** @param {object} values @param {string[]} args - [file] */
export async function runReasoningCommand(values, args) {
  const from = values.from ? parseInt(values.from, 10) : undefined;
  const to = values.to ? parseInt(values.to, 10) : undefined;
  writeJSON(loadTrace(args[0]).reasoning({ from, to }), values);
}

/** @param {object} values @param {string[]} args - [file] */
export async function runTimelineCommand(values, args) {
  const lines = loadTrace(args[0]).timeline();
  process.stdout.write(lines.join("\n") + "\n");
}

/** @param {object} values @param {string[]} args - [file] */
export async function runStatsCommand(values, args) {
  writeJSON(loadTrace(args[0]).stats(), values);
}

/** @param {object} values @param {string[]} args - [file] */
export async function runInitCommand(values, args) {
  writeJSON(loadTrace(args[0]).init(), values);
}

/** @param {object} values @param {string[]} args - [file, index] */
export async function runTurnCommand(values, args) {
  writeJSON(loadTrace(args[0]).turn(parseInt(args[1], 10)), values);
}

/** @param {object} values @param {string[]} args - [file] */
export async function runFilterCommand(values, args) {
  const opts = {};
  if (values.role) opts.role = values.role;
  if (values.tool) opts.toolName = values.tool;
  if (values.error) opts.isError = true;
  writeJSON(loadTrace(args[0]).filter(opts), values);
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
 * @param {object} values - Parsed option values
 * @param {string[]} args - [file]
 */
export async function runSplitCommand(values, args) {
  const file = args[0];
  if (!file) throw new Error("split: missing input file");

  const mode = values.mode;
  if (!mode) throw new Error("split: --mode is required");
  if (!["run", "supervise", "facilitate"].includes(mode)) {
    throw new Error(`split: invalid --mode "${mode}"`);
  }

  const caseId = values.case ?? "default";
  const outputDir = values["output-dir"] || dirname(file);
  mkdirSync(outputDir, { recursive: true });

  const buckets = parseBuckets(readFileSync(file, "utf8"));

  for (const [source, lines] of buckets.entries()) {
    if (!VALID_SOURCE_NAME.test(source)) continue;
    const role = STRUCTURAL_ROLES.has(source) ? source : "agent";
    const outPath = join(
      outputDir,
      `trace--${caseId}--${source}.${role}.ndjson`,
    );
    writeFileSync(outPath, lines.join("\n") + "\n");
  }
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
 * Load a trace file. Supports structured JSON and raw NDJSON.
 * @param {string} file
 * @returns {import("../trace-query.js").TraceQuery}
 */
function loadTrace(file) {
  const content = readFileSync(file, "utf8");

  try {
    const parsed = JSON.parse(content);
    if (parsed.turns) {
      return createTraceQuery(parsed);
    }
  } catch {
    // Not valid JSON — fall through to NDJSON.
  }

  const collector = createTraceCollector();
  for (const line of content.split("\n")) {
    collector.addLine(line);
  }
  return createTraceQuery(collector.toJSON());
}

/**
 * Write JSON output to stdout. By default strips `thinking.signature`
 * base64 blobs from the payload so they don't dominate terminal output;
 * pass `--signatures` (surfaced as `values.signatures`) to keep them.
 * @param {*} data
 * @param {object} [values]
 */
function writeJSON(data, values = {}) {
  const output = values.signatures ? data : stripSignatures(data);
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}
