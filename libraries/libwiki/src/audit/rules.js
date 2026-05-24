import {
  ACTIVE_CLAIMS_HEADING,
  ACTIVE_CLAIMS_TABLE_HEADER,
  DECISION_HEADING,
  MEMO_INBOX_MARKER,
  PRIORITY_INDEX_HEADING,
  SUMMARY_LINE_BUDGET,
  SUMMARY_WORD_BUDGET,
  WEEKLY_LOG_LINE_BUDGET,
  WEEKLY_LOG_WORD_BUDGET,
} from "../constants.js";
import { PRIORITY_HEADER_RE, WEEKLY_LOG_H1_RE } from "./scopes.js";

const PRIORITY_INDEX_HEADING_RE = new RegExp(
  `^${PRIORITY_INDEX_HEADING}$`,
  "m",
);
const ACTIVE_CLAIMS_HEADING_RE = new RegExp(`^${ACTIVE_CLAIMS_HEADING}$`, "m");
const PRIORITY_SEPARATOR_RE =
  /^\|\s*---\s*\|\s*---\s*\|\s*---\s*\|\s*---\s*\|\s*---\s*\|/m;
const CLAIMS_HEADER_RE =
  /^\|\s*agent\s*\|\s*target\s*\|\s*branch\s*\|\s*pr\s*\|\s*claimed_at\s*\|\s*expires_at\s*\|/m;
const CLAIMS_SEPARATOR_RE =
  /^\|\s*---\s*\|\s*---\s*\|\s*---\s*\|\s*---\s*\|\s*---\s*\|\s*---\s*\|/m;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const XMR_OPEN_RE = /^<!--\s*xmr:([^:\s]+):([^\s]+)\s*-->\s*$/;
const XMR_CLOSE_RE = /^<!--\s*\/xmr\s*-->\s*$/;
const ISSUE_OPEN_RE =
  /^<!--\s*(obstacles|experiments):(open|closed)(?::(\d+d))?\s*-->\s*$/;
const ISSUE_CLOSE_RE = /^<!--\s*\/(obstacles|experiments)\s*-->\s*$/;

// improvement-coach is the storyboard facilitator and carries no domain
// metrics; only the five domain agents need their own H3.
const STORYBOARD_DOMAIN_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

// -- Check builders: subject (+ ctx) → null | finding | finding[] --

const matches = (pattern) => (s) => (pattern.test(s.text) ? null : {});
const firstLineMatches = (pattern) => (s) =>
  pattern.test(s.firstLine) ? null : {};
const containsLine = (needle) => (s) =>
  s.fileLines.some((l) => l.trim() === needle) ? null : {};

const lineBudget = (limit) => (s) =>
  s.lines > limit ? { value: s.lines } : null;
const wordBudget = (limit) => (s) =>
  s.words > limit ? { value: s.words } : null;

const firstH2Is = (expected) => (s) =>
  s.h2s.length === 0 || s.h2s[0] === expected ? null : { observed: s.h2s[0] };

const nothingAfterH2 = (marker) => (s) => {
  const idx = s.h2s.indexOf(marker);
  if (idx === -1) return null;
  const after = s.h2s.slice(idx + 1);
  return after.length === 0 ? null : after.map((h) => ({ observed: h }));
};

const fieldMatches = (name, pattern) => (s) =>
  pattern.test(s[name]) ? null : { value: s[name] };

const columnCount = (expected) => (s) =>
  s.cells.length === expected ? null : { actual: s.cells.length, expected };

const exists = (s) => (s.exists ? null : {});
const expired = (s, ctx) => (s.expires_at < ctx.today ? {} : null);
const always = () => ({});

function entryHasDecision(lines, startIdx, requiredLine, stopRe) {
  let seen = 0;
  for (let j = startIdx + 1; j < lines.length && seen < 5; j++) {
    const ln = lines[j].trim();
    if (ln === "") continue;
    seen++;
    if (ln === requiredLine) return true;
    if (stopRe.test(lines[j])) return false;
  }
  return false;
}

const decisionWithin5 =
  ({ entryRe, requiredLine, stopRe }) =>
  (s) => {
    const offenders = [];
    for (let i = 0; i < s.fileLines.length; i++) {
      if (
        entryRe.test(s.fileLines[i]) &&
        !entryHasDecision(s.fileLines, i, requiredLine, stopRe)
      ) {
        offenders.push({ lineNo: i + 1 });
      }
    }
    return offenders.length === 0 ? null : offenders;
  };

function scanMarkers(fileLines, openRe, closeRe, label) {
  const openings = [];
  const findings = [];
  for (let i = 0; i < fileLines.length; i++) {
    const openMatch = fileLines[i].match(openRe);
    if (openMatch) {
      openings.push({ label: openMatch[1] || label, lineNo: i + 1 });
    } else if (closeRe.test(fileLines[i])) {
      if (openings.length > 0) openings.pop();
      else findings.push({ lineNo: i + 1, reason: "unpaired-close" });
    }
  }
  for (const open of openings) {
    findings.push({
      lineNo: open.lineNo,
      reason: "dangling-open",
      label: open.label,
    });
  }
  return findings;
}

const markersBalanced =
  ({ openRe, closeRe, label }) =>
  (s) => {
    const findings = scanMarkers(s.fileLines, openRe, closeRe, label);
    return findings.length === 0 ? null : findings;
  };

const allRequiredLines = (required) => (s) => {
  const findings = [];
  for (const r of required) {
    if (!s.fileLines.some((l) => r.pattern.test(l))) {
      findings.push({ label: r.label });
    }
  }
  return findings.length === 0 ? null : findings;
};

// -- H1 → filename agent prefix --

const slugify = (title) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const summaryAgentMismatch = (s) => {
  const titleSlug = slugify(s.firstLine.match(/^# (.+) — Summary$/)[1]);
  return titleSlug === s.agentPrefix ? null : { titleSlug };
};

const weeklyAgentMismatch = (s) => {
  const m = s.firstLine.match(
    /^# (.+) — \d{4}-W\d{2}(?: \(part \d+ of \d+\))?$/,
  );
  if (!m) return null;
  const titleSlug = slugify(m[1]);
  return titleSlug === s.agentPrefix ? null : { titleSlug };
};

const AGENT_H3_REQUIREMENTS = STORYBOARD_DOMAIN_AGENTS.map((agent) => ({
  label: agent,
  pattern: new RegExp(`^### ${agent}(\\s|$|—|-)`),
}));

const memoryExists = (s) => s.exists;
const memoryHasPriorityHeader = (s) =>
  s.exists && PRIORITY_HEADER_RE.test(s.text);
const memoryHasClaimsHeading = (s) =>
  s.exists && ACTIVE_CLAIMS_HEADING_RE.test(s.text);
const memoryHasClaimsHeader = (s) => CLAIMS_HEADER_RE.test(s.text);
const storyboardExists = (s) => s.exists;

export const RULES = [
  // -- Summary files --

  {
    id: "summary.last-run-marker",
    scope: "summary",
    severity: "fail",
    check: matches(/^\*\*Last run\*\*:/m),
    message: (s) => `sections: ${s.path} missing '**Last run**:' line`,
  },
  {
    id: "summary.first-h2-inbox",
    scope: "summary",
    severity: "fail",
    check: firstH2Is("Message Inbox"),
    message: (s, r) =>
      `sections: ${s.path} first H2 is '${r.observed}', expected 'Message Inbox'`,
  },
  {
    id: "summary.memo-inbox-marker",
    scope: "summary",
    severity: "fail",
    when: (s) => s.h2s.includes("Message Inbox"),
    check: containsLine(MEMO_INBOX_MARKER),
    message: (s) => `sections: ${s.path} missing <!-- memo:inbox --> marker`,
  },
  {
    id: "summary.open-blockers-last",
    scope: "summary",
    severity: "fail",
    check: nothingAfterH2("Open Blockers"),
    message: (s, r) =>
      `sections: ${s.path} '${r.observed}' appears after 'Open Blockers'`,
  },
  {
    id: "summary.line-budget",
    scope: "summary",
    severity: "fail",
    graceDowngrade: true,
    check: lineBudget(SUMMARY_LINE_BUDGET),
    message: (s, r) =>
      `budget: ${s.path} has ${r.value} lines (limit ${SUMMARY_LINE_BUDGET})`,
  },
  {
    id: "summary.word-budget",
    scope: "summary",
    severity: "fail",
    graceDowngrade: true,
    check: wordBudget(SUMMARY_WORD_BUDGET),
    message: (s, r) =>
      `budget: ${s.path} has ${r.value} words (limit ${SUMMARY_WORD_BUDGET})`,
  },
  {
    id: "summary.h1-agent-matches-filename",
    scope: "summary",
    severity: "fail",
    check: summaryAgentMismatch,
    message: (s, r) =>
      `sections: ${s.path} H1 title slug '${r.titleSlug}' does not match filename prefix '${s.agentPrefix}'`,
  },

  // -- Weekly logs (main) --

  {
    id: "weekly-log.h1-shape",
    scope: "weekly-log-main",
    severity: "fail",
    check: firstLineMatches(WEEKLY_LOG_H1_RE),
    message: (s) => `weekly-log: ${s.path} missing valid H1 heading`,
  },
  {
    id: "weekly-log.line-budget",
    scope: "weekly-log-main",
    severity: "fail",
    check: lineBudget(WEEKLY_LOG_LINE_BUDGET),
    message: (s, r) =>
      `weekly-log: ${s.path} has ${r.value} lines (limit ${WEEKLY_LOG_LINE_BUDGET})`,
  },
  {
    id: "weekly-log.word-budget",
    scope: "weekly-log-main",
    severity: "fail",
    check: wordBudget(WEEKLY_LOG_WORD_BUDGET),
    message: (s, r) =>
      `weekly-log: ${s.path} has ${r.value} words (limit ${WEEKLY_LOG_WORD_BUDGET})`,
  },
  {
    id: "weekly-log.h1-agent-matches-filename",
    scope: "weekly-log-main",
    severity: "fail",
    check: weeklyAgentMismatch,
    message: (s, r) =>
      `weekly-log: ${s.path} H1 title slug '${r.titleSlug}' does not match filename prefix '${s.agentPrefix}'`,
  },
  {
    id: "decision-block.heading-within-5",
    scope: "weekly-log-main",
    severity: "fail",
    graceDowngrade: true,
    check: decisionWithin5({
      entryRe: /^## \d{4}-\d{2}-\d{2}(?:[\s(].*)?$/,
      requiredLine: DECISION_HEADING,
      stopRe: /^##\s/,
    }),
    message: (s, r) =>
      `decision-block: ${s.path}:${r.lineNo} entry lacks leading '### Decision'`,
  },

  // -- Weekly logs (sealed parts) --

  {
    id: "weekly-log-part.h1-shape",
    scope: "weekly-log-part",
    severity: "fail",
    check: firstLineMatches(WEEKLY_LOG_H1_RE),
    message: (s) => `weekly-log: ${s.path} missing valid H1 heading`,
  },
  {
    id: "weekly-log-part.line-budget",
    scope: "weekly-log-part",
    severity: "fail",
    check: lineBudget(WEEKLY_LOG_LINE_BUDGET),
    message: (s, r) =>
      `weekly-log: ${s.path} has ${r.value} lines (limit ${WEEKLY_LOG_LINE_BUDGET})`,
  },
  {
    id: "weekly-log-part.word-budget",
    scope: "weekly-log-part",
    severity: "fail",
    check: wordBudget(WEEKLY_LOG_WORD_BUDGET),
    message: (s, r) =>
      `weekly-log: ${s.path} has ${r.value} words (limit ${WEEKLY_LOG_WORD_BUDGET})`,
  },
  {
    id: "weekly-log-part.h1-agent-matches-filename",
    scope: "weekly-log-part",
    severity: "fail",
    check: weeklyAgentMismatch,
    message: (s, r) =>
      `weekly-log: ${s.path} H1 title slug '${r.titleSlug}' does not match filename prefix '${s.agentPrefix}'`,
  },

  // -- MEMORY.md --

  {
    id: "memory.file-exists",
    scope: "memory",
    severity: "fail",
    check: exists,
    message: (s) => `memory: ${s.path} not found`,
  },
  {
    id: "memory.priority-heading",
    scope: "memory",
    severity: "fail",
    when: memoryExists,
    check: matches(PRIORITY_INDEX_HEADING_RE),
    message: () => `memory: missing '${PRIORITY_INDEX_HEADING}' heading`,
  },
  {
    id: "memory.priority-table-header",
    scope: "memory",
    severity: "fail",
    when: memoryExists,
    check: matches(PRIORITY_HEADER_RE),
    message: () => "memory: missing priority table header row",
  },
  {
    id: "memory.priority-separator-row",
    scope: "memory",
    severity: "fail",
    when: memoryHasPriorityHeader,
    check: matches(PRIORITY_SEPARATOR_RE),
    message: () =>
      "memory: missing priority table separator row (| --- | --- | --- | --- | --- |)",
  },
  {
    id: "memory.active-claims-table-header",
    scope: "memory",
    severity: "fail",
    when: memoryHasClaimsHeading,
    check: matches(CLAIMS_HEADER_RE),
    message: () =>
      `active-claims: header mismatch (expected ${ACTIVE_CLAIMS_TABLE_HEADER})`,
  },
  {
    id: "memory.active-claims-separator-row",
    scope: "memory",
    severity: "fail",
    when: memoryHasClaimsHeader,
    check: matches(CLAIMS_SEPARATOR_RE),
    message: () =>
      "active-claims: missing separator row (| --- | --- | --- | --- | --- | --- |)",
  },

  // -- Table rows --

  {
    id: "priority-row.column-count",
    scope: "priority-row",
    severity: "fail",
    check: columnCount(5),
    message: (s, r) =>
      `priority-row: row at line ${s.lineNo} has ${r.actual} cells (expected ${r.expected})`,
  },
  {
    id: "claims-row.claimed-at-format",
    scope: "claims-row",
    severity: "fail",
    check: fieldMatches("claimed_at", ISO_DATE_RE),
    message: (s, r) =>
      `active-claims: bad claimed_at '${r.value}' for ${s.agent}/${s.target}`,
  },
  {
    id: "claims-row.expires-at-format",
    scope: "claims-row",
    severity: "fail",
    check: fieldMatches("expires_at", ISO_DATE_RE),
    message: (s, r) =>
      `active-claims: bad expires_at '${r.value}' for ${s.agent}/${s.target}`,
  },
  {
    id: "expired-claim",
    scope: "claims-row",
    severity: "warn",
    check: expired,
    message: (s) =>
      `expired-claim: ${s.agent}/${s.target} expired ${s.expires_at}`,
  },

  // -- Storyboards --

  {
    id: "storyboard.current-month-exists",
    scope: "storyboard",
    severity: "fail",
    check: exists,
    message: (s) =>
      `storyboard: ${s.path} (current month ${s.yearMonth}) not found`,
  },
  {
    id: "storyboard.agent-h3-required",
    scope: "storyboard",
    severity: "fail",
    when: storyboardExists,
    check: allRequiredLines(AGENT_H3_REQUIREMENTS),
    message: (s, r) => `storyboard: ${s.path} missing '### ${r.label}' H3`,
  },
  {
    id: "storyboard.markers-balanced.xmr",
    scope: "storyboard",
    severity: "fail",
    when: storyboardExists,
    check: markersBalanced({
      openRe: XMR_OPEN_RE,
      closeRe: XMR_CLOSE_RE,
      label: "xmr",
    }),
    message: (s, r) =>
      `storyboard: ${s.path}:${r.lineNo} ${r.reason} xmr marker${r.label ? ` (${r.label})` : ""}`,
  },
  {
    id: "storyboard.markers-balanced.issues",
    scope: "storyboard",
    severity: "fail",
    when: storyboardExists,
    check: markersBalanced({
      openRe: ISSUE_OPEN_RE,
      closeRe: ISSUE_CLOSE_RE,
      label: "issue-list",
    }),
    message: (s, r) =>
      `storyboard: ${s.path}:${r.lineNo} ${r.reason} issue-list marker${r.label ? ` (${r.label})` : ""}`,
  },

  // -- Stray files --

  {
    id: "wiki.stray-file",
    scope: "stray-file",
    severity: "fail",
    check: always,
    message: (s) =>
      `stray-file: ${s.path} does not match any known scope (summary, weekly log, or excluded prefix)`,
  },
];
