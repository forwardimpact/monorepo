import {
  ACTIVE_CLAIMS_HEADING,
  ACTIVE_CLAIMS_TABLE_HEADER,
  DECISION_HEADING,
  MEMO_INBOX_MARKER,
  PRIORITY_INDEX_HEADING,
  STORYBOARD_LINE_BUDGET,
  STORYBOARD_WORD_BUDGET,
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
// Marker regexes (mirror of marker-scanner.js): tolerate optional trailing
// text inside the marker so an open marker can carry an inline notice like
// "Do not edit. Auto-generated." without breaking the audit's balance check.
const XMR_OPEN_RE = /^<!--\s*xmr:([^:\s]+):(\S+)(?:\s+[^>]*?)?\s*-->\s*$/;
const XMR_CLOSE_RE = /^<!--\s*\/xmr(?:\s+[^>]*?)?\s*-->\s*$/;
const ISSUE_OPEN_RE =
  /^<!--\s*(obstacles|experiments):(open|closed)(?::(\d+d))?(?:\s+[^>]*?)?\s*-->\s*$/;
const ISSUE_CLOSE_RE =
  /^<!--\s*\/(obstacles|experiments)(?:\s+[^>]*?)?\s*-->\s*$/;

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
    message: () => "Missing '**Last run**:' line",
    hint: "add a '**Last run**: <date> — <one-line state>' line directly after the H1",
  },
  {
    id: "summary.first-h2-inbox",
    scope: "summary",
    severity: "fail",
    check: firstH2Is("Message Inbox"),
    message: (_s, r) => `First H2 is '${r.observed}', expected 'Message Inbox'`,
    hint: "move '## Message Inbox' to be the first H2 in the file",
  },
  {
    id: "summary.memo-inbox-marker",
    scope: "summary",
    severity: "fail",
    when: (s) => s.h2s.includes("Message Inbox"),
    check: containsLine(MEMO_INBOX_MARKER),
    message: () => `Missing ${MEMO_INBOX_MARKER} marker`,
    hint: "add the marker directly below the '## Message Inbox' heading so `fit-wiki memo` can find it",
  },
  {
    id: "summary.open-blockers-last",
    scope: "summary",
    severity: "fail",
    check: nothingAfterH2("Open Blockers"),
    message: (_s, r) => `'${r.observed}' appears after 'Open Blockers'`,
    hint: "move '## Open Blockers' to the end of the file",
  },
  {
    id: "summary.line-budget",
    scope: "summary",
    severity: "fail",
    check: lineBudget(SUMMARY_LINE_BUDGET),
    message: (_s, r) => `${r.value} lines (limit ${SUMMARY_LINE_BUDGET})`,
    hint: "trim history into the weekly log; the summary holds settled state, not history",
  },
  {
    id: "summary.word-budget",
    scope: "summary",
    severity: "fail",
    check: wordBudget(SUMMARY_WORD_BUDGET),
    message: (_s, r) => `${r.value} words (limit ${SUMMARY_WORD_BUDGET})`,
    hint: "trim history into the weekly log; the summary holds settled state, not history",
  },
  {
    id: "summary.h1-agent-matches-filename",
    scope: "summary",
    severity: "fail",
    check: summaryAgentMismatch,
    message: (s, r) =>
      `H1 title slug '${r.titleSlug}' does not match filename prefix '${s.agentPrefix}'`,
    hint: "rename either the H1 ('# <agent> — Summary') or the file so they agree",
  },

  // -- Weekly logs (main) --

  {
    id: "weekly-log.h1-shape",
    scope: "weekly-log-main",
    severity: "fail",
    check: firstLineMatches(WEEKLY_LOG_H1_RE),
    message: () => "Missing valid H1 heading",
    hint: "set the H1 to '# <agent> — YYYY-Www'",
  },
  {
    id: "weekly-log.line-budget",
    scope: "weekly-log-main",
    severity: "fail",
    check: lineBudget(WEEKLY_LOG_LINE_BUDGET),
    message: (_s, r) => `${r.value} lines (limit ${WEEKLY_LOG_LINE_BUDGET})`,
    hint: "run `bunx fit-wiki rotate` to seal this file as a sealed part and start a fresh weekly log",
  },
  {
    id: "weekly-log.word-budget",
    scope: "weekly-log-main",
    severity: "fail",
    check: wordBudget(WEEKLY_LOG_WORD_BUDGET),
    message: (_s, r) => `${r.value} words (limit ${WEEKLY_LOG_WORD_BUDGET})`,
    hint: "run `bunx fit-wiki rotate` to seal this file as a sealed part and start a fresh weekly log",
  },
  {
    id: "weekly-log.h1-agent-matches-filename",
    scope: "weekly-log-main",
    severity: "fail",
    check: weeklyAgentMismatch,
    message: (s, r) =>
      `H1 title slug '${r.titleSlug}' does not match filename prefix '${s.agentPrefix}'`,
    hint: "rename either the H1 or the file so they agree",
  },
  {
    id: "decision-block.heading-within-5",
    scope: "weekly-log-main",
    severity: "fail",
    check: decisionWithin5({
      entryRe: /^## \d{4}-\d{2}-\d{2}(?:[\s(].*)?$/,
      requiredLine: DECISION_HEADING,
      stopRe: /^##\s/,
    }),
    message: () => "Entry lacks leading '### Decision'",
    hint: "open each '## YYYY-MM-DD' entry with a '### Decision' subheading; use `bunx fit-wiki log decision` to do this mechanically",
  },

  // -- Weekly logs (sealed parts) --

  {
    id: "weekly-log-part.h1-shape",
    scope: "weekly-log-part",
    severity: "fail",
    check: firstLineMatches(WEEKLY_LOG_H1_RE),
    message: () => "Missing valid H1 heading",
    hint: "set the H1 to '# <agent> — YYYY-Www (part N of M)'",
  },
  {
    id: "weekly-log-part.line-budget",
    scope: "weekly-log-part",
    severity: "fail",
    check: lineBudget(WEEKLY_LOG_LINE_BUDGET),
    message: (_s, r) => `${r.value} lines (limit ${WEEKLY_LOG_LINE_BUDGET})`,
    hint: "sealed parts should already be at-or-under the cap; if not, the rotation that produced this part needs investigation",
  },
  {
    id: "weekly-log-part.word-budget",
    scope: "weekly-log-part",
    severity: "fail",
    check: wordBudget(WEEKLY_LOG_WORD_BUDGET),
    message: (_s, r) => `${r.value} words (limit ${WEEKLY_LOG_WORD_BUDGET})`,
    hint: "sealed parts should already be at-or-under the cap; if not, the rotation that produced this part needs investigation",
  },
  {
    id: "weekly-log-part.h1-agent-matches-filename",
    scope: "weekly-log-part",
    severity: "fail",
    check: weeklyAgentMismatch,
    message: (s, r) =>
      `H1 title slug '${r.titleSlug}' does not match filename prefix '${s.agentPrefix}'`,
    hint: "rename either the H1 or the file so they agree",
  },

  // -- MEMORY.md --

  {
    id: "memory.file-exists",
    scope: "memory",
    severity: "fail",
    check: exists,
    message: () => "MEMORY.md not found",
    hint: "run `bunx fit-wiki init` to scaffold the canonical sections",
  },
  {
    id: "memory.priority-heading",
    scope: "memory",
    severity: "fail",
    when: memoryExists,
    check: matches(PRIORITY_INDEX_HEADING_RE),
    message: () => `Missing '${PRIORITY_INDEX_HEADING}' heading`,
    hint: "add the heading before the cross-cutting priorities table",
  },
  {
    id: "memory.priority-table-header",
    scope: "memory",
    severity: "fail",
    when: memoryExists,
    check: matches(PRIORITY_HEADER_RE),
    message: () => "Missing priority table header row",
    hint: "add '| Item | Agents | Owner | Status | Added |' under the priority heading",
  },
  {
    id: "memory.priority-separator-row",
    scope: "memory",
    severity: "fail",
    when: memoryHasPriorityHeader,
    check: matches(PRIORITY_SEPARATOR_RE),
    message: () => "Missing priority table separator row",
    hint: "add '| --- | --- | --- | --- | --- |' directly below the header row",
  },
  {
    id: "memory.active-claims-table-header",
    scope: "memory",
    severity: "fail",
    when: memoryHasClaimsHeading,
    check: matches(CLAIMS_HEADER_RE),
    message: () => `Active claims header mismatch`,
    hint: `expected header row: '${ACTIVE_CLAIMS_TABLE_HEADER}'`,
  },
  {
    id: "memory.active-claims-separator-row",
    scope: "memory",
    severity: "fail",
    when: memoryHasClaimsHeader,
    check: matches(CLAIMS_SEPARATOR_RE),
    message: () => "Missing active-claims separator row",
    hint: "add '| --- | --- | --- | --- | --- | --- |' directly below the claims header",
  },

  // -- Table rows --

  {
    id: "priority-row.column-count",
    scope: "priority-row",
    severity: "fail",
    check: columnCount(5),
    message: (_s, r) => `${r.actual} cells (expected ${r.expected})`,
    hint: "every priority row needs 5 cells: Item, Agents, Owner, Status, Added",
  },
  {
    id: "claims-row.claimed-at-format",
    scope: "claims-row",
    severity: "fail",
    check: fieldMatches("claimed_at", ISO_DATE_RE),
    message: (s, r) => `Bad claimed_at '${r.value}' for ${s.agent}/${s.target}`,
    hint: "claimed_at must be ISO YYYY-MM-DD",
  },
  {
    id: "claims-row.expires-at-format",
    scope: "claims-row",
    severity: "fail",
    check: fieldMatches("expires_at", ISO_DATE_RE),
    message: (s, r) => `Bad expires_at '${r.value}' for ${s.agent}/${s.target}`,
    hint: "expires_at must be ISO YYYY-MM-DD",
  },
  {
    id: "expired-claim",
    scope: "claims-row",
    severity: "warn",
    check: expired,
    message: (s) => `${s.agent}/${s.target} expired ${s.expires_at}`,
    hint: "run `bunx fit-wiki release --expired` to clear expired claims",
  },

  // -- Storyboards --

  {
    id: "storyboard.current-month-exists",
    scope: "storyboard",
    severity: "fail",
    check: exists,
    message: (s) => `Current-month storyboard (${s.yearMonth}) not found`,
    hint: "create it from `.claude/skills/kata-session/references/storyboard-template.md`",
  },
  {
    id: "storyboard.agent-h3-required",
    scope: "storyboard",
    severity: "fail",
    when: storyboardExists,
    check: allRequiredLines(AGENT_H3_REQUIREMENTS),
    message: (_s, r) => `Missing '### ${r.label}' H3`,
    hint: "every domain agent gets an H3 under '## Current Condition'",
  },
  {
    id: "storyboard.line-budget",
    scope: "storyboard",
    severity: "fail",
    when: storyboardExists,
    check: lineBudget(STORYBOARD_LINE_BUDGET),
    message: (_s, r) => `${r.value} lines (limit ${STORYBOARD_LINE_BUDGET})`,
    hint: "see per-section word budgets in storyboard-template.md; retire prior-session Headlines/Notes/Next-review entries to weekly logs",
  },
  {
    id: "storyboard.word-budget",
    scope: "storyboard",
    severity: "fail",
    when: storyboardExists,
    check: wordBudget(STORYBOARD_WORD_BUDGET),
    message: (_s, r) => `${r.value} words (limit ${STORYBOARD_WORD_BUDGET})`,
    hint: "see per-section word budgets in storyboard-template.md; retire prior-session Headlines/Notes/Next-review entries to weekly logs",
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
    message: (_s, r) =>
      `${r.reason} xmr marker${r.label ? ` (${r.label})` : ""}`,
    hint: "every '<!-- xmr:metric:csv -->' needs a matching '<!-- /xmr -->'",
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
    message: (_s, r) =>
      `${r.reason} issue-list marker${r.label ? ` (${r.label})` : ""}`,
    hint: "every '<!-- obstacles:* -->' or '<!-- experiments:* -->' needs a matching close marker",
  },

  // -- Stray files --

  {
    id: "wiki.stray-file",
    scope: "stray-file",
    severity: "fail",
    check: always,
    message: () => "Does not match any known scope",
    hint: "rename to a recognized scope (summary, weekly log, weekly-log part) or remove the file",
  },
];
