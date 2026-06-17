import path from "node:path";
import { yearMonth } from "@forwardimpact/libutil";
import { parseClaims } from "../active-claims.js";
import { countLines, countWords } from "../budget.js";
import {
  INBOX_HEADING,
  PRIORITY_INDEX_HEADING,
  WEEKLY_LOG_NAME_RE,
  WEEKLY_LOG_PART_NAME_RE,
} from "../constants.js";

// Capture the agent-title group so the same regex both classifies a file
// (`.test`) and yields the title for the agent-prefix audit (`.match[1]`).
export const SUMMARY_H1_RE = /^# ([A-Z].*) — Summary$/;
export const WEEKLY_LOG_H1_RE =
  /^# (.*) — \d{4}-W\d{2}(?: \(part \d+ of \d+\))?$/;
export const PRIORITY_HEADER_RE =
  /^\|\s*Item\s*\|\s*Agents\s*\|\s*Owner\s*\|\s*Status\s*\|\s*Added\s*\|/m;

const EXCLUDED_BASES = new Set(["MEMORY.md", "Home.md"]);
const NON_SUMMARY_PREFIXES = [
  "storyboard-",
  "downstream-",
  "memory-protocol-",
  "kata-interview-",
  "fit-trace-",
];

function listMdFiles(wikiRoot, fs) {
  if (!fs.existsSync(wikiRoot)) return [];
  return fs
    .readdirSync(wikiRoot)
    .filter((e) => e.endsWith(".md"))
    .map((e) => path.join(wikiRoot, e));
}

/**
 * Partition a summary's lines into its Message Inbox region and its body. The
 * inbox span runs from the first `INBOX_HEADING` line through the line before
 * the next `## ` heading (or end of file when none follows); every other line
 * is body. A file with no `INBOX_HEADING` line has an empty inbox and a
 * whole-file body, so heading-less, renamed-heading, and not-first-H2 summaries
 * are fully measured by the body budgets. The two line arrays concatenate back
 * to `fileLines` in order, so the partition covers the file once with no gap or
 * overlap.
 *
 * @param {string[]} fileLines - The file split on "\n".
 * @returns {{ inboxLines: string[], bodyLines: string[] }} The partitioned
 *   content lines; their lengths sum to the whole-file line count.
 */
export function partitionInbox(fileLines) {
  // Drop a single trailing empty element (the file's final newline) so the
  // body and inbox line counts partition the content lines exactly, then sum to
  // the same count the whole-file `countLines` reports.
  const content =
    fileLines.length > 0 && fileLines[fileLines.length - 1] === ""
      ? fileLines.slice(0, -1)
      : fileLines;
  const start = content.findIndex((l) => l === INBOX_HEADING);
  if (start === -1) {
    return { inboxLines: [], bodyLines: content };
  }
  let end = content.length;
  for (let i = start + 1; i < content.length; i++) {
    if (/^## /.test(content[i])) {
      end = i;
      break;
    }
  }
  return {
    inboxLines: content.slice(start, end),
    bodyLines: [...content.slice(0, start), ...content.slice(end)],
  };
}

function loadFile(filePath, fs) {
  const text = fs.readFileSync(filePath, "utf-8");
  const fileLines = text.split("\n");
  const h2s = [];
  for (const line of fileLines) {
    const m = line.match(/^## (.+)$/);
    if (m) h2s.push(m[1].trim());
  }
  const base = path.basename(filePath);
  const weekMatch =
    base.match(WEEKLY_LOG_NAME_RE) || base.match(WEEKLY_LOG_PART_NAME_RE);
  const { inboxLines, bodyLines } = partitionInbox(fileLines);
  return {
    path: filePath,
    text,
    fileLines,
    firstLine: fileLines.find((l) => l.trim() !== "") || "",
    h2s,
    lines: countLines(text),
    words: countWords(text),
    // Body and inbox counts back the summary-body and inbox-region budgets
    // respectively; a heading-less file routes all content to the body. Line
    // counts are the partitioned content-line counts (they sum to the
    // whole-file `lines`); word counts use the shared counter on each span.
    bodyLines: bodyLines.length,
    bodyWords: countWords(bodyLines.join("\n")),
    inboxLines: inboxLines.length,
    inboxWords: countWords(inboxLines.join("\n")),
    agentPrefix: weekMatch ? weekMatch[1] : base.replace(/\.md$/, ""),
  };
}

function classifyFile(filePath, fs) {
  const base = path.basename(filePath);
  if (EXCLUDED_BASES.has(base)) return null;
  // STATUS.md is loaded separately (readOptional in buildContext) and audited
  // via the dedicated `status-row` scope — skip the per-file classification.
  if (base === "STATUS.md") return null;
  if (NON_SUMMARY_PREFIXES.some((p) => base.startsWith(p))) return null;
  if (WEEKLY_LOG_NAME_RE.test(base)) {
    return { kind: "weekly-log-main", subject: loadFile(filePath, fs) };
  }
  if (WEEKLY_LOG_PART_NAME_RE.test(base)) {
    return { kind: "weekly-log-part", subject: loadFile(filePath, fs) };
  }
  const subject = loadFile(filePath, fs);
  // Files that do not match a summary or weekly-log shape are left
  // unclassified: stray files are not audited.
  if (!SUMMARY_H1_RE.test(subject.firstLine)) return null;
  return { kind: "summary", subject };
}

// Read a file if present; an absent file yields empty text so callers audit
// "missing" uniformly. The common { path, text, exists } shape backs the
// MEMORY.md, STATUS.md, and storyboard context loads.
function readOptional(filePath, fs) {
  const exists = fs.existsSync(filePath);
  return {
    path: filePath,
    text: exists ? fs.readFileSync(filePath, "utf-8") : "",
    exists,
  };
}

/**
 * Parse the rows inside STATUS.md's fenced block into audit subjects. Lines
 * outside the ``` fence (header prose) and blank lines are skipped.
 * @param {string} statusText - The full STATUS.md contents.
 * @returns {Array<{lineNo: number, text: string, cells: string[], id: string, phase: string, status: string}>}
 */
function parseStatusRows(statusText) {
  const lines = statusText.split("\n");
  const rows = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence || line.trim() === "") continue;
    const cells = line.split("\t");
    rows.push({
      lineNo: i + 1,
      text: line,
      cells,
      id: cells[0],
      phase: cells[1],
      status: cells[2],
    });
  }
  return rows;
}

function loadStoryboard(wikiRoot, today, fs) {
  const ym = yearMonth(today);
  const base = readOptional(path.join(wikiRoot, `storyboard-${ym}.md`), fs);
  return {
    ...base,
    fileLines: base.text.split("\n"),
    yearMonth: ym,
    lines: countLines(base.text),
    words: countWords(base.text),
  };
}

function priorityTableBounds(lines) {
  const start = lines.findIndex((l) => l.trim() === PRIORITY_INDEX_HEADING);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function parseTableRow(line, lineNo) {
  const cells = line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  if (cells.length === 0 || cells[0] === "*None*") return null;
  return { path: null, lineNo, cells };
}

function parsePriorityRows(memoryText) {
  const lines = memoryText.split("\n");
  const bounds = priorityTableBounds(lines);
  if (bounds === null) return [];
  const rows = [];
  let inTable = false;
  let seenSep = false;
  for (let i = bounds.start + 1; i < bounds.end; i++) {
    const line = lines[i];
    if (PRIORITY_HEADER_RE.test(line)) {
      inTable = true;
    } else if (inTable && /^\|\s*---/.test(line)) {
      seenSep = true;
    } else if (inTable && seenSep && line.startsWith("|")) {
      const row = parseTableRow(line, i + 1);
      if (row) rows.push(row);
    }
  }
  return rows;
}

const SCOPE_RESOLVERS = {
  summary: (ctx) => ctx.subjects.summary,
  // The inbox scope iterates the same summary subjects; a summary with no
  // inbox region reads zero inbox words/lines, which never breaches, so a
  // summary cannot escape the inbox bound by dropping the heading.
  inbox: (ctx) => ctx.subjects.summary,
  "weekly-log-main": (ctx) => ctx.subjects["weekly-log-main"],
  "weekly-log-part": (ctx) => ctx.subjects["weekly-log-part"],
  memory: (ctx) => [ctx.memory],
  "claims-row": (ctx) =>
    parseClaims(ctx.memory.text).map((c) => ({ ...c, path: ctx.memory.path })),
  "priority-row": (ctx) =>
    parsePriorityRows(ctx.memory.text).map((r) => ({
      ...r,
      path: ctx.memory.path,
    })),
  storyboard: (ctx) => [ctx.storyboard],
  "status-row": (ctx) =>
    parseStatusRows(ctx.status.text).map((r) => ({
      ...r,
      path: ctx.status.path,
    })),
};

/** Resolve a scope key into the list of subjects the engine should iterate. */
export function resolveScope(scopeKey, ctx) {
  const resolver = SCOPE_RESOLVERS[scopeKey];
  if (!resolver) throw new Error(`unknown scope: ${scopeKey}`);
  return resolver(ctx);
}

/**
 * Build the audit context: classifies and loads every wiki file once.
 * @param {{wikiRoot: string, today: string, fs: object}} options
 *   `fs` is the sync filesystem surface (`runtime.fsSync`).
 */
export function buildContext({ wikiRoot, today, fs }) {
  const subjects = {
    summary: [],
    "weekly-log-main": [],
    "weekly-log-part": [],
  };
  for (const file of listMdFiles(wikiRoot, fs)) {
    const classified = classifyFile(file, fs);
    if (classified) subjects[classified.kind].push(classified.subject);
  }
  return {
    wikiRoot,
    today,
    subjects,
    memory: readOptional(path.join(wikiRoot, "MEMORY.md"), fs),
    status: readOptional(path.join(wikiRoot, "STATUS.md"), fs),
    storyboard: loadStoryboard(wikiRoot, today, fs),
  };
}
