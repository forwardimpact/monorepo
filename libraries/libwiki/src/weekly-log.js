import path from "node:path";
import { isoWeekString } from "@forwardimpact/libutil";
import { WEEKLY_LOG_LINE_BUDGET } from "./constants.js";

// ISO week computation lives in libutil's calendar util (the one place a
// `new Date` is allowed); re-exported here for the existing public surface.
export { isoWeek } from "@forwardimpact/libutil";

/** Return the path of the current weekly log file for an agent. */
export function weeklyLogPath(wikiRoot, agent, today) {
  return path.join(wikiRoot, `${agent}-${isoWeekString(today)}.md`);
}

function countLines(text) {
  if (text.length === 0) return 0;
  let n = 0;
  for (const ch of text) if (ch === "\n") n++;
  if (!text.endsWith("\n")) n++;
  return n;
}

function nextPartPath(filePath, fs) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ".md");
  let n = 1;
  while (fs.existsSync(path.join(dir, `${base}-part${n}.md`))) n++;
  return path.join(dir, `${base}-part${n}.md`);
}

function agentTitle(agent) {
  return agent
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function defaultH1(agent, isoWeekStr) {
  return `# ${agentTitle(agent)} — ${isoWeekStr}\n`;
}

/**
 * Rotate the current weekly log if next append would exceed the budget.
 * @returns {{rotated: boolean, fromPath: string, toPath?: string}}
 * @param {string} wikiRoot
 * @param {string} agent
 * @param {string} today - ISO date string.
 * @param {number} [appendLines=0]
 * @param {{force?: boolean}} [options]
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 */
export function rotateIfOverBudget(
  wikiRoot,
  agent,
  today,
  appendLines = 0,
  options = {},
  fs,
) {
  const filePath = weeklyLogPath(wikiRoot, agent, today);
  const { force = false } = options;
  if (!fs.existsSync(filePath)) return { rotated: false, fromPath: filePath };
  const text = fs.readFileSync(filePath, "utf-8");
  const current = countLines(text);
  if (!force && current + appendLines <= WEEKLY_LOG_LINE_BUDGET) {
    return { rotated: false, fromPath: filePath };
  }
  const toPath = nextPartPath(filePath, fs);
  fs.renameSync(filePath, toPath);
  fs.writeFileSync(filePath, defaultH1(agent, isoWeekString(today)));
  return { rotated: true, fromPath: filePath, toPath };
}

/**
 * Append a body to a weekly log file. Creates it with an H1 if missing.
 * @param {string} filePath
 * @param {string} body
 * @param {string} agent
 * @param {string} today - ISO date string.
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 */
export function appendEntry(filePath, body, agent, today, fs) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultH1(agent, isoWeekString(today)));
  }
  const text = fs.readFileSync(filePath, "utf-8");
  const separator = text.endsWith("\n") ? "\n" : "\n\n";
  fs.writeFileSync(
    filePath,
    text + separator + body + (body.endsWith("\n") ? "" : "\n"),
  );
}
