#!/usr/bin/env node
/**
 * Manage graph_processed state for entity extraction.
 *
 * Commands:
 *   check   - Find unprocessed or changed source files
 *   update  - Mark a file as processed (updates its hash in state)
 *
 * Usage:
 *   node scripts/state.mjs check                     # List new/changed files
 *   node scripts/state.mjs update <file-path>         # Mark file as processed
 *   node scripts/state.mjs update <file1> <file2> …   # Mark multiple files
 *
 * State file: ~/.cache/fit/basecamp/state/graph_processed (TSV: path<TAB>hash)
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const STATE_FILE = join(HOME, ".cache/fit/basecamp/state/graph_processed");
const SOURCE_DIRS = [
  join(HOME, ".cache/fit/basecamp/apple_mail"),
  join(HOME, ".cache/fit/basecamp/apple_calendar"),
];

/** Compute SHA-256 hash of a file. */
function fileHash(filePath) {
  const data = readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

/** Load the state file into a Map of {path → hash}. */
function loadState() {
  const state = new Map();
  if (!existsSync(STATE_FILE)) return state;
  const text = readFileSync(STATE_FILE, "utf-8");
  for (const line of text.split("\n")) {
    if (!line) continue;
    const idx = line.indexOf("\t");
    if (idx === -1) continue;
    state.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return state;
}

/** Write the full state Map back to the state file. */
function saveState(state) {
  const dir = join(HOME, ".cache/fit/basecamp/state");
  mkdirSync(dir, { recursive: true });
  const entries = [...state.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const text = entries.length
    ? entries.map(([p, h]) => `${p}\t${h}`).join("\n") + "\n"
    : "";
  writeFileSync(STATE_FILE, text);
}

/** Find source files that are new or have changed since last processing. */
function check() {
  const state = loadState();
  const newFiles = [];
  for (const dir of SOURCE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const filePath = join(dir, name);
      const stat = statSync(filePath, { throwIfNoEntry: false });
      if (!stat || !stat.isFile()) continue;
      const h = fileHash(filePath);
      if (state.get(filePath) !== h) {
        newFiles.push(filePath);
      }
    }
  }
  newFiles.sort();
  for (const f of newFiles) {
    console.log(f);
  }
  return newFiles.length;
}

/** Mark files as processed by updating their hashes in state. */
function update(filePaths) {
  const state = loadState();
  for (const fp of filePaths) {
    if (!existsSync(fp)) {
      console.error(`Warning: File not found: ${fp}`);
      continue;
    }
    state.set(fp, fileHash(fp));
  }
  saveState(state);
  console.log(`Updated ${filePaths.length} file(s) in graph state`);
}

// --- CLI ---

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === "check") {
  const count = check();
  console.error(`\n${count} file(s) to process`);
} else if (cmd === "update" && args.length >= 2) {
  update(args.slice(1));
} else {
  console.error(
    "Usage:\n" +
    "  node scripts/state.mjs check\n" +
    "  node scripts/state.mjs update <file-path> [<file-path> …]"
  );
  process.exit(1);
}
