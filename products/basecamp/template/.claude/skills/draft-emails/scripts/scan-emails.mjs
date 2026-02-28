#!/usr/bin/env node
/**
 * Scan for unprocessed emails and output their IDs and subjects.
 *
 * Checks ~/.cache/fit/basecamp/apple_mail/ for email thread markdown files not
 * yet listed in drafts/drafted or drafts/ignored. Outputs one tab-separated
 * line per unprocessed thread: email_id<TAB>subject. Used by the draft-emails
 * skill to identify threads that need a reply.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";

const HELP = `scan-emails — list unprocessed email threads

Usage: node scripts/scan-emails.mjs [-h|--help]

Scans ~/.cache/fit/basecamp/apple_mail/ for .md thread files not yet
recorded in drafts/drafted or drafts/ignored. Outputs one line per
unprocessed thread as: email_id<TAB>subject`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

const HOME = homedir();
const MAIL_DIR = join(HOME, ".cache/fit/basecamp/apple_mail");

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

  const drafted = loadIdSet("drafts/drafted");
  const ignored = loadIdSet("drafts/ignored");

  for (const name of readdirSync(MAIL_DIR).sort()) {
    if (!name.endsWith(".md")) continue;

    const emailId = basename(name, ".md");
    if (drafted.has(emailId) || ignored.has(emailId)) continue;

    const subject = extractSubject(join(MAIL_DIR, name));
    console.log(`${emailId}\t${subject}`);
  }
}

main();
