import path from "node:path";
import { WEEKLY_LOG_NAME_RE, WEEKLY_LOG_PART_NAME_RE } from "../constants.js";

// The wiki filename admission grammar. It is a pure classifier. It takes a
// wiki-relative path and decides whether the filename grammar admits it. The
// normative prose lives in memory-protocol.md's "Wiki Filename Grammar"
// section. This module enforces that prose. One home per policy, so the two
// cannot drift. The audit's `admission` scope is the only consumer.

const NAMED_LEDGERS = new Set(["Home.md", "MEMORY.md", "STATUS.md"]);
const STORYBOARD_RE = /^storyboard-\d{4}-M\d{2}\.md$/;
const DATED_DELIVERABLE_RE = /^(.+)-\d{4}-\d{2}-\d{2}\.md$/;

// Calendar tokens, anchored at hyphen-segment boundaries so a token must occupy
// whole `-`-delimited segments. `8080` *inside* a longer segment
// (`release8080-notes`) is not a token. A standalone `8080` segment is a
// bare year. The anchors `(?:^|-)…(?=-|$)` are load-bearing. A per-segment
// split would silently miss the multi-segment week/month/date tokens.
const CALENDAR_TOKEN_RES = [
  /(?:^|-)\d{4}-W\d{2}(?=-|$)/, // week  YYYY-Www
  /(?:^|-)\d{4}-M\d{2}(?=-|$)/, // month YYYY-MNN
  /(?:^|-)\d{4}-\d{2}-\d{2}(?=-|$)/, // date  YYYY-MM-DD
  /(?:^|-)\d{4}(?=-|$)/, // bare year YYYY
];

/**
 * True when `stem` (a basename without its `.md` extension, or a captured
 * `<topic>`) contains any calendar token on a hyphen-segment boundary.
 * @param {string} stem
 * @returns {boolean}
 */
export function hasCalendarToken(stem) {
  return CALENDAR_TOKEN_RES.some((re) => re.test(stem));
}

/**
 * A root-level `.md` file whose stem carries no calendar token. This is the
 * summary class.
 */
function isSummaryName(base) {
  if (!base.endsWith(".md")) return false;
  return !hasCalendarToken(base.slice(0, -".md".length));
}

/**
 * The summary-class stem of a root-level basename, or `null`. Named ledgers
 * (`MEMORY.md` etc.) are not summaries. Callers use it to derive the
 * `rootSummaryAgents` set that gates `<agent>/` sidecar directory admission.
 * @param {string} base - A root-level basename.
 * @returns {string|null}
 */
export function rootSummaryStem(base) {
  if (NAMED_LEDGERS.has(base)) return null;
  return isSummaryName(base) ? base.slice(0, -".md".length) : null;
}

/** Classify a root-level file (no `/` in its relative path) by basename. */
function classifyRootFile(base) {
  if (NAMED_LEDGERS.has(base)) return "admitted";
  if (WEEKLY_LOG_NAME_RE.test(base) || WEEKLY_LOG_PART_NAME_RE.test(base)) {
    return "admitted";
  }
  if (STORYBOARD_RE.test(base)) return "admitted";
  const dated = base.match(DATED_DELIVERABLE_RE);
  // A dated deliverable's `<topic>` must itself be token-free, so a date at
  // the end cannot smuggle a token-bearing stem (`…-history-YYYY-MM-DD.md`) in.
  if (dated && !hasCalendarToken(dated[1])) return "admitted";
  if (isSummaryName(base)) return "admitted";
  // The classifier rejects anything else at the root. That covers a non-`.md`
  // name, and a token-bearing name that matches no exact dated shape.
  return "rejected";
}

/**
 * Classify one wiki-relative path against the filename admission grammar.
 *
 * The grammar classifies root files (no `/`) by their basename. It admits a
 * nested path iff the first segment is an admitted root-level directory. That
 * is `metrics`, or an `<agent>` that has a root summary-class file. It then
 * admits every file beneath that directory by membership (innards unpoliced).
 * The grammar evaluates directories at the wiki root level only.
 *
 * @param {string} relPath - Path relative to the wiki root (POSIX separators).
 * @param {{rootSummaryAgents: Set<string>|string[]}} options
 * @returns {"admitted"|"rejected"}
 */
export function classifyPath(relPath, { rootSummaryAgents } = {}) {
  const normalized = relPath.split(path.sep).join("/");
  const slash = normalized.indexOf("/");
  if (slash === -1) return classifyRootFile(normalized);
  const firstSegment = normalized.slice(0, slash);
  const agents =
    rootSummaryAgents instanceof Set
      ? rootSummaryAgents
      : new Set(rootSummaryAgents ?? []);
  if (firstSegment === "metrics" || agents.has(firstSegment)) {
    return "admitted";
  }
  return "rejected";
}
