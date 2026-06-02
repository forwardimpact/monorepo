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
//     yet in the CSV. Use once after spec 1351 lands; ongoing runs use the
//     default single-trace mode.
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
    else if (a.startsWith("--since=")) args.sinceDays = parseInt(a.slice(8), 10);
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
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur); cur = "";
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
  const r = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`gh api ${path} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
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
    let raw;
    try {
      raw = ghApi(
        `repos/${REPO}/actions/runs?per_page=100&page=${page}`,
        `.workflow_runs[] | {id: .id, workflow_id: .workflow_id, conclusion: .conclusion, created_at: .created_at}`,
      );
    } catch (e) {
      console.warn(`listDispatchRuns page ${page} failed: ${e.message}`);
      break;
    }
    const lines = raw.trim().split("\n").filter(Boolean);
    if (lines.length === 0) break;
    let oldestOnPage = null;
    for (const ln of lines) {
      let obj;
      try { obj = JSON.parse(ln); } catch { continue; }
      if (!oldestOnPage || obj.created_at < oldestOnPage) oldestOnPage = obj.created_at;
      if (obj.workflow_id !== KATA_DISPATCH_WORKFLOW_ID) continue;
      if (obj.conclusion !== "success") continue;
      if (obj.created_at < sinceIso) continue;
      if (excludeRunId && String(obj.id) === String(excludeRunId)) continue;
      if (seen.has(obj.id)) continue;
      seen.add(obj.id);
      out.push({ id: obj.id, created_at: obj.created_at });
    }
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
  try { return JSON.parse(txt.substring(start, end + 1)); }
  catch { return null; }
}

function extractMetrics(traceFile) {
  const statsR = fitTrace(["stats", traceFile]);
  if (statsR.status !== 0) throw new Error(`stats failed: ${statsR.stderr}`);
  const totals = JSON.parse(statsR.stdout).totals;

  const toolsR = fitTrace(["tools", traceFile]);
  if (toolsR.status !== 0) throw new Error(`tools failed: ${toolsR.stderr}`);
  const tools = JSON.parse(toolsR.stdout);
  const toolMap = new Map(tools.map((t) => [t.tool, t.count]));

  const errR = fitTrace(["errors", traceFile]);
  const toolErrors = errR.status === 0 ? JSON.parse(errR.stdout).length : 0;

  const bashR = fitTrace(["tool", traceFile, "Bash"]);
  let commitsPushed = 0;
  let prsOpened = 0;
  if (bashR.status === 0) {
    const turns = JSON.parse(bashR.stdout);
    for (const t of turns) {
      if (!Array.isArray(t.content)) continue;
      for (const c of t.content) {
        if (c.type !== "tool_use" || c.name !== "Bash") continue;
        const cmd = c.input?.command || "";
        if (/\bgit\s+push\b/.test(cmd)) commitsPushed++;
        if (/\bgh\s+pr\s+create\b/.test(cmd)) prsOpened++;
      }
    }
  }

  const bashCalls = toolMap.get("Bash") || 0;
  const totalCalls = tools.reduce((s, t) => s + t.count, 0);
  const fileWrites = (toolMap.get("Write") || 0) + (toolMap.get("Edit") || 0);

  return {
    duration_seconds: Math.round((totals.durationMs || 0) / 1000),
    tool_calls_total: totalCalls,
    bash_calls: bashCalls,
    output_tokens: totals.outputTokens || 0,
    cost_usd_per_run: Number((totals.totalCostUsd || 0).toFixed(4)),
    file_writes: fileWrites,
    commits_pushed: commitsPushed,
    prs_opened: prsOpened,
    tool_errors: toolErrors,
    _durationMs: totals.durationMs,
  };
}

function recordRun(run, runLabel, dryRun, existingRunIds) {
  const dl = downloadTrace(run.id);
  if (!dl || !Array.isArray(dl.files)) return { skipped: "no-artifact" };
  const seFile = dl.files.find((f) => f.endsWith("staff-engineer.agent.ndjson"));
  if (!seFile) return { skipped: "no-se-trace" };

  let metrics;
  try { metrics = extractMetrics(join(dl.dir, seFile)); }
  catch (e) { return { skipped: `extract-failed: ${e.message}` }; }

  const date = run.created_at.substring(0, 10);
  const note = `boot-append from Kata: Dispatch ${run.id}; durationMs=${metrics._durationMs}`;
  const rows = METRICS.map(([metric, unit]) => [
    date, metric, metrics[metric], unit, runLabel, note,
  ]);
  const block = rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
  if (dryRun) {
    process.stdout.write(block);
  } else {
    appendFileSync(CSV_PATH, block);
  }
  existingRunIds.add(runLabel);
  return { appended: rows.length, date };
}

function main() {
  const args = parseArgs(process.argv);
  const existingRunIds = readExistingRunIds();
  const currentRunId = process.env.GITHUB_RUN_ID || null;

  let candidates;
  if (args.runId) {
    // Look up the run's actual created_at so the row's date column is the
    // run date, not today.
    let createdAt = new Date().toISOString();
    try {
      const raw = ghApi(`repos/${REPO}/actions/runs/${args.runId}`, ".created_at");
      const trimmed = raw.trim();
      if (trimmed) createdAt = trimmed;
    } catch (e) { console.warn(`run lookup failed: ${e.message}`); }
    candidates = [{ id: args.runId, created_at: createdAt }];
  } else {
    const sinceMs = Date.now() - args.sinceDays * 86_400_000;
    const sinceIso = new Date(sinceMs).toISOString();
    try { candidates = listDispatchRuns(sinceIso, currentRunId); }
    catch (e) { console.warn(`list failed: ${e.message}`); return; }
  }

  let totalRows = 0;
  let traces = 0;
  for (const run of candidates) {
    const runLabel = `run-${run.id}`;
    if (existingRunIds.has(runLabel) || existingRunIds.has(String(run.id))) {
      if (!args.backfill) {
        console.log(`already recorded ${runLabel}; nothing to append`);
        return;
      }
      continue;
    }
    const result = recordRun(run, runLabel, args.dryRun, existingRunIds);
    if (result.appended) {
      totalRows += result.appended;
      traces++;
      console.log(`appended ${result.appended} rows for ${runLabel} (${result.date})`);
      if (!args.backfill) return;
    } else if (!args.backfill) {
      // skip and continue to next candidate when looking for the freshest SE trace
      // (single-trace mode keeps walking until it finds one)
    }
  }
  console.log(`done: ${traces} trace(s), ${totalRows} row(s)`);
}

main();
