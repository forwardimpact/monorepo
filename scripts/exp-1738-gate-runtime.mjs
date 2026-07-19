#!/usr/bin/env node
// Publish-gate runtime falsifier (F-c critical-path-regression) — capture the
// publish gate's "Run tests" STEP wall-clock per publish run and evaluate the
// two pre-registered trip conditions. Experiment context and the issue
// cross-reference live in wiki/metrics/exp-1738-publish-gate/README.md.
//
// Method A (staff-engineer ruling, facilitator [ask#4]): read-only against the
// GitHub Actions API at cut time. The gate workflow (publish-npm.yml) is never
// modified — no SECONDS wrapper on the hot path.
//
// BOUNDARY: both conditions key on the "Run tests" STEP duration, not the whole
// publish job. Keeps the thresholds apples-to-apples with the 70.3s node step
// baseline and immune to registry-hiccup false trips.
//
// TWO CONDITIONS, DIFFERENT KEYING:
//   - Sustained (105s): event-keyed. Each release event (one bump commit, i.e.
//     one head_sha) contributes ONE datum = the MEDIAN Run-tests-step duration
//     across that event's correlated publish runs (the cluster is collapsed).
//     Trip when the median across 3 consecutive release events > 105s.
//   - Tail (120s): literal, per run. Trip if ANY single run's step > 120s.
//   So every run is captured (the tail guard needs all of them), but the
//   sustained median-of-3 is computed over the per-event collapse.
//
// DORMANT UNTIL t0: refuses to record unless the window-start marker
// wiki/metrics/exp-1738-publish-gate/T0 exists. Its first non-comment line is
// the t0 ISO timestamp from staff-engineer's window-start Announce (the merge
// commit of the node --test swap). Only publish runs created at/after t0 are
// captured — nothing before the swap lands can trip the falsifier.
//
// Usage:
//   node scripts/exp-1738-gate-runtime.mjs --commit <bump-sha> [--record]
//   node scripts/exp-1738-gate-runtime.mjs --runs 123,456 [--record]
//
// Default is dry-run: prints per-run step durations, the event median, the
// proposed `gemba-xmr record` rows, and the trip verdict. Pass --record to also
// append the rows via `gemba-xmr record`.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SERIES_SKILL = "exp-1738-publish-gate";
const DEFAULT_REPO = "forwardimpact/monorepo";
const SUSTAINED_THRESHOLD_S = 105; // 1.5× the 70.3s node baseline
const TAIL_THRESHOLD_S = 120;
const SUSTAINED_WINDOW = 3; // consecutive release events
const STEP_NAME = "Run tests";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const seriesDir = join(repoRoot, "wiki/metrics", SERIES_SKILL);
const t0Path = join(seriesDir, "T0");

function die(message) {
  console.error(`exp-1738: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { record: false, repo: DEFAULT_REPO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--record") opts.record = true;
    else if (a === "--commit") opts.commit = argv[++i];
    else if (a === "--runs") opts.runs = argv[++i].split(",").filter(Boolean);
    else if (a === "--repo") opts.repo = argv[++i];
    else if (a === "--help" || a === "-h") opts.help = true;
    else die(`unknown argument: ${a}`);
  }
  return opts;
}

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- dormancy gate ------------------------------------------------------------
function readT0() {
  if (!existsSync(t0Path)) return null;
  for (const line of readFileSync(t0Path, "utf8").split("\n")) {
    // Strip inline comments (the README's arming example uses a trailing
    // `# window start <sha>` annotation) and surrounding whitespace.
    const value = line.split("#")[0].trim();
    if (value) return value;
  }
  return null;
}

// --- run resolution -----------------------------------------------------------
function resolveRuns(opts) {
  if (opts.runs) {
    return opts.runs.map((id) => {
      const run = JSON.parse(
        gh(["api", `repos/${opts.repo}/actions/runs/${id}`]),
      );
      return {
        id: String(run.id),
        headSha: run.head_sha,
        createdAt: run.created_at,
      };
    });
  }
  if (!opts.commit) die("provide --commit <bump-sha> or --runs <id,...>");
  const runs = JSON.parse(
    gh([
      "run",
      "list",
      "--workflow=publish-npm.yml",
      "--limit",
      "100",
      "--json",
      "databaseId,headSha,createdAt",
    ]),
  );
  return runs
    .filter(
      (r) => r.headSha === opts.commit || r.headSha.startsWith(opts.commit),
    )
    .map((r) => ({
      id: String(r.databaseId),
      headSha: r.headSha,
      createdAt: r.createdAt,
    }));
}

// Extract the "Run tests" step wall-clock (seconds) for one publish run.
function stepDurationS(repo, runId) {
  const data = JSON.parse(
    gh(["api", `repos/${repo}/actions/runs/${runId}/jobs`]),
  );
  for (const job of data.jobs ?? []) {
    for (const step of job.steps ?? []) {
      if (step.name === STEP_NAME && step.started_at && step.completed_at) {
        const ms = Date.parse(step.completed_at) - Date.parse(step.started_at);
        return Math.round(ms / 1000);
      }
    }
  }
  return null; // step absent (run failed before tests, or runner renamed it)
}

// --- prior event medians (for the sustained median-of-3) ----------------------
function priorEventMedians() {
  if (!existsSync(seriesDir)) return [];
  const out = [];
  for (const file of readdirSync(seriesDir).filter((f) => f.endsWith(".csv"))) {
    for (const line of readFileSync(join(seriesDir, file), "utf8").split(
      "\n",
    )) {
      // Columns: date,metric,value,... — metric (col 2) and value (col 3)
      // both precede the quoted note, so positional split is safe.
      const f = line.split(",");
      if (f[1] === "gate_runtime_event_median_s" && f[2]) {
        out.push(Number(f[2]));
      }
    }
  }
  return out;
}

function record(opts, metric, value, run, note) {
  const args = [
    "gemba-xmr",
    "record",
    `--skill=${SERIES_SKILL}`,
    `--metric=${metric}`,
    `--value=${value}`,
    "--unit=s",
    `--run=${run}`,
    `--note=${note}`,
    "--event-type=kata-release-cut",
  ];
  if (opts.record) {
    execFileSync("bunx", args, { encoding: "utf8", stdio: "inherit" });
  } else {
    console.log(
      `  would record: bunx ${args.slice(0, 2).join(" ")} ${args
        .slice(2)
        .map((a) => (a.includes(" ") ? `'${a}'` : a))
        .join(" ")}`,
    );
  }
}

// --- main ---------------------------------------------------------------------
const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split("\n")
      .slice(1, 40)
      .join("\n")
      .replace(/^\/\/ ?/gm, ""),
  );
  process.exit(0);
}

const t0 = readT0();
if (!t0) {
  console.log(
    "exp-1738: DORMANT — no t0 marker at wiki/metrics/exp-1738-publish-gate/T0.",
  );
  console.log(
    "          The falsifier cannot trip until the node --test swap merges.",
  );
  console.log(
    "          Arm by writing the window-start ISO timestamp to that file when",
  );
  console.log(
    "          staff-engineer fires the window-start Announce (= t0).",
  );
  process.exit(0);
}

const t0Ms = Date.parse(t0);
if (Number.isNaN(t0Ms))
  die(`T0 marker is not a parseable ISO timestamp: ${t0}`);

const allRuns = resolveRuns(opts);
const eligible = allRuns.filter((r) => Date.parse(r.createdAt) >= t0Ms);
const skipped = allRuns.length - eligible.length;

console.log(`exp-1738: window t0 = ${t0}`);
if (skipped) {
  console.log(`exp-1738: skipping ${skipped} run(s) created before t0.`);
}
if (!eligible.length) {
  console.log("exp-1738: no eligible publish runs at/after t0 for this event.");
  process.exit(0);
}

const eventSha = eligible[0].headSha;
const shortSha = eventSha.slice(0, 8);
const durations = [];
console.log(`\nRelease event ${shortSha} — "${STEP_NAME}" step wall-clock:`);
for (const run of eligible) {
  const s = stepDurationS(opts.repo, run.id);
  if (s == null) {
    console.log(
      `  run-${run.id}: step absent (skipped — failed before tests?)`,
    );
    continue;
  }
  durations.push(s);
  const flag = s > TAIL_THRESHOLD_S ? "  ⚠ TAIL TRIP (>120s)" : "";
  console.log(`  run-${run.id}: ${s}s${flag}`);
}

if (!durations.length) {
  console.log(
    "exp-1738: no Run-tests step durations resolved — nothing to record.",
  );
  process.exit(0);
}

const eventMedian = median(durations);
console.log(`\nEvent median (collapsed cluster): ${eventMedian}s`);

// Record every run (tail guard) + the event median (sustained guard).
console.log(opts.record ? "\nRecording:" : "\nProposed records (dry-run):");
for (const run of eligible) {
  const s = stepDurationS(opts.repo, run.id);
  if (s != null) {
    record(
      opts,
      "gate_runtime_s",
      s,
      `run-${run.id}`,
      `publish ${shortSha} run ${run.id}`,
    );
  }
}
record(
  opts,
  "gate_runtime_event_median_s",
  eventMedian,
  `event-${shortSha}`,
  `median of ${durations.length} run(s) for release event ${shortSha}`,
);

// --- evaluate trips -----------------------------------------------------------
const tailTrip = durations.some((s) => s > TAIL_THRESHOLD_S);

// Sustained: median across the last 3 consecutive event medians. When --record
// the new median is already on disk; in dry-run, append it in memory.
const eventSeries = priorEventMedians();
if (!opts.record) eventSeries.push(eventMedian);
const lastThree = eventSeries.slice(-SUSTAINED_WINDOW);
const sustainedMedian =
  lastThree.length === SUSTAINED_WINDOW ? median(lastThree) : null;
const sustainedTrip =
  sustainedMedian != null && sustainedMedian > SUSTAINED_THRESHOLD_S;

console.log("\n=== Trip verdict ===");
console.log(
  `Tail (any run > ${TAIL_THRESHOLD_S}s): ${tailTrip ? "TRIPPED ⚠" : "clear"}`,
);
if (sustainedMedian == null) {
  console.log(
    `Sustained (median of ${SUSTAINED_WINDOW} events > ${SUSTAINED_THRESHOLD_S}s): not yet evaluable (${eventSeries.length}/${SUSTAINED_WINDOW} events).`,
  );
} else {
  console.log(
    `Sustained (median of last ${SUSTAINED_WINDOW} events > ${SUSTAINED_THRESHOLD_S}s): ${sustainedMedian}s — ${sustainedTrip ? "TRIPPED ⚠" : "clear"}`,
  );
}

if (tailTrip || sustainedTrip) {
  console.log(
    "\n‼ F-c FALSIFIER TRIPPED. Pre-registered decision: abandon the wholesale",
  );
  console.log(
    "  runner swap, pursue test-set partitioning. Decision owner: staff-engineer.",
  );
  console.log(
    "  Escalate via Announce/Issue; do not continue the swap rollout.",
  );
  process.exit(2);
}
