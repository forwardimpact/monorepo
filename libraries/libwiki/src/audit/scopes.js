import path from "node:path";
import { yearMonth } from "@forwardimpact/libutil";
import { parseClaims } from "../active-claims.js";
import { countLines, countWords } from "../budget.js";
import { parseStatusRowId } from "../status.js";
import {
  CARRY_SURFACE_H1_RE,
  CARRY_SURFACE_NAME_RE,
  PRIORITY_INDEX_HEADING,
  WEEKLY_LOG_NAME_RE,
  WEEKLY_LOG_PART_NAME_RE,
} from "../constants.js";
import { listAdmissionPaths } from "./admission.js";
import { classifyPath, rootSummaryStem } from "./grammar.js";

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

// Recursively collect every *.csv under `<wikiRoot>/metrics/`. The real layout
// is `metrics/<skill>/<year>.csv` (two levels), so the walk recurses rather
// than assuming a fixed depth. Uses readdirSync + statSync (rather than
// `withFileTypes` Dirents) so it runs unchanged under the in-memory mock fs.
function listCsvFiles(wikiRoot, fs) {
  const metricsRoot = path.join(wikiRoot, "metrics");
  if (!fs.existsSync(metricsRoot)) return [];
  const found = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".csv")) found.push(full);
    }
  };
  walk(metricsRoot);
  return found;
}

// Load a metrics CSV as an audit subject: `rows` is the array of line strings,
// so a rule indexes `rows[i]` (a string) and `i + 1` is its line number.
function loadCsv(filePath, fs) {
  return {
    path: filePath,
    rows: fs.readFileSync(filePath, "utf-8").split("\n"),
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
  const carryMatch = base.match(CARRY_SURFACE_NAME_RE);
  let agentPrefix;
  if (weekMatch) agentPrefix = weekMatch[1];
  else if (carryMatch) agentPrefix = carryMatch[1];
  else agentPrefix = base.replace(/\.md$/, "");
  return {
    path: filePath,
    text,
    fileLines,
    firstLine: fileLines.find((l) => l.trim() !== "") || "",
    h2s,
    lines: countLines(text),
    words: countWords(text),
    agentPrefix,
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
  // Carry surface: a `<agent>-carries.md` whose H1 matches the Carry H1 RE.
  // Both axes must match (filename prefix and H1), mirroring the summary
  // classifier. The two H1 REs end in distinct literals (`— Carries` vs
  // `— Summary`) so the branches cannot cross-capture regardless of order;
  // a name-match + H1-miss is left unclassified, like a malformed summary.
  if (CARRY_SURFACE_NAME_RE.test(base)) {
    if (CARRY_SURFACE_H1_RE.test(subject.firstLine)) {
      return { kind: "carry-surface", subject };
    }
    return null;
  }
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
 * outside the ``` fence (header prose) and blank lines are skipped. Each row
 * carries a `kind` from {@link parseStatusRowId} (`"spec"`, `"experiment"`, or
 * `null` for an unrecognized id); spec-shaped rules read the positional
 * `id`/`phase`/`status` fields, experiment rules read `cells`.
 * @param {string} statusText - The full STATUS.md contents.
 * @returns {Array<{lineNo: number, text: string, cells: string[], id: string, phase: string, status: string, kind: string|null}>}
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
    // Classify by id prefix so a malformed `exp:` row (e.g. wrong cell count)
    // is still routed to the experiment rules, which flag it — rather than
    // slipping through the spec-shaped rules. parseStatusRowId returns the
    // structured fields only for a well-formed row; the rules read `cells`.
    const isExp = typeof cells[0] === "string" && cells[0].startsWith("exp:");
    const parsed = parseStatusRowId(cells[0], cells);
    rows.push({
      lineNo: i + 1,
      text: line,
      cells,
      id: cells[0],
      phase: cells[1],
      status: cells[2],
      kind: isExp ? "experiment" : parsed ? parsed.kind : null,
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
  "weekly-log-main": (ctx) => ctx.subjects["weekly-log-main"],
  "weekly-log-part": (ctx) => ctx.subjects["weekly-log-part"],
  "metrics-csv": (ctx) => ctx.subjects["metrics-csv"],
  "carry-surface": (ctx) => ctx.subjects["carry-surface"],
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
  "conflict-scan": (ctx) => conflictScanSubjects(ctx),
  admission: (ctx) =>
    ctx.admission.paths
      .filter((p) => classifyPath(p, ctx.admission) === "rejected")
      .map((relPath) => ({
        path: path.join(ctx.wikiRoot, relPath),
        relPath,
      })),
};

// Normalize every audited surface into a uniform `{ path, text, fenceExempt }`
// subject for the conflict-marker scan. The per-file subjects (summaries,
// weekly logs and sealed parts, storyboard) carry `fileLines`; MEMORY.md and
// STATUS.md carry `text` (readOptional shape). `fenceExempt` is true for prose
// surfaces, where a fence quotes content, and false for STATUS.md, whose fenced
// rows are data — a marker there is never legitimate (per-surface fence
// contract). Files absent from disk (missing MEMORY/STATUS/storyboard) yield
// empty text and produce no findings.
function conflictScanSubjects(ctx) {
  const subjects = [];
  const fileScopes = ["summary", "weekly-log-main", "weekly-log-part"];
  for (const scope of fileScopes) {
    for (const s of ctx.subjects[scope]) {
      subjects.push({
        path: s.path,
        text: s.fileLines.join("\n"),
        fenceExempt: true,
      });
    }
  }
  subjects.push({
    path: ctx.storyboard.path,
    text: ctx.storyboard.text,
    fenceExempt: true,
  });
  subjects.push({
    path: ctx.memory.path,
    text: ctx.memory.text,
    fenceExempt: true,
  });
  subjects.push({
    path: ctx.status.path,
    text: ctx.status.text,
    fenceExempt: false,
  });
  return subjects;
}

/** Resolve a scope key into the list of subjects the engine should iterate. */
export function resolveScope(scopeKey, ctx) {
  const resolver = SCOPE_RESOLVERS[scopeKey];
  if (!resolver) throw new Error(`unknown scope: ${scopeKey}`);
  return resolver(ctx);
}

/**
 * Build the admission slice: the tracked-file universe plus the
 * `rootSummaryAgents` set that gates `<agent>/` sidecar directories. The agent
 * set is derived first (a root-level summary-class file's stem) so the
 * `admission` scope can classify sidecar directories against it.
 *
 * Returns the empty universe when `subprocess` is absent — callers that only
 * read `.subjects` (the rotation pre-pass) skip the git read and the tree walk
 * entirely, and produce no `admission` findings.
 */
function buildAdmission(wikiRoot, fs, subprocess) {
  if (!subprocess) return { paths: [], rootSummaryAgents: new Set() };
  const paths = listAdmissionPaths({ wikiRoot, fs, subprocess });
  const rootSummaryAgents = new Set();
  for (const p of paths) {
    if (p.includes("/")) continue; // root-level files only
    const stem = rootSummaryStem(p);
    if (stem) rootSummaryAgents.add(stem);
  }
  return { paths, rootSummaryAgents };
}

/**
 * Build the audit context: classifies and loads every wiki file once.
 * @param {{wikiRoot: string, today: string, fs: object, subprocess: object}} options
 *   `fs` is the sync filesystem surface (`runtime.fsSync`); `subprocess` is
 *   `runtime.subprocess` (its `runSync` backs the admission scope's git read).
 */
export function buildContext({ wikiRoot, today, fs, subprocess }) {
  const subjects = {
    summary: [],
    "weekly-log-main": [],
    "weekly-log-part": [],
    "metrics-csv": [],
    "carry-surface": [],
  };
  for (const file of listMdFiles(wikiRoot, fs)) {
    const classified = classifyFile(file, fs);
    if (classified) subjects[classified.kind].push(classified.subject);
  }
  for (const file of listCsvFiles(wikiRoot, fs)) {
    subjects["metrics-csv"].push(loadCsv(file, fs));
  }
  return {
    wikiRoot,
    today,
    subjects,
    memory: readOptional(path.join(wikiRoot, "MEMORY.md"), fs),
    status: readOptional(path.join(wikiRoot, "STATUS.md"), fs),
    storyboard: loadStoryboard(wikiRoot, today, fs),
    admission: buildAdmission(wikiRoot, fs, subprocess),
  };
}
