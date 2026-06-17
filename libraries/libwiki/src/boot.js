import path from "node:path";
import { yearMonth } from "@forwardimpact/libutil";
import { parseClaims, filterExpired } from "./active-claims.js";
import { countLines, countWords } from "./budget.js";
import {
  AGENT_EXPERIMENTS_CLOSE_RE,
  AGENT_EXPERIMENTS_OPEN_RE,
  AGENT_EXPERIMENT_ITEM_RE,
  MEMO_INBOX_MARKER,
  PRIORITY_INDEX_HEADING,
  SUMMARY_LINE_BUDGET,
  SUMMARY_WORD_BUDGET,
  WEEKLY_LOG_LINE_BUDGET,
  WEEKLY_LOG_WORD_BUDGET,
} from "./constants.js";
import { weeklyLogPath } from "./weekly-log.js";

const STANDING_CARRIES_HEADING = "## Standing Carries";

function readIfExists(fs, filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

function currentStoryboardPath(wikiRoot, today) {
  return path.join(wikiRoot, `storyboard-${yearMonth(today)}.md`);
}

function extractSummary(text) {
  if (!text) return "";
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].startsWith("#")) i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  const paragraph = [];
  while (i < lines.length && lines[i].trim() !== "") {
    paragraph.push(lines[i]);
    i++;
  }
  return paragraph.join(" ").trim();
}

function parsePriorityRow(line) {
  const cells = line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  if (cells.length < 5) return null;
  const [item, agents, owner, status, added] = cells;
  if (item === "*None*") return null;
  return { item, agents, owner, status, added, link: null };
}

function findHeading(lines, heading) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === heading) return i;
  }
  return -1;
}

function findSectionEnd(lines, start) {
  for (let i = start; i < lines.length; i++) {
    if (/^## /.test(lines[i])) return i;
  }
  return lines.length;
}

function parsePriorityTable(text) {
  if (!text) return [];
  const lines = text.split("\n");
  const start = findHeading(lines, PRIORITY_INDEX_HEADING);
  if (start === -1) return [];
  const end = findSectionEnd(lines, start + 1);
  const rows = [];
  let inTable = false;
  let seenSep = false;
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (/^\|\s*Item\s*\|/.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && /^\|\s*---/.test(line)) {
      seenSep = true;
      continue;
    }
    if (!(inTable && seenSep && line.startsWith("|"))) continue;
    const row = parsePriorityRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

function splitPriorities(rows, agent) {
  const owned = [];
  const cross = [];
  for (const r of rows) {
    if (r.owner === agent) owned.push(r);
    else cross.push(r);
  }
  return { owned, cross };
}

// Parse an attributed item line from the materialized block for `agent`.
// Returns the unified item shape or null (wrong agent / not an item line).
function parseBlockItem(line, agent) {
  const m = line.match(AGENT_EXPERIMENT_ITEM_RE);
  if (!m || m[2] !== agent) return null;
  return {
    dim: agent,
    threshold: m[3],
    status: "open",
    link: null,
    issue: Number(m[1]),
    author: m[4],
    source: "experiment",
  };
}

function bulletItem(threshold, agent) {
  return {
    dim: agent,
    threshold,
    status: "open",
    link: null,
    issue: null,
    author: null,
    source: "bullet",
  };
}

// Advance the agent-section scan for one storyboard line that is NOT inside the
// materialized block. Returns the next `inAgent` state and pushes an h3-bullet
// item for the booting agent when one is found. An h2 ends the agent-section
// scan (team-wide sections follow the last agent h3 — without this the scan
// would run past the agent sections and misattribute team-wide bullets).
function scanAgentLine(line, agent, inAgent, items) {
  if (/^## /.test(line)) return false;
  const h3Match = line.match(/^### (.+)$/);
  if (h3Match) {
    return h3Match[1].toLowerCase().startsWith(agent.toLowerCase());
  }
  const bullet = inAgent && line.match(/^[-*]\s+(.+)$/);
  if (bullet) items.push(bulletItem(bullet[1], agent));
  return inAgent;
}

function parseStoryboardItems(text, agent) {
  if (!text) return [];
  const items = [];
  let inAgent = false;
  let inBlock = false;
  for (const line of text.split("\n")) {
    // The materialized block carries `- #N [agent] …` bullets that the agent
    // scan must never capture; track it so the bullet loop skips inside it.
    // (Without it the legacy scan double-counted these as the last agent's bullets.)
    if (AGENT_EXPERIMENTS_OPEN_RE.test(line)) {
      inBlock = true;
      inAgent = false;
    } else if (AGENT_EXPERIMENTS_CLOSE_RE.test(line)) {
      inBlock = false;
    } else if (inBlock) {
      const item = parseBlockItem(line, agent);
      if (item) items.push(item);
    } else {
      inAgent = scanAgentLine(line, agent, inAgent, items);
    }
  }
  return items;
}

function extractStandingCarries(text) {
  if (!text) return [];
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === STANDING_CARRIES_HEADING);
  if (start === -1) return [];
  const carries = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^## /.test(line)) break;
    const bullet = line.match(/^[-*] (.*)$/);
    if (bullet) carries.push(bullet[1]);
  }
  return carries;
}

function countInbox(text) {
  if (!text) return 0;
  const lines = text.split("\n");
  const markerIdx = lines.findIndex((l) => l.trim() === MEMO_INBOX_MARKER);
  if (markerIdx === -1) return 0;
  let n = 0;
  for (let i = markerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (/^##\s/.test(line)) break;
    if (!line.startsWith("-")) continue;
    if (/\*No new messages\.\*/.test(line)) continue;
    n++;
  }
  return n;
}

/**
 * Remaining budget for a budgeted surface: current value, cap, and headroom for
 * both the line and word budget. An absent file (empty text) reports zero usage
 * and full headroom so a writer sees the ceiling before composing.
 */
function headroom(text, lineCap, wordCap) {
  const lines = countLines(text);
  const words = countWords(text);
  return {
    words,
    lines,
    word_cap: wordCap,
    line_cap: lineCap,
    words_remaining: wordCap - words,
    lines_remaining: lineCap - lines,
  };
}

function mapPriority(r) {
  return { item: r.item, status: r.status, added: r.added, link: r.link };
}

function mapClaim(c) {
  return {
    agent: c.agent,
    target: c.target,
    branch: c.branch,
    pr: c.pr,
    claimed_at: c.claimed_at,
    expires_at: c.expires_at,
  };
}

/**
 * Build the boot digest JSON object.
 * @param {{wikiRoot: string, agent: string, today: string, fs: object}} options
 *   `fs` is the sync filesystem surface (`runtime.fsSync`); `today` is an ISO
 *   date string.
 */
export function buildDigest({ wikiRoot, agent, today, fs }) {
  const summaryPath = path.join(wikiRoot, `${agent}.md`);
  const memoryPath = path.join(wikiRoot, "MEMORY.md");
  const storyboardPath = currentStoryboardPath(wikiRoot, today);

  const summaryText = readIfExists(fs, summaryPath);
  const memoryText = readIfExists(fs, memoryPath);
  const storyboardText = readIfExists(fs, storyboardPath);
  const weeklyLogText = readIfExists(fs, weeklyLogPath(wikiRoot, agent, today));

  const { active } = filterExpired(parseClaims(memoryText ?? ""), today);
  const { owned, cross } = splitPriorities(
    parsePriorityTable(memoryText ?? ""),
    agent,
  );

  return {
    summary: extractSummary(summaryText),
    owned_priorities: owned.map(mapPriority),
    cross_cutting: cross.map(mapPriority),
    claims: active.map(mapClaim),
    storyboard_items: parseStoryboardItems(storyboardText ?? "", agent),
    standing_carries: extractStandingCarries(summaryText),
    inbox_count: countInbox(summaryText),
    summary_headroom: headroom(
      summaryText ?? "",
      SUMMARY_LINE_BUDGET,
      SUMMARY_WORD_BUDGET,
    ),
    weekly_log_headroom: headroom(
      weeklyLogText ?? "",
      WEEKLY_LOG_LINE_BUDGET,
      WEEKLY_LOG_WORD_BUDGET,
    ),
    storyboard_path: fs.existsSync(storyboardPath)
      ? path.relative(path.dirname(wikiRoot) || ".", storyboardPath)
      : "",
  };
}
