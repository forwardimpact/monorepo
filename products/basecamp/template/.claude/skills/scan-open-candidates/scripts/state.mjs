#!/usr/bin/env node
/**
 * Manage head-hunter agent state files.
 *
 * Provides atomic operations on the 5 state files used by the head-hunter agent:
 *   cursor.tsv   — source rotation state (source, last_checked, position)
 *   seen.tsv     — deduplication index (source, id, date)
 *   prospects.tsv — prospect index (name, source, date, strength, level)
 *   failures.tsv — consecutive failure counts (source, count)
 *   log.md       — append-only activity log
 *
 * Usage:
 *   node scripts/state.mjs cursor get <source>
 *   node scripts/state.mjs cursor set <source> <timestamp> <position>
 *   node scripts/state.mjs seen check <source> <id>
 *   node scripts/state.mjs seen add <source> <id> [<date>]
 *   node scripts/state.mjs prospect add <name> <source> <strength> <level>
 *   node scripts/state.mjs prospect list [--limit N]
 *   node scripts/state.mjs failure get <source>
 *   node scripts/state.mjs failure increment <source>
 *   node scripts/state.mjs failure reset <source>
 *   node scripts/state.mjs log <message>
 *   node scripts/state.mjs log-wake <source> <summary>
 *   node scripts/state.mjs summary
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const STATE_DIR = join(HOME, ".cache/fit/basecamp/head-hunter");

const PATHS = {
  cursor: join(STATE_DIR, "cursor.tsv"),
  seen: join(STATE_DIR, "seen.tsv"),
  prospects: join(STATE_DIR, "prospects.tsv"),
  failures: join(STATE_DIR, "failures.tsv"),
  log: join(STATE_DIR, "log.md"),
};

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(`state — manage head-hunter agent state

Usage:
  node scripts/state.mjs <command> [args]

Cursor commands (source rotation):
  cursor get <source>                         Get current cursor for source
  cursor set <source> <timestamp> <position>  Update cursor position
  cursor list                                 List all cursors

Seen commands (deduplication):
  seen check <source> <id>                    Check if ID was already seen (exit 0=seen, 1=new)
  seen add <source> <id> [<date>]             Mark ID as seen (date defaults to today)
  seen batch <source> <id1> <id2> ...         Mark multiple IDs as seen

Prospect commands:
  prospect add <name> <source> <strength> <level>  Add a new prospect
  prospect list [--limit N]                         List recent prospects
  prospect count                                    Count total prospects

Failure commands:
  failure get <source>                        Get failure count for source
  failure increment <source>                  Increment failure count
  failure reset <source>                      Reset failure count to 0

Log commands:
  log <message>                               Append raw text to log.md
  log-wake <source> <summary>                 Append a formatted wake cycle entry

Summary:
  summary                                     Print state overview

State dir: ~/.cache/fit/basecamp/head-hunter/`);
  process.exit(0);
}

// --- Ensure state directory exists ---

mkdirSync(STATE_DIR, { recursive: true });

// --- File helpers ---

function readTsv(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim());
}

function writeTsv(file, lines) {
  writeFileSync(file, lines.join("\n") + (lines.length ? "\n" : ""));
}

function appendTsv(file, line) {
  appendFileSync(file, line + "\n");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// --- Cursor operations ---

function cursorGet(source) {
  const lines = readTsv(PATHS.cursor);
  const line = lines.find((l) => l.startsWith(source + "\t"));
  if (!line) {
    console.log(`No cursor for source: ${source}`);
    return null;
  }
  const [, timestamp, position] = line.split("\t");
  console.log(`${source}\t${timestamp}\t${position}`);
  return { source, timestamp, position };
}

function cursorSet(source, timestamp, position) {
  const lines = readTsv(PATHS.cursor);
  const newLine = `${source}\t${timestamp}\t${position}`;
  const idx = lines.findIndex((l) => l.startsWith(source + "\t"));
  if (idx !== -1) {
    lines[idx] = newLine;
  } else {
    lines.push(newLine);
  }
  writeTsv(PATHS.cursor, lines);
  console.log(`Cursor updated: ${newLine}`);
}

function cursorList() {
  const lines = readTsv(PATHS.cursor);
  if (lines.length === 0) {
    console.log("No cursors.");
    return;
  }
  for (const line of lines) {
    console.log(line);
  }
}

// --- Seen operations ---

function seenCheck(source, id) {
  const lines = readTsv(PATHS.seen);
  const found = lines.some((l) => {
    const parts = l.split("\t");
    return parts[0] === source && parts[1] === id;
  });
  if (found) {
    console.log(`SEEN: ${source}\t${id}`);
    process.exit(0);
  } else {
    console.log(`NEW: ${source}\t${id}`);
    process.exit(1);
  }
}

function seenAdd(source, id, date) {
  appendTsv(PATHS.seen, `${source}\t${id}\t${date || today()}`);
  console.log(`Marked seen: ${source}\t${id}\t${date || today()}`);
}

function seenBatch(source, ids) {
  const d = today();
  const lines = ids.map((id) => `${source}\t${id}\t${d}`);
  appendFileSync(PATHS.seen, lines.join("\n") + "\n");
  console.log(`Marked ${ids.length} IDs as seen for ${source}`);
}

// --- Prospect operations ---

function prospectAdd(name, source, strength, level) {
  const d = today();
  appendTsv(PATHS.prospects, `${name}\t${source}\t${d}\t${strength}\t${level}`);
  console.log(`Prospect added: ${name} (${strength}, ${level})`);
}

function prospectList(limit) {
  const lines = readTsv(PATHS.prospects);
  if (lines.length === 0) {
    console.log("No prospects.");
    return;
  }
  // Show most recent first
  const display = lines.slice(-limit).reverse();
  for (const line of display) {
    console.log(line);
  }
  if (lines.length > limit) {
    console.log(`\n... ${lines.length - limit} more (${lines.length} total)`);
  }
}

function prospectCount() {
  const lines = readTsv(PATHS.prospects);
  console.log(lines.length);
}

// --- Failure operations ---

function failureGet(source) {
  const lines = readTsv(PATHS.failures);
  const line = lines.find((l) => l.startsWith(source + "\t"));
  if (!line) {
    console.log(`0`);
    return 0;
  }
  const count = parseInt(line.split("\t")[1], 10) || 0;
  console.log(`${count}`);
  return count;
}

function failureIncrement(source) {
  const lines = readTsv(PATHS.failures);
  const idx = lines.findIndex((l) => l.startsWith(source + "\t"));
  if (idx !== -1) {
    const count = parseInt(lines[idx].split("\t")[1], 10) || 0;
    lines[idx] = `${source}\t${count + 1}`;
  } else {
    lines.push(`${source}\t1`);
  }
  writeTsv(PATHS.failures, lines);
  const newCount = parseInt(
    lines.find((l) => l.startsWith(source + "\t")).split("\t")[1],
    10,
  );
  console.log(`Failures for ${source}: ${newCount}`);
  if (newCount >= 3) {
    console.log(
      `WARNING: ${source} has ${newCount} consecutive failures (suspended at ≥3)`,
    );
  }
}

function failureReset(source) {
  const lines = readTsv(PATHS.failures);
  const idx = lines.findIndex((l) => l.startsWith(source + "\t"));
  if (idx !== -1) {
    lines[idx] = `${source}\t0`;
    writeTsv(PATHS.failures, lines);
  }
  console.log(`Failures reset for ${source}`);
}

// --- Log operations ---

function logAppend(message) {
  appendFileSync(PATHS.log, message + "\n");
  console.log("Log entry appended.");
}

function logWake(source, summary) {
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = `\n## ${today()} ${timestamp.slice(11)} — Wake (${source})\n\n${summary}\n\n---\n`;
  appendFileSync(PATHS.log, entry);
  console.log(`Wake cycle logged for ${source}`);
}

// --- Summary ---

function summary() {
  const cursors = readTsv(PATHS.cursor);
  const seen = readTsv(PATHS.seen);
  const prospects = readTsv(PATHS.prospects);
  const failures = readTsv(PATHS.failures);

  console.log("=== Head-Hunter State Summary ===\n");

  console.log(`Sources: ${cursors.length}`);
  for (const line of cursors) {
    const [source, timestamp, position] = line.split("\t");
    const failLine = failures.find((l) => l.startsWith(source + "\t"));
    const failCount = failLine ? parseInt(failLine.split("\t")[1], 10) : 0;
    const status = failCount >= 3 ? " [SUSPENDED]" : "";
    console.log(`  ${source}: last=${timestamp}, pos=${position}${status}`);
  }

  console.log(`\nSeen: ${seen.length} entries`);
  console.log(`Prospects: ${prospects.length} total`);

  // Strength breakdown
  const byStrength = {};
  for (const line of prospects) {
    const strength = line.split("\t")[3] || "unknown";
    byStrength[strength] = (byStrength[strength] || 0) + 1;
  }
  for (const [k, v] of Object.entries(byStrength)) {
    console.log(`  ${k}: ${v}`);
  }

  // Recent prospects (last 5)
  if (prospects.length > 0) {
    console.log("\nRecent prospects:");
    for (const line of prospects.slice(-5)) {
      const [name, source, date, strength, level] = line.split("\t");
      console.log(
        `  ${date} | ${name} | ${strength} | ${level} | via ${source}`,
      );
    }
  }
}

// --- CLI Router ---

const cliArgs = process.argv.slice(2);
const cmd = cliArgs[0];
const sub = cliArgs[1];

switch (cmd) {
  case "cursor":
    if (sub === "get" && cliArgs[2]) cursorGet(cliArgs[2]);
    else if (sub === "set" && cliArgs[2] && cliArgs[3] && cliArgs[4])
      cursorSet(cliArgs[2], cliArgs[3], cliArgs[4]);
    else if (sub === "list") cursorList();
    else {
      console.error(
        "Usage: cursor get|set|list <source> [<timestamp> <position>]",
      );
      process.exit(1);
    }
    break;

  case "seen":
    if (sub === "check" && cliArgs[2] && cliArgs[3])
      seenCheck(cliArgs[2], cliArgs[3]);
    else if (sub === "add" && cliArgs[2] && cliArgs[3])
      seenAdd(cliArgs[2], cliArgs[3], cliArgs[4]);
    else if (sub === "batch" && cliArgs[2] && cliArgs.length > 3)
      seenBatch(cliArgs[2], cliArgs.slice(3));
    else {
      console.error("Usage: seen check|add|batch <source> <id> [...]");
      process.exit(1);
    }
    break;

  case "prospect":
    if (sub === "add" && cliArgs[2] && cliArgs[3] && cliArgs[4] && cliArgs[5])
      prospectAdd(cliArgs[2], cliArgs[3], cliArgs[4], cliArgs[5]);
    else if (sub === "list") {
      const lIdx = cliArgs.indexOf("--limit");
      const lim = lIdx !== -1 ? parseInt(cliArgs[lIdx + 1], 10) || 10 : 10;
      prospectList(lim);
    } else if (sub === "count") prospectCount();
    else {
      console.error(
        "Usage: prospect add|list|count <name> <source> <strength> <level>",
      );
      process.exit(1);
    }
    break;

  case "failure":
    if (sub === "get" && cliArgs[2]) failureGet(cliArgs[2]);
    else if (sub === "increment" && cliArgs[2]) failureIncrement(cliArgs[2]);
    else if (sub === "reset" && cliArgs[2]) failureReset(cliArgs[2]);
    else {
      console.error("Usage: failure get|increment|reset <source>");
      process.exit(1);
    }
    break;

  case "log":
    if (cliArgs.length >= 2) logAppend(cliArgs.slice(1).join(" "));
    else {
      console.error("Usage: log <message>");
      process.exit(1);
    }
    break;

  case "log-wake":
    if (cliArgs[1] && cliArgs.length >= 3)
      logWake(cliArgs[1], cliArgs.slice(2).join(" "));
    else {
      console.error("Usage: log-wake <source> <summary>");
      process.exit(1);
    }
    break;

  case "summary":
    summary();
    break;

  default:
    console.error(
      "Unknown command. Run with --help for usage.\n" +
        "Commands: cursor, seen, prospect, failure, log, log-wake, summary",
    );
    process.exit(1);
}
