#!/usr/bin/env node
// Append per-run efficiency metrics for the most-recent prior staff-engineer
// Kata: Dispatch trace into `wiki/metrics/staff-engineer/2026.csv`.
//
// Anchored at boot-time so a single run's metrics land at the next run's boot:
// the recorded trace is already terminal when we read it, so harness crash,
// timeout, or panic-on-push during the recording run does not skip the row.
//
// Idempotent on the GitHub Actions run-id in the `run` column. Skips silently
// when no eligible prior trace exists or any subcommand fails — boot must not
// fail because the metrics loop hit an empty week or a transient gh outage.
//
// Usage:
//   node scripts/staff-engineer-record-prior-trace.mjs
//     Default: record the most-recent prior staff-engineer trace.
//   node scripts/staff-engineer-record-prior-trace.mjs --backfill --since=7
//     Walk past N days of Kata: Dispatch runs and record every SE trace not
//     yet in the CSV. Use to seed an empty CSV or fill historical gaps;
//     ongoing runs use the default single-trace mode.
//   node scripts/staff-engineer-record-prior-trace.mjs --run-id=<id>
//     Record a specific run-id (still idempotent on the CSV).
//   node scripts/staff-engineer-record-prior-trace.mjs --dry-run
//     Print rows without writing.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = join(ROOT, "wiki/metrics/staff-engineer/2026.csv");
// Per-agent metrics CSVs carry a 7th `event_type` column (libxmr schema);
// dispatch-boot rows are tagged `kata-dispatch` so they form their own
// analysis slice, separate from the default `kata-shift` slice.
const EVENT_TYPE = "kata-dispatch";
const KATA_DISPATCH_WORKFLOW_ID = 281527270;
const REPO = process.env.GITHUB_REPOSITORY || "forwardimpact/monorepo";

const METRICS = [
  ["duration_seconds", "seconds"],
  ["tool_calls_total", "count"],
  ["bash_calls", "count"],
  ["output_tokens", "count"],
  ["cost_usd_per_run", "usd"],
  ["file_writes", "count"],
  ["commits_pushed", "count"],
  ["prs_opened", "count"],
  ["tool_errors", "count"],
];

function parseArgs(argv) {
  const args = { backfill: false, sinceDays: 7, runId: null, dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === "--backfill") args.backfill = true;
    else if (a.startsWith("--since="))
      args.sinceDays = parseInt(a.slice(8), 10);
    else if (a.startsWith("--run-id=")) args.runId = a.slice(9);
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

function csvEscape(s) {
  const str = String(s);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function readExistingRunIds() {
  if (!existsSync(CSV_PATH)) return new Set();
  const lines = readFileSync(CSV_PATH, "utf8").trim().split("\n");
  const set = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length >= 5) set.add(cols[4]);
  }
  return set;
}

function ghApi(path, jq) {
  const args = ["api", path];
  if (jq) args.push("--jq", jq);
  const r = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw new Error(`gh api ${path} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

function fetchRunsPage(page) {
  try {
    const raw = ghApi(
      `repos/${REPO}/actions/runs?per_page=100&page=${page}`,
      `.workflow_runs[] | {id: .id, workflow_id: .workflow_id, conclusion: .conclusion, created_at: .created_at}`,
    );
    return { lines: raw.trim().split("\n").filter(Boolean) };
  } catch (e) {
    console.warn(`listDispatchRuns page ${page} failed: ${e.message}`);
    return { lines: null };
  }
}

function isDispatchSuccessInWindow(obj, sinceIso, excludeRunId) {
  if (obj.workflow_id !== KATA_DISPATCH_WORKFLOW_ID) return false;
  if (obj.conclusion !== "success") return false;
  if (obj.created_at < sinceIso) return false;
  if (excludeRunId && String(obj.id) === String(excludeRunId)) return false;
  return true;
}

function collectPageRuns(lines, sinceIso, excludeRunId, seen, out) {
  let oldestOnPage = null;
  for (const ln of lines) {
    let obj;
    try {
      obj = JSON.parse(ln);
    } catch {
      continue;
    }
    if (!oldestOnPage || obj.created_at < oldestOnPage)
      oldestOnPage = obj.created_at;
    if (!isDispatchSuccessInWindow(obj, sinceIso, excludeRunId)) continue;
    if (seen.has(obj.id)) continue;
    seen.add(obj.id);
    out.push({ id: obj.id, created_at: obj.created_at });
  }
  return oldestOnPage;
}

function listDispatchRuns(sinceIso, excludeRunId) {
  // The Actions API mixes every workflow's runs in one stream and the
  // workflow_id query param is unreliable across run-attempt rewrites. We
  // page on the unfiltered response (size=100) and filter client-side so
  // pagination terminates only when the oldest unfiltered run on the page
  // is older than sinceIso.
  const seen = new Set();
  const out = [];
  for (let page = 1; page <= 60; page++) {
    const { lines } = fetchRunsPage(page);
    if (lines === null) break;
    if (lines.length === 0) break;
    const oldestOnPage = collectPageRuns(
      lines,
      sinceIso,
      excludeRunId,
      seen,
      out,
    );
    if (oldestOnPage && oldestOnPage < sinceIso) break;
    if (lines.length < 100) break;
  }
  out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return out;
}

function fitTrace(args, { maxBuffer = 200 * 1024 * 1024 } = {}) {
  const r = spawnSync("fit-trace", args, { encoding: "utf8", maxBuffer });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function downloadTrace(runId) {
  const r = fitTrace(["download", String(runId)]);
  if (r.status !== 0) return null;
  const txt = r.stdout;
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(txt.substring(start, end + 1));
  } catch {
    return null;
  }
}

function tallyBashCommand(cmd, tally) {
  if (/\bgit\s+push\b/.test(cmd)) tally.commitsPushed++;
  if (/\bgh\s+pr\s+create\b/.test(cmd)) tally.prsOpened++;
}

function tallyTurnBashUses(turn, tally) {
  if (!Array.isArray(turn.content)) return;
  for (const c of turn.content) {
    if (c.type !== "tool_use" || c.name !== "Bash") continue;
    tallyBashCommand(c.input?.command || "", tally);
  }
}

function countBashIntents(traceFile) {
  const bashR = fitTrace(["tool", traceFile, "Bash"]);
  if (bashR.status !== 0) return { commitsPushed: 0, prsOpened: 0 };
  const tally = { commitsPushed: 0, prsOpened: 0 };
  for (const turn of JSON.parse(bashR.stdout)) tallyTurnBashUses(turn, tally);
  return tally;
}

function fitTraceJson(args, label) {
  const r = fitTrace(args);
  if (r.status !== 0) throw new Error(`${label} failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function parseTraceEvent(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let event;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return null;
  }
  // Combined supervised traces wrap each event as {source, seq, event}.
  if (event.event && !event.type && typeof event.source === "string") {
    return event.event;
  }
  return event;
}

// Cost, duration, and output_tokens must be summed over ALL "type":"result"
// events, never read from `fit-trace stats` totals: stats keeps only the
// last result event (handleResult last-wins in libeval's trace-collector),
// which understates multi-result lanes 11x-55x, and its output-token figure
// carries a dedup defect on single-result traces too.
function sumResultEvents(traceFile) {
  const sums = { count: 0, costUsd: 0, durationMs: 0, outputTokens: 0 };
  for (const line of readFileSync(traceFile, "utf8").split("\n")) {
    const event = parseTraceEvent(line);
    if (!event || event.type !== "result") continue;
    sums.count++;
    sums.costUsd += event.total_cost_usd ?? 0;
    sums.durationMs += event.duration_ms ?? 0;
    sums.outputTokens += event.usage?.output_tokens ?? 0;
  }
  return sums;
}

function extractMetrics(traceFile) {
  const results = sumResultEvents(traceFile);
  const tools = fitTraceJson(["tools", traceFile], "tools");
  const toolMap = new Map(tools.map((t) => [t.tool, t.count]));

  const errR = fitTrace(["errors", traceFile]);
  const toolErrors = errR.status === 0 ? JSON.parse(errR.stdout).length : 0;

  const { commitsPushed, prsOpened } = countBashIntents(traceFile);

  const bashCalls = toolMap.get("Bash") || 0;
  const totalCalls = tools.reduce((s, t) => s + t.count, 0);
  const fileWrites = (toolMap.get("Write") || 0) + (toolMap.get("Edit") || 0);

  // A zero-result lane has no cost/duration/output observation — record those
  // metrics as missing (null rows are dropped), never as 0, so degenerate
  // zeros don't contaminate the XmR series.
  const hasResults = results.count > 0;
  return {
    duration_seconds: hasResults ? Math.round(results.durationMs / 1000) : null,
    tool_calls_total: totalCalls,
    bash_calls: bashCalls,
    output_tokens: hasResults ? results.outputTokens : null,
    cost_usd_per_run: hasResults ? Number(results.costUsd.toFixed(4)) : null,
    file_writes: fileWrites,
    commits_pushed: commitsPushed,
    prs_opened: prsOpened,
    tool_errors: toolErrors,
    _durationMs: hasResults ? results.durationMs : null,
    _resultEvents: results.count,
  };
}

function recordRun(run, runLabel, dryRun, existingRunIds) {
  const dl = downloadTrace(run.id);
  if (!dl || !Array.isArray(dl.files)) return { skipped: "no-artifact" };
  const seFile = dl.files.find((f) =>
    f.endsWith("staff-engineer.agent.ndjson"),
  );
  if (!seFile) return { skipped: "no-se-trace" };

  let metrics;
  try {
    metrics = extractMetrics(join(dl.dir, seFile));
  } catch (e) {
    return { skipped: `extract-failed: ${e.message}` };
  }

  const date = run.created_at.substring(0, 10);
  const note =
    `boot-append from Kata: Dispatch ${run.id}; ` +
    `resultEvents=${metrics._resultEvents}; ` +
    `durationMs=${metrics._durationMs ?? "missing"}`;
  const rows = METRICS.filter(([metric]) => metrics[metric] !== null).map(
    ([metric, unit]) => [
      date,
      metric,
      metrics[metric],
      unit,
      runLabel,
      note,
      EVENT_TYPE,
    ],
  );
  const block = rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
  if (dryRun) {
    process.stdout.write(block);
  } else {
    appendFileSync(CSV_PATH, block);
  }
  existingRunIds.add(runLabel);
  return { appended: rows.length, date };
}

function lookupCreatedAt(runId) {
  // Look up the run's actual created_at so the row's date column is the
  // run date, not today.
  try {
    const raw = ghApi(`repos/${REPO}/actions/runs/${runId}`, ".created_at");
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
  } catch (e) {
    console.warn(`run lookup failed: ${e.message}`);
  }
  return new Date().toISOString();
}

function resolveCandidates(args, currentRunId) {
  if (args.runId) {
    return [{ id: args.runId, created_at: lookupCreatedAt(args.runId) }];
  }
  const sinceMs = Date.now() - args.sinceDays * 86_400_000;
  const sinceIso = new Date(sinceMs).toISOString();
  try {
    return listDispatchRuns(sinceIso, currentRunId);
  } catch (e) {
    console.warn(`list failed: ${e.message}`);
    return null;
  }
}

function processCandidates(candidates, args) {
  const existingRunIds = readExistingRunIds();
  let totalRows = 0;
  let traces = 0;
  for (const run of candidates) {
    const runLabel = `run-${run.id}`;
    const alreadyRecorded =
      existingRunIds.has(runLabel) || existingRunIds.has(String(run.id));
    if (alreadyRecorded) {
      if (!args.backfill) {
        console.log(`already recorded ${runLabel}; nothing to append`);
        return { totalRows, traces };
      }
      continue;
    }
    const result = recordRun(run, runLabel, args.dryRun, existingRunIds);
    if (result.appended) {
      totalRows += result.appended;
      traces++;
      console.log(
        `appended ${result.appended} rows for ${runLabel} (${result.date})`,
      );
      if (!args.backfill) return { totalRows, traces };
    }
  }
  return { totalRows, traces };
}

function main() {
  const args = parseArgs(process.argv);
  const currentRunId = process.env.GITHUB_RUN_ID || null;
  const candidates = resolveCandidates(args, currentRunId);
  if (!candidates) return;
  const { totalRows, traces } = processCandidates(candidates, args);
  console.log(`done: ${traces} trace(s), ${totalRows} row(s)`);
}

// Hot-path hardening: any synchronous throw from main() (post-existsSync race,
// permission flip, etc.) must not propagate non-zero from this boot helper.
try {
  main();
} catch (e) {
  console.warn(`record-prior-trace failed: ${e.message}`);
}
process.exit(0);
