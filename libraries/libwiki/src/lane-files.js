import path from "node:path";
import { WEEKLY_LOG_NAME_RE, WEEKLY_LOG_PART_NAME_RE } from "./constants.js";

const METRICS_CSV_RE = /^metrics\/[^/]+\/\d{4}\.csv$/;

/**
 * Whether a wiki-root-relative path is one of the lane's own files: the
 * agent's summary (`<agent>.md`), a weekly log or sealed part
 * (`<agent>-YYYY-Www.md`, `<agent>-YYYY-Www-partN.md`, matched on the captured
 * agent token), or a metrics CSV (`metrics/<skill>/<year>.csv`). Metrics CSVs
 * match by path for every agent; lane ownership of a metrics CSV is enforced by
 * the tier-2 sweep's author filter at the commit level, not here.
 *
 * @param {string} relPath - Path relative to the wiki root (POSIX or native).
 * @param {string} agent - Agent profile id (e.g. "staff-engineer").
 * @returns {boolean}
 */
export function isLaneFile(relPath, agent) {
  const rel = relPath.replace(/\\/g, "/");
  const base = path.posix.basename(rel);
  if (base === `${agent}.md`) return true;
  for (const re of [WEEKLY_LOG_NAME_RE, WEEKLY_LOG_PART_NAME_RE]) {
    const m = base.match(re);
    if (m && m[1] === agent) return true;
  }
  return METRICS_CSV_RE.test(rel);
}

/**
 * Enumerate the lane's own files present under `wikiRoot`: matching top-level
 * summary and weekly-log files, plus every `metrics/<skill>/<year>.csv`.
 * Returns wiki-root-relative POSIX paths.
 *
 * @param {string} wikiRoot
 * @param {string} agent
 * @param {object} fsSync - Sync filesystem surface (`runtime.fsSync`).
 * @returns {string[]} Relative paths, in directory-read order.
 */
export function enumerateLaneFiles(wikiRoot, agent, fsSync) {
  const out = [];
  for (const entry of fsSync.readdirSync(wikiRoot)) {
    if (entry !== "metrics" && isLaneFile(entry, agent)) out.push(entry);
  }
  out.push(...enumerateMetricsCsvs(wikiRoot, agent, fsSync));
  return out;
}

/** Wiki-root-relative `metrics/<skill>/<year>.csv` paths matching the lane. */
function enumerateMetricsCsvs(wikiRoot, agent, fsSync) {
  const metricsDir = path.join(wikiRoot, "metrics");
  if (!fsSync.existsSync(metricsDir)) return [];
  const found = [];
  for (const skill of fsSync.readdirSync(metricsDir)) {
    const skillDir = path.join(metricsDir, skill);
    if (!fsSync.statSync(skillDir).isDirectory()) continue;
    for (const file of fsSync.readdirSync(skillDir)) {
      const rel = `metrics/${skill}/${file}`;
      if (isLaneFile(rel, agent)) found.push(rel);
    }
  }
  return found;
}
