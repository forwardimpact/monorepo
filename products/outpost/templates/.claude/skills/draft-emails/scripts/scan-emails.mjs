#!/usr/bin/env bun
/**
 * Scan for unprocessed emails and output their IDs and subjects.
 *
 * The script checks ~/.cache/fit/outpost/apple_mail/ for email thread markdown
 * files. It skips a file that the ~/.cache/fit/outpost/drafts/handled or
 * ~/.cache/fit/outpost/drafts/ignored ledger already lists. It outputs one
 * tab-separated line per unprocessed thread: email_id<TAB>subject. The
 * draft-emails skill uses this script to find threads that need a reply.
 *
 * The ledgers live in the cache drafts/ directory. Never move them into
 * ~/.cache/fit/outpost/state/ — that directory is a daemon-owned trust root.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";

const HELP = `scan-emails — list unprocessed email threads

Usage: node scripts/scan-emails.mjs [-h|--help]

Scans ~/.cache/fit/outpost/apple_mail/ for .md thread files not yet
recorded in ~/.cache/fit/outpost/drafts/handled or
~/.cache/fit/outpost/drafts/ignored. Outputs one line per
unprocessed thread as: email_id<TAB>subject`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

const HOME = homedir();
const MAIL_DIR = join(HOME, ".cache/fit/outpost/apple_mail");
const DRAFTS_DIR = join(HOME, ".cache/fit/outpost/drafts");

/** Load a file of IDs (one per line) into a Set. */
function loadIdSet(path) {
  const ids = new Set();
  if (!existsSync(path)) return ids;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed) ids.add(trimmed);
  }
  return ids;
}

/** Extract the first H1 heading from a markdown file. */
function extractSubject(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const match = text.match(/^# (.+)$/m);
  return match ? match[1] : "";
}

function main() {
  if (!existsSync(MAIL_DIR)) return;

  mkdirSync(DRAFTS_DIR, { recursive: true });
  const handled = loadIdSet(join(DRAFTS_DIR, "handled"));
  const ignored = loadIdSet(join(DRAFTS_DIR, "ignored"));

  for (const name of readdirSync(MAIL_DIR).sort()) {
    if (!name.endsWith(".md")) continue;

    const emailId = basename(name, ".md");
    if (handled.has(emailId) || ignored.has(emailId)) continue;

    const subject = extractSubject(join(MAIL_DIR, name));
    console.log(`${emailId}\t${subject}`);
  }
}

main();
