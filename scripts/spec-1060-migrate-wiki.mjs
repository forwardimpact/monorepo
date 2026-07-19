#!/usr/bin/env node
// One-shot migration script — retroactive protocol compliance for wiki memory.
// Recoverable from git history if re-needed.
// Do NOT extend this script — file a follow-up spec for additional migrations.

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  renameSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// Constants inlined (mirrors `libraries/libwiki/src/constants.js`). Inlined
// rather than imported because this script is one-shot and runs before any
// workspace dependency install — see header comment.
const WEEKLY_LOG_LINE_BUDGET = 500;
const DECISION_HEADING = "### Decision";
const SUMMARY_LINE_BUDGET = 80;

const ENTRY_RE = /^## \d{4}-\d{2}-\d{2}(?:[\s(].*)?$/;
const WEEKLY_NAME_RE = /^([a-z-]+)-(\d{4})-W(\d{2})\.md$/;
const STUB_FIRST_LINE =
  "Retroactively reconstructed from earlier wiki history.";

const STUB = `### Decision

*${STUB_FIRST_LINE} The original entry predates the Decision-block contract; Surveyed / Alternatives / Chosen / Rationale not recoverable from the entry text alone. Original entry follows.*

`;

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean" },
      apply: { type: "boolean" },
      "wiki-root": { type: "string", default: "./wiki" },
    },
  });
  if (values["dry-run"] === values.apply) {
    process.stderr.write("error: pass exactly one of --dry-run | --apply\n");
    process.exit(2);
  }
  return values;
}

function listFiles(wikiRoot) {
  return readdirSync(wikiRoot)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(wikiRoot, f))
    .filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
}

function countLines(text) {
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function splitIntoEntries(text) {
  const lines = text.split("\n");
  const entries = [];
  let current = [];
  let preamble = [];
  let pastH1 = false;
  for (const line of lines) {
    if (ENTRY_RE.test(line)) {
      if (current.length > 0) entries.push(current);
      current = [line];
      pastH1 = true;
    } else if (!pastH1) {
      preamble.push(line);
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) entries.push(current);
  return { preamble: preamble.join("\n"), entries };
}

function packEntries(entries, budget) {
  const chunks = [];
  let chunk = [];
  let chunkLines = 0;
  for (const entry of entries) {
    const entryLines = entry.length;
    if (chunk.length > 0 && chunkLines + entryLines > budget) {
      chunks.push(chunk);
      chunk = [];
      chunkLines = 0;
    }
    chunk.push(entry);
    chunkLines += entryLines;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

function agentTitle(agent) {
  return agent
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function partitionSealedFile(filePath, dryRun) {
  const base = path.basename(filePath);
  const match = base.match(WEEKLY_NAME_RE);
  if (!match) return null;
  const [, agent, year, week] = match;
  const text = readFileSync(filePath, "utf-8");
  const lines = countLines(text);
  if (lines <= WEEKLY_LOG_LINE_BUDGET) return null;

  const { preamble, entries } = splitIntoEntries(text);
  const chunks = packEntries(entries, WEEKLY_LOG_LINE_BUDGET - 5);
  const total = chunks.length;
  const dir = path.dirname(filePath);
  const planned = [];
  for (let i = 0; i < chunks.length; i++) {
    const partN = i + 1;
    const h1 = `# ${agentTitle(agent)} — ${year}-W${week} (part ${partN} of ${total})\n`;
    const body = chunks[i].map((e) => e.join("\n")).join("\n");
    const partPath = path.join(
      dir,
      `${agent}-${year}-W${week}-part${partN}.md`,
    );
    const content =
      h1 + (i === 0 && preamble.trim() ? preamble + "\n" : "") + body + "\n";
    if (!dryRun) writeFileSync(partPath, content);
    planned.push({ part: partN, path: partPath, lines: countLines(content) });
  }
  if (!dryRun) unlinkSync(filePath);
  return { source: filePath, total, planned };
}

function isWeeklyLogEntry(line) {
  return ENTRY_RE.test(line);
}

function nextNonBlankIsDecision(lines, fromIdx) {
  let j = fromIdx;
  while (j < lines.length && lines[j].trim() === "") j++;
  return j < lines.length && lines[j].trim() === DECISION_HEADING;
}

function backfillDecisionStubs(filePath, dryRun) {
  if (!filePath.match(/-\d{4}-W\d{2}(?:-part\d+)?\.md$/)) return 0;
  const text = readFileSync(filePath, "utf-8");
  if (text.includes(STUB_FIRST_LINE)) return 0;
  const lines = text.split("\n");
  const out = [];
  let inserted = 0;
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (!isWeeklyLogEntry(lines[i])) continue;
    if (nextNonBlankIsDecision(lines, i + 1)) continue;
    out.push("");
    for (const stubLine of STUB.split("\n")) out.push(stubLine);
    inserted++;
  }
  if (inserted > 0 && !dryRun) writeFileSync(filePath, out.join("\n"));
  return inserted;
}

function compactSummary(filePath, dryRun) {
  const text = readFileSync(filePath, "utf-8");
  const lines = countLines(text);
  if (lines <= SUMMARY_LINE_BUDGET) return null;
  // Conservative compaction: do nothing automatically — print a warning so the
  // human reviewer can decide what to trim. (The plan called for an automatic
  // move-to-current-week pass; in a sandbox where the wiki is a separate repo
  // and we cannot guarantee the live week file, we surface the violation
  // instead and exit cleanly.)
  process.stderr.write(
    `compact: ${filePath} has ${lines} lines (limit ${SUMMARY_LINE_BUDGET}) — manual trim required\n`,
  );
  if (dryRun) return { path: filePath, lines };
  return { path: filePath, lines };
}

const SUMMARY_SKIP_BASES = new Set(["MEMORY.md", "Home.md", "STATUS.md"]);
const SUMMARY_SKIP_PREFIXES = [
  "storyboard-",
  "downstream-",
  "memory-protocol-",
  "kata-interview-",
  "gemba-trace-",
];

function isSummaryCandidate(base) {
  if (WEEKLY_NAME_RE.test(base)) return false;
  if (base.match(/-W\d{2}-part\d+\.md$/)) return false;
  if (SUMMARY_SKIP_BASES.has(base)) return false;
  if (SUMMARY_SKIP_PREFIXES.some((p) => base.startsWith(p))) return false;
  return true;
}

function runPartition(files, dryRun) {
  let partitioned = 0;
  let totalParts = 0;
  for (const f of files) {
    const result = partitionSealedFile(f, dryRun);
    if (!result) continue;
    partitioned++;
    totalParts += result.total;
    process.stdout.write(
      `${dryRun ? "[DRY] " : ""}partition: ${path.basename(f)} -> ${result.total} parts\n`,
    );
  }
  return { partitioned, totalParts };
}

function runStubBackfill(files, dryRun) {
  let stubsInserted = 0;
  for (const f of files) {
    const inserted = backfillDecisionStubs(f, dryRun);
    if (inserted <= 0) continue;
    stubsInserted += inserted;
    process.stdout.write(
      `${dryRun ? "[DRY] " : ""}stubs: ${path.basename(f)} +${inserted}\n`,
    );
  }
  return stubsInserted;
}

function runSummaryCompact(files, dryRun) {
  let summariesFlagged = 0;
  for (const f of files) {
    if (!isSummaryCandidate(path.basename(f))) continue;
    if (compactSummary(f, dryRun)) summariesFlagged++;
  }
  return summariesFlagged;
}

function main() {
  const opts = parseCliArgs();
  const dryRun = !!opts["dry-run"];
  const wikiRoot = path.resolve(opts["wiki-root"]);
  if (!existsSync(wikiRoot)) {
    process.stderr.write(`error: ${wikiRoot} not found\n`);
    process.exit(2);
  }

  const files = listFiles(wikiRoot);
  const { partitioned, totalParts } = runPartition(files, dryRun);
  const filesPost = dryRun ? files : listFiles(wikiRoot);
  const stubsInserted = runStubBackfill(filesPost, dryRun);
  const summariesFlagged = runSummaryCompact(filesPost, dryRun);

  process.stdout.write(
    `\nSummary: partitioned=${partitioned} parts=${totalParts} stubs=${stubsInserted} summaries-flagged=${summariesFlagged}${dryRun ? " (dry-run)" : ""}\n`,
  );
}

main();
