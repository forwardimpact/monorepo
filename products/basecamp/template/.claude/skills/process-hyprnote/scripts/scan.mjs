#!/usr/bin/env bun
/**
 * Scan for unprocessed Hyprnote sessions.
 *
 * Compares session _memo.md and _summary.md files against the graph_processed
 * state file to identify sessions that need processing. Reports unprocessed
 * sessions with title, date, and content preview.
 *
 * Usage:
 *   node scripts/scan.mjs              List unprocessed sessions
 *   node scripts/scan.mjs --changed    Also detect changed (re-edited) sessions
 *   node scripts/scan.mjs --json       Output as JSON
 *   node scripts/scan.mjs --count      Just print the count
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const SESSIONS_DIR = join(
  HOME,
  "Library/Application Support/hyprnote/sessions",
);
const STATE_FILE = join(HOME, ".cache/fit/basecamp/state/graph_processed");

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(`scan — find unprocessed Hyprnote sessions

Usage:
  node scripts/scan.mjs [options]

Options:
  --changed    Also detect sessions whose memo/summary hash has changed
  --json       Output as JSON array
  --count      Just print the unprocessed count (for scripting)
  --limit N    Max sessions to display (default: 20)
  -h, --help   Show this help message

Sessions dir: ~/Library/Application Support/hyprnote/sessions/
State file:   ~/.cache/fit/basecamp/state/graph_processed`);
  process.exit(0);
}

const args = process.argv.slice(2);
const detectChanged = args.includes("--changed");
const jsonOutput = args.includes("--json");
const countOnly = args.includes("--count");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) || 20 : 20;

// --- Load state ---

const state = new Map();
if (existsSync(STATE_FILE)) {
  const text = readFileSync(STATE_FILE, "utf8");
  for (const line of text.split("\n")) {
    if (!line) continue;
    const idx = line.indexOf("\t");
    if (idx === -1) continue;
    state.set(line.slice(0, idx), line.slice(idx + 1));
  }
}

/**
 * Compute SHA-256 hash of file contents.
 */
function fileHash(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/**
 * Check if a file needs processing (new or changed).
 */
function needsProcessing(filePath) {
  const storedHash = state.get(filePath);
  if (!storedHash) return { needed: true, reason: "new" };
  if (detectChanged) {
    const currentHash = fileHash(filePath);
    if (currentHash !== storedHash) return { needed: true, reason: "changed" };
  }
  return { needed: false, reason: null };
}

/**
 * Extract title and date from a memo file.
 */
function parseMemo(memoPath) {
  try {
    const content = readFileSync(memoPath, "utf8");

    // Skip empty/whitespace-only memos
    const body = content.replace(/---[\s\S]*?---/, "").trim();
    if (!body || body === "&nbsp;") return null;

    // Extract title from first H1
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : null;

    // Extract date from content or fall back to file mtime
    const dateMatch = content.match(/\d{4}-\d{2}-\d{2}/);
    let date = dateMatch ? dateMatch[0] : null;

    if (!date) {
      const stat = statSync(memoPath);
      date = stat.mtime.toISOString().slice(0, 10);
    }

    return { title, date, preview: body.slice(0, 150).replace(/\n/g, " ") };
  } catch {
    return null;
  }
}

/**
 * Read _meta.json for session metadata.
 */
function readMeta(sessionDir) {
  const metaPath = join(sessionDir, "_meta.json");
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

// --- Scan sessions ---

if (!existsSync(SESSIONS_DIR)) {
  console.error(`Hyprnote sessions directory not found: ${SESSIONS_DIR}`);
  process.exit(1);
}

const sessionIds = readdirSync(SESSIONS_DIR);
const unprocessed = [];
let totalWithMemos = 0;
let processedCount = 0;

for (const uuid of sessionIds) {
  const sessionPath = join(SESSIONS_DIR, uuid);
  const stat = statSync(sessionPath, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory()) continue;

  const memoPath = join(sessionPath, "_memo.md");
  const summaryPath = join(sessionPath, "_summary.md");
  const hasMemo = existsSync(memoPath);
  const hasSummary = existsSync(summaryPath);

  if (!hasMemo && !hasSummary) continue;

  totalWithMemos++;

  // Check memo
  const memoCheck = hasMemo
    ? needsProcessing(memoPath)
    : { needed: false, reason: null };

  // Check summary
  const summaryCheck = hasSummary
    ? needsProcessing(summaryPath)
    : { needed: false, reason: null };

  if (!memoCheck.needed && !summaryCheck.needed) {
    processedCount++;
    continue;
  }

  // Parse memo for display info
  const memo = hasMemo ? parseMemo(memoPath) : null;
  if (hasMemo && !memo) {
    // Empty memo, no summary → skip
    if (!hasSummary) continue;
  }

  // Read meta for title fallback
  const meta = readMeta(sessionPath);

  const title = memo?.title || meta?.title || uuid.slice(0, 8);
  const date =
    memo?.date ||
    (meta?.created_at ? meta.created_at.slice(0, 10) : null) ||
    statSync(sessionPath).mtime.toISOString().slice(0, 10);

  unprocessed.push({
    uuid,
    title,
    date,
    hasMemo,
    hasSummary,
    memoReason: memoCheck.reason,
    summaryReason: summaryCheck.reason,
    preview: memo?.preview || "(summary only)",
    memoPath: hasMemo ? memoPath : null,
    summaryPath: hasSummary ? summaryPath : null,
  });
}

// Sort by date descending (newest first)
unprocessed.sort((a, b) => b.date.localeCompare(a.date));

// --- Output ---

if (countOnly) {
  console.log(unprocessed.length);
  process.exit(0);
}

if (jsonOutput) {
  console.log(JSON.stringify(unprocessed.slice(0, limit), null, 2));
  process.exit(0);
}

// Formatted output
console.log(
  `Sessions: ${totalWithMemos} total, ${processedCount} processed, ${unprocessed.length} unprocessed`,
);

if (unprocessed.length === 0) {
  console.log("\nAll sessions are up to date.");
  process.exit(0);
}

console.log("");
const display = unprocessed.slice(0, limit);
for (const s of display) {
  const flags = [];
  if (s.memoReason) flags.push(`memo:${s.memoReason}`);
  if (s.summaryReason) flags.push(`summary:${s.summaryReason}`);
  const sources = [];
  if (s.hasMemo) sources.push("memo");
  if (s.hasSummary) sources.push("summary");

  console.log(
    `${s.date} | ${s.title} | ${sources.join("+")} | ${flags.join(", ")}`,
  );
  console.log(`  ${s.uuid}`);
  if (s.preview && s.preview !== "(summary only)") {
    console.log(`  ${s.preview.slice(0, 100)}…`);
  }
}

if (unprocessed.length > limit) {
  console.log(`\n... and ${unprocessed.length - limit} more`);
}
