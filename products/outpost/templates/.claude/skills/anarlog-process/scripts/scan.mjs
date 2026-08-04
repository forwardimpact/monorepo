#!/usr/bin/env bun
/**
 * Scan for unprocessed Anarlog meetings.
 *
 * Anarlog stores meetings in a local SQLite database (app.db). The supported,
 * format-agnostic way to read them is the bundled `anarlog-cli` — the app's
 * own AGENTS.md is explicit: use the CLI, do NOT crawl the filesystem or query
 * SQLite directly. This script enumerates meetings via that CLI, compares them
 * against the shared graph_processed state, and reports meetings that still
 * need processing. Because it reads through the CLI it finds every meeting,
 * including recent ones Anarlog has not exported to flat files yet.
 *
 * Older Anarlog versions exported each session to flat files
 * (_memo.md / _summary.md) under sessions/{uuid}/. Those already-processed
 * sessions are recorded in graph_processed under their file paths; this script
 * treats them as frozen so they are not reprocessed. If the CLI is unavailable
 * it falls back to scanning those flat files directly, so the skill keeps
 * working however the data happens to be available.
 *
 * Usage:
 *   node scripts/scan.mjs                 List unprocessed meetings
 *   node scripts/scan.mjs --changed       Also detect changed (re-edited) meetings
 *   node scripts/scan.mjs --json          Output as JSON
 *   node scripts/scan.mjs --count         Just print the count
 *   node scripts/scan.mjs --limit N       Max meetings to display (default: 20)
 *   node scripts/scan.mjs --legacy        Force the flat-file scan (fallback)
 *   node scripts/scan.mjs mark <id>...    Mark meetings processed (after writing notes)
 *   node scripts/scan.mjs cli-path        Print the resolved anarlog-cli path
 *
 * Env overrides:
 *   ANARLOG_CLI          Path to the anarlog-cli binary.
 *   OUTPOST_STATE_FILE   Path to the graph_processed TSV (for testing).
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const HOME = homedir();
const SESSIONS_DIR = join(HOME, "Library/Application Support/anarlog/sessions");
const STATE_FILE =
  process.env.OUTPOST_STATE_FILE ||
  join(HOME, ".cache/fit/outpost/state/graph_processed");

// --- Args ---

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(`scan — find unprocessed Anarlog meetings

Usage:
  node scripts/scan.mjs [options]
  node scripts/scan.mjs mark <id> [<id>…]   Mark meetings processed
  node scripts/scan.mjs cli-path            Print the resolved anarlog-cli path

Options:
  --changed    Also detect meetings whose note/summary content has changed
  --json       Output as JSON array
  --count      Just print the unprocessed count (for scripting)
  --limit N    Max meetings to display (default: 20)
  --legacy     Force the flat-file scan even if the CLI is available
  -h, --help   Show this help message

Reads meetings through anarlog-cli (falls back to flat files under
~/Library/Application Support/anarlog/sessions/ if the CLI is unavailable).
State file: ${STATE_FILE}`);
  process.exit(0);
}

const args = process.argv.slice(2);
const subcommand = args[0] && !args[0].startsWith("-") ? args[0] : null;
const detectChanged = args.includes("--changed");
const jsonOutput = args.includes("--json");
const countOnly = args.includes("--count");
const forceLegacy = args.includes("--legacy");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) || 20 : 20;

// --- CLI discovery ---

/** Resolve the anarlog-cli binary: env override, app bundle, then PATH. */
function resolveCli() {
  const candidates = [];
  if (process.env.ANARLOG_CLI) candidates.push(process.env.ANARLOG_CLI);
  candidates.push("/Applications/Anarlog.app/Contents/MacOS/anarlog-cli");
  for (const name of ["anarlog-cli", "anarlog"]) {
    try {
      const p = execFileSync("/usr/bin/which", [name], {
        encoding: "utf8",
      }).trim();
      if (p) candidates.push(p);
    } catch {
      /* not on PATH */
    }
  }
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

/** Run an anarlog-cli command and return its parsed `data` payload. */
function runCli(cli, cliArgs) {
  const out = execFileSync(cli, cliArgs, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return JSON.parse(out).data;
}

/** True if the CLI can open the database read-only. */
function cliReady(cli) {
  try {
    const d = runCli(cli, ["--json", "doctor"]);
    return !!(d && d.ready && d.database && d.database.exists);
  } catch {
    return false;
  }
}

/** Enumerate every meeting via the CLI, paging through the full list. */
function listAllMeetings(cli) {
  const all = [];
  const pageSize = 200;
  let offset = 0;
  for (;;) {
    const page = runCli(cli, [
      "--json",
      "meetings",
      "list",
      "--limit",
      String(pageSize),
      "--offset",
      String(offset),
    ]);
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// --- State ---

/** Load the graph_processed TSV into a Map of {key → hash}. */
function loadState() {
  const state = new Map();
  if (!existsSync(STATE_FILE)) return state;
  const text = readFileSync(STATE_FILE, "utf8");
  for (const line of text.split("\n")) {
    if (!line) continue;
    const idx = line.indexOf("\t");
    if (idx === -1) continue;
    state.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return state;
}

/** Write the state Map back to graph_processed (sorted, TSV). */
function saveState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  const entries = [...state.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const text = entries.length
    ? entries.map(([k, h]) => `${k}\t${h}`).join("\n") + "\n"
    : "";
  writeFileSync(STATE_FILE, text);
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// State keys. New meetings use one synthetic key per session; legacy sessions
// are keyed by the flat-file paths the old pipeline recorded.
const synthKey = (id) => `anarlog://${id}`;
const legacyMemoKey = (id) => join(SESSIONS_DIR, id, "_memo.md");
const legacySummaryKey = (id) => join(SESSIONS_DIR, id, "_summary.md");
const hasLegacyKey = (state, id) =>
  state.has(legacyMemoKey(id)) || state.has(legacySummaryKey(id));

// --- Content helpers ---

/** A note body is empty if it is blank, a spacer, or only its title heading. */
function noteBody(markdown) {
  const body = (markdown || "")
    .replace(/^#\s+.*$/m, "") // drop the leading title heading
    .replace(/&nbsp;/g, "")
    .trim();
  return body;
}

/** Collapse markdown to a one-line preview. */
function preview(markdown) {
  return (markdown || "")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

/**
 * Read a meeting's processable content via the CLI.
 * Returns { note, summary, combined, hasContent, participants, actionItems }.
 */
function meetingContent(cli, id) {
  const d = runCli(cli, ["--json", "meetings", "get", id]) || {};
  const rawNote = (d.note && d.note.markdown) || "";
  const note = noteBody(rawNote) ? rawNote.trim() : "";
  const summary = (d.summaries || [])
    .map((s) => (s.markdown || "").trim())
    .filter(Boolean)
    .join("\n\n");
  return {
    title: d.title || "",
    createdAt: d.created_at || "",
    note,
    summary,
    combined: `${note}\n---\n${summary}`,
    hasContent: Boolean(note || summary),
    participants: (d.participants || []).length,
    actionItems: (d.action_items || []).length,
  };
}

// --- CLI scan ---

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-meeting skip/change/legacy triage in one pass
function scanCli(cli) {
  const state = loadState();
  const meetings = listAllMeetings(cli);
  const unprocessed = [];

  for (const m of meetings) {
    const id = m.id;

    // Legacy sessions were handled under the old flat-file regime — frozen.
    if (hasLegacyKey(state, id)) continue;

    const stored = state.get(synthKey(id));
    // Already marked and we aren't looking for edits → skip without a fetch.
    if (stored && !detectChanged) continue;

    let c;
    try {
      c = meetingContent(cli, id);
    } catch {
      continue; // unreadable meeting — skip rather than crash the scan
    }
    if (!c.hasContent) continue; // empty/onboarding/test session → skip

    const hash = sha256(c.combined);
    let reason;
    if (!stored) reason = "new";
    else if (stored !== hash) reason = "changed";
    else continue; // marked and unchanged

    const sources = [];
    if (c.note) sources.push("note");
    if (c.summary) sources.push("summary");

    unprocessed.push({
      id,
      title: c.title || m.title || id.slice(0, 8),
      date: (m.created_at || c.createdAt || "").slice(0, 10),
      sources,
      reason,
      participants: c.participants,
      actionItems: c.actionItems,
      preview: preview(c.summary || c.note),
    });
  }

  unprocessed.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return { unprocessed, total: meetings.length, mode: "cli" };
}

// --- Legacy flat-file scan (fallback when the CLI is unavailable) ---

function needsFile(state, filePath) {
  const stored = state.get(filePath);
  if (!stored) return { needed: true, reason: "new" };
  if (detectChanged) {
    const current = sha256(readFileSync(filePath, "utf8"));
    if (current !== stored) return { needed: true, reason: "changed" };
  }
  return { needed: false, reason: null };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: verbatim legacy flat-file scan kept as the fallback path
function scanLegacy() {
  const state = loadState();
  if (!existsSync(SESSIONS_DIR)) {
    console.error(`Anarlog sessions directory not found: ${SESSIONS_DIR}`);
    console.error("The anarlog-cli was also not found — nothing to scan.");
    process.exit(1);
  }

  const unprocessed = [];
  let total = 0;

  for (const uuid of readdirSync(SESSIONS_DIR)) {
    const dir = join(SESSIONS_DIR, uuid);
    const st = statSync(dir, { throwIfNoEntry: false });
    if (!st || !st.isDirectory()) continue;

    const memoPath = join(dir, "_memo.md");
    const summaryPath = join(dir, "_summary.md");
    const hasMemo = existsSync(memoPath);
    const hasSummary = existsSync(summaryPath);
    if (!hasMemo && !hasSummary) continue;
    total++;

    const memoCheck = hasMemo
      ? needsFile(state, memoPath)
      : { needed: false, reason: null };
    const summaryCheck = hasSummary
      ? needsFile(state, summaryPath)
      : { needed: false, reason: null };
    if (!memoCheck.needed && !summaryCheck.needed) continue;

    let memoText = "";
    if (hasMemo) {
      const content = readFileSync(memoPath, "utf8");
      const body = content.replace(/---[\s\S]*?---/, "").trim();
      if (!body || body === "&nbsp;") {
        if (!hasSummary) continue; // empty memo, no summary → skip
      } else {
        memoText = content;
      }
    }

    let title = null;
    let date = null;
    const titleMatch = memoText.match(/^#\s+(.+)/m);
    if (titleMatch) title = titleMatch[1].trim();
    const dateMatch = memoText.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) date = dateMatch[0];
    if ((!title || !date) && existsSync(join(dir, "_meta.json"))) {
      try {
        const meta = JSON.parse(readFileSync(join(dir, "_meta.json"), "utf8"));
        title = title || meta.title;
        date = date || (meta.created_at ? meta.created_at.slice(0, 10) : null);
      } catch {
        /* ignore */
      }
    }
    date = date || statSync(dir).mtime.toISOString().slice(0, 10);

    const sources = [];
    if (hasMemo && memoText) sources.push("note");
    if (hasSummary) sources.push("summary");

    unprocessed.push({
      id: uuid,
      title: title || uuid.slice(0, 8),
      date,
      sources,
      reason: memoCheck.reason || summaryCheck.reason,
      preview: preview(memoText.replace(/---[\s\S]*?---/, "")),
      memoPath: hasMemo ? memoPath : null,
      summaryPath: hasSummary ? summaryPath : null,
    });
  }

  unprocessed.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return { unprocessed, total, mode: "legacy" };
}

// --- mark ---

function doMark(cli, ids) {
  if (!cli) {
    console.error("mark requires anarlog-cli, which was not found.");
    console.error(
      "For legacy flat-file sessions, use extract-entities/scripts/state.mjs update <path> instead.",
    );
    process.exit(1);
  }
  if (ids.length === 0) {
    console.error("Usage: scan.mjs mark <session-id> [<session-id>…]");
    process.exit(1);
  }
  const state = loadState();
  let marked = 0;
  for (const id of ids) {
    let c;
    try {
      c = meetingContent(cli, id);
    } catch (e) {
      console.error(`skip ${id}: ${e.message}`);
      continue;
    }
    if (!c.hasContent) {
      console.error(`skip ${id}: no note or summary content`);
      continue;
    }
    state.set(synthKey(id), sha256(c.combined));
    marked++;
    console.error(`marked ${id} — ${c.title}`);
  }
  saveState(state);
  console.log(`Marked ${marked} meeting(s) processed in ${STATE_FILE}`);
}

// --- Output ---

function output(result) {
  const { unprocessed, total, mode } = result;

  if (countOnly) {
    console.log(unprocessed.length);
    return;
  }
  if (jsonOutput) {
    console.log(JSON.stringify(unprocessed.slice(0, limit), null, 2));
    return;
  }

  console.log(
    `Meetings: ${total} total, ${unprocessed.length} unprocessed (${mode} scan)`,
  );
  if (unprocessed.length === 0) {
    console.log("\nAll meetings are up to date.");
    return;
  }

  console.log("");
  for (const s of unprocessed.slice(0, limit)) {
    const extra = [];
    if (s.participants) extra.push(`${s.participants}p`);
    if (s.actionItems) extra.push(`${s.actionItems} action items`);
    console.log(
      `${s.date} | ${s.title} | ${s.sources.join("+")} | ${s.reason}${
        extra.length ? ` | ${extra.join(", ")}` : ""
      }`,
    );
    console.log(`  ${s.id}`);
    if (s.preview) console.log(`  ${s.preview.slice(0, 100)}…`);
  }
  if (unprocessed.length > limit) {
    console.log(`\n... and ${unprocessed.length - limit} more`);
  }
}

// --- Main ---

const cli = resolveCli();

if (subcommand === "cli-path") {
  if (cli) {
    console.log(cli);
    process.exit(0);
  }
  console.error("anarlog-cli not found");
  process.exit(1);
}

if (subcommand === "mark") {
  doMark(
    cli,
    args.slice(1).filter((a) => !a.startsWith("-")),
  );
  process.exit(0);
}

let result;
if (cli && !forceLegacy && cliReady(cli)) {
  result = scanCli(cli);
} else {
  if (!forceLegacy && !cli) {
    console.error(
      "anarlog-cli not found — falling back to legacy flat-file scan.\n",
    );
  }
  result = scanLegacy();
}
output(result);
