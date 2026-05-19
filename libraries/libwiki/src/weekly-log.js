import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import path from "node:path";
import { WEEKLY_LOG_LINE_BUDGET } from "./constants.js";

/** Compute ISO 8601 year-week for a Date. Returns { year, week } where year is the ISO week-year (not necessarily the calendar year for edge weeks). */
export function isoWeek(date) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // Thursday of week: ISO weeks are anchored on Thursday.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function formatIsoWeek(date) {
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Return the path of the current weekly log file for an agent. */
export function weeklyLogPath(wikiRoot, agent, today) {
  const date = today instanceof Date ? today : new Date(today);
  return path.join(wikiRoot, `${agent}-${formatIsoWeek(date)}.md`);
}

function countLines(text) {
  if (text.length === 0) return 0;
  let n = 0;
  for (const ch of text) if (ch === "\n") n++;
  if (!text.endsWith("\n")) n++;
  return n;
}

function nextPartPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ".md");
  let n = 1;
  while (existsSync(path.join(dir, `${base}-part${n}.md`))) n++;
  return path.join(dir, `${base}-part${n}.md`);
}

function agentTitle(agent) {
  return agent
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function defaultH1(filePath, agent, isoWeekStr) {
  return `# ${agentTitle(agent)} — ${isoWeekStr}\n`;
}

/** Rotate the current weekly log if next append would exceed the budget. Returns { rotated, fromPath, toPath }. */
export function rotateIfOverBudget(
  wikiRoot,
  agent,
  today,
  appendLines = 0,
  options = {},
) {
  const filePath = weeklyLogPath(wikiRoot, agent, today);
  const { force = false } = options;
  if (!existsSync(filePath)) return { rotated: false, fromPath: filePath };
  const text = readFileSync(filePath, "utf-8");
  const current = countLines(text);
  if (!force && current + appendLines <= WEEKLY_LOG_LINE_BUDGET) {
    return { rotated: false, fromPath: filePath };
  }
  const toPath = nextPartPath(filePath);
  renameSync(filePath, toPath);
  const date = today instanceof Date ? today : new Date(today);
  writeFileSync(filePath, defaultH1(filePath, agent, formatIsoWeek(date)));
  return { rotated: true, fromPath: filePath, toPath };
}

/** Append a body to a weekly log file. Creates it with an H1 if missing. */
export function appendEntry(filePath, body, agent, today) {
  const date = today instanceof Date ? today : new Date(today);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, defaultH1(filePath, agent, formatIsoWeek(date)));
  }
  const text = readFileSync(filePath, "utf-8");
  const separator = text.endsWith("\n") ? "\n" : "\n\n";
  writeFileSync(
    filePath,
    text + separator + body + (body.endsWith("\n") ? "" : "\n"),
  );
}
