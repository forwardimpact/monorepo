import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseClaims } from "../active-claims.js";
import { PRIORITY_INDEX_HEADING } from "../constants.js";

const SUMMARY_H1_RE = /^# [A-Z].* — Summary$/;
const WEEKLY_LOG_NAME_RE = /^([a-z][a-z-]*)-(\d{4})-W(\d{2})\.md$/;
const WEEKLY_LOG_PART_NAME_RE = /^([a-z][a-z-]*)-(\d{4})-W(\d{2})-part\d+\.md$/;
export const WEEKLY_LOG_H1_RE =
  /^# .* — \d{4}-W\d{2}(?: \(part \d+ of \d+\))?$/;
export const PRIORITY_HEADER_RE =
  /^\|\s*Item\s*\|\s*Agents\s*\|\s*Owner\s*\|\s*Status\s*\|\s*Added\s*\|/m;

const EXCLUDED_BASES = new Set(["MEMORY.md", "Home.md", "STATUS.md"]);
const NON_SUMMARY_PREFIXES = [
  "storyboard-",
  "downstream-",
  "memory-protocol-",
  "kata-interview-",
  "fit-trace-",
];

function listMdFiles(wikiRoot) {
  if (!existsSync(wikiRoot)) return [];
  return readdirSync(wikiRoot)
    .filter((e) => e.endsWith(".md"))
    .map((e) => path.join(wikiRoot, e));
}

function countLines(text) {
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function countWords(text) {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const isWs = c === 32 || c === 9 || c === 10 || c === 13;
    if (isWs) inWord = false;
    else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

function loadFile(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const fileLines = text.split("\n");
  const h2s = [];
  for (const line of fileLines) {
    const m = line.match(/^## (.+)$/);
    if (m) h2s.push(m[1].trim());
  }
  const base = path.basename(filePath);
  const weekMatch =
    base.match(WEEKLY_LOG_NAME_RE) || base.match(WEEKLY_LOG_PART_NAME_RE);
  return {
    path: filePath,
    text,
    fileLines,
    firstLine: fileLines.find((l) => l.trim() !== "") || "",
    h2s,
    lines: countLines(text),
    words: countWords(text),
    agentPrefix: weekMatch ? weekMatch[1] : base.replace(/\.md$/, ""),
  };
}

function classifyFile(filePath) {
  const base = path.basename(filePath);
  if (EXCLUDED_BASES.has(base)) return null;
  if (NON_SUMMARY_PREFIXES.some((p) => base.startsWith(p))) return null;
  if (WEEKLY_LOG_NAME_RE.test(base)) {
    return { kind: "weekly-log-main", subject: loadFile(filePath) };
  }
  if (WEEKLY_LOG_PART_NAME_RE.test(base)) {
    return { kind: "weekly-log-part", subject: loadFile(filePath) };
  }
  const subject = loadFile(filePath);
  const kind = SUMMARY_H1_RE.test(subject.firstLine) ? "summary" : "stray";
  return { kind, subject };
}

function loadMemory(wikiRoot) {
  const filePath = path.join(wikiRoot, "MEMORY.md");
  const exists = existsSync(filePath);
  return {
    path: filePath,
    text: exists ? readFileSync(filePath, "utf-8") : "",
    exists,
  };
}

function loadStoryboard(wikiRoot, today) {
  const date = new Date(today);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const filePath = path.join(wikiRoot, `storyboard-${yyyy}-M${mm}.md`);
  const exists = existsSync(filePath);
  const text = exists ? readFileSync(filePath, "utf-8") : "";
  return {
    path: filePath,
    text,
    fileLines: text.split("\n"),
    exists,
    yearMonth: `${yyyy}-M${mm}`,
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
  "weekly-log-main": (ctx) => ctx.subjects["weekly-log-main"],
  "weekly-log-part": (ctx) => ctx.subjects["weekly-log-part"],
  memory: (ctx) => [ctx.memory],
  "claims-row": (ctx) =>
    parseClaims(ctx.memory.text).map((c) => ({ path: null, ...c })),
  "priority-row": (ctx) => parsePriorityRows(ctx.memory.text),
  storyboard: (ctx) => [ctx.storyboard],
  "stray-file": (ctx) => ctx.subjects.stray,
};

/** Resolve a scope key into the list of subjects the engine should iterate. */
export function resolveScope(scopeKey, ctx) {
  const resolver = SCOPE_RESOLVERS[scopeKey];
  if (!resolver) throw new Error(`unknown scope: ${scopeKey}`);
  return resolver(ctx);
}

/** Build the audit context: classifies and loads every wiki file once. */
export function buildContext({ wikiRoot, today }) {
  const subjects = {
    summary: [],
    "weekly-log-main": [],
    "weekly-log-part": [],
    stray: [],
  };
  for (const file of listMdFiles(wikiRoot)) {
    const classified = classifyFile(file);
    if (classified) subjects[classified.kind].push(classified.subject);
  }
  return {
    wikiRoot,
    today,
    subjects,
    memory: loadMemory(wikiRoot),
    storyboard: loadStoryboard(wikiRoot, today),
  };
}
