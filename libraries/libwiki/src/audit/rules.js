import {
  ACTIVE_CLAIMS_HEADER_RE,
  ACTIVE_CLAIMS_SEPARATOR_RE,
  ACTIVE_CLAIMS_TABLE_HEADER,
  AGENT_EXPERIMENTS_CLOSE_RE,
  AGENT_EXPERIMENTS_OPEN_RE,
  DECISION_HEADING,
  ISSUE_CLOSE_RE,
  ISSUE_OPEN_RE,
  MEMO_INBOX_MARKER,
  MEMORY_LINE_BUDGET,
  MEMORY_WORD_BUDGET,
  PRIORITY_INDEX_HEADING,
  STORYBOARD_LINE_BUDGET,
  STORYBOARD_WORD_BUDGET,
  SUMMARY_LINE_BUDGET,
  SUMMARY_WORD_BUDGET,
  WEEKLY_LOG_LINE_BUDGET,
  WEEKLY_LOG_WORD_BUDGET,
  XMR_CLOSE_RE,
  XMR_OPEN_RE,
} from "../constants.js";
import { CONFLICT_MARKER_RULE } from "./conflict-markers-rule.js";
import { PRIORITY_HEADER_RE, WEEKLY_LOG_H1_RE } from "./scopes.js";
import {
  AGENT_H3_REQUIREMENTS,
  allRequiredLines,
  carryAgentMismatch,
  carryEntryHasClearance,
  columnCount,
  containsLine,
  decisionWithin5,
  duplicateCsvRows,
  exists,
  expired,
  fieldMatches,
  firstH2Is,
  firstLineMatches,
  headingGrammarDrift,
  ISO_DATE_RE,
  lineBudget,
  markersBalanced,
  matches,
  memoryExists,
  memoryHasClaimsHeading,
  memoryHasClaimsHeader,
  memoryHasPriorityHeader,
  nothingAfterH2,
  PRIORITY_INDEX_HEADING_RE,
  PRIORITY_SEPARATOR_RE,
  storyboardExists,
  summaryAgentMismatch,
  weeklyAgentMismatch,
  wordBudget,
} from "./rule-builders.js";
import { STATUS_ROW_RULES } from "./status-row.js";

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
    remediation: "rotate",
    check: lineBudget(WEEKLY_LOG_LINE_BUDGET),
    message: (_s, r) => `${r.value} lines (limit ${WEEKLY_LOG_LINE_BUDGET})`,
    hint: (s) =>
      `run \`bunx fit-wiki rotate --agent ${s.agentPrefix}\` to seal this file as a sealed part and start a fresh weekly log`,
  },
  {
    id: "weekly-log.word-budget",
    scope: "weekly-log-main",
    severity: "fail",
    remediation: "rotate",
    check: wordBudget(WEEKLY_LOG_WORD_BUDGET),
    message: (_s, r) => `${r.value} words (limit ${WEEKLY_LOG_WORD_BUDGET})`,
    hint: (s) =>
      `run \`bunx fit-wiki rotate --agent ${s.agentPrefix}\` to seal this file as a sealed part and start a fresh weekly log`,
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
    id: "weekly-log.heading-grammar",
    scope: "weekly-log-main",
    severity: "fail",
    check: headingGrammarDrift,
    message: (_s, r) =>
      `Entry heading '${r.observed}' does not match the dated grammar`,
    hint: "weekly-log entry headings must be '## YYYY-MM-DD'; open entries with `fit-wiki log decision/note`, which emit a conforming heading the rotation seam-finder can split",
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
    message: (_s, r) =>
      r.nearMiss
        ? `Entry opens with '${r.nearMiss}'; the heading must be exactly '${DECISION_HEADING}' — move the suffix into the body`
        : `Entry lacks a line that is exactly '${DECISION_HEADING}'`,
    hint: `open each '## YYYY-MM-DD' entry with \`fit-wiki log decision\`, which emits a line containing exactly '${DECISION_HEADING}' (no suffix — the check is an exact match); put the one-line summary in the body below it, drawn from the entry's own narrative — do not invent rationale the entry does not support`,
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
    id: "weekly-log-part.heading-grammar",
    scope: "weekly-log-part",
    severity: "fail",
    check: headingGrammarDrift,
    message: (_s, r) =>
      `Entry heading '${r.observed}' does not match the dated grammar`,
    hint: "weekly-log entry headings must be '## YYYY-MM-DD'; open entries with `fit-wiki log decision/note`, which emit a conforming heading the rotation seam-finder can split",
  },
  {
    id: "weekly-log-part.line-budget",
    scope: "weekly-log-part",
    severity: "fail",
    remediation: "rotate",
    check: lineBudget(WEEKLY_LOG_LINE_BUDGET),
    message: (_s, r) => `${r.value} lines (limit ${WEEKLY_LOG_LINE_BUDGET})`,
    hint: "`bunx fit-wiki fix` re-bisects an over-budget part at its day-section seams and, for a lone over-cap day, at its '### ' block seams; only a single '### ' block that alone exceeds the budget remains for a human to shorten",
  },
  {
    id: "weekly-log-part.word-budget",
    scope: "weekly-log-part",
    severity: "fail",
    remediation: "rotate",
    check: wordBudget(WEEKLY_LOG_WORD_BUDGET),
    message: (_s, r) => `${r.value} words (limit ${WEEKLY_LOG_WORD_BUDGET})`,
    hint: "`bunx fit-wiki fix` re-bisects an over-budget part at its day-section seams and, for a lone over-cap day, at its '### ' block seams; only a single '### ' block that alone exceeds the budget remains for a human to shorten",
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

  // -- Carry surfaces --
  // No `h1-shape` rule: unlike the weekly logs (classified on filename alone),
  // the carry classifier (scopes.js) requires the Carry H1 before assigning the
  // scope, so a malformed-H1 file is left unclassified rather than reaching an
  // h1-shape rule. The two rules below are the reachable, failable set (SC #2).

  {
    id: "carry-surface.h1-agent-matches-filename",
    scope: "carry-surface",
    severity: "fail",
    check: carryAgentMismatch,
    message: (s, r) =>
      `H1 title slug '${r.titleSlug}' does not match filename prefix '${s.agentPrefix}'`,
    hint: "rename either the H1 ('# <agent> — Carries') or the file so they agree",
  },
  {
    id: "carry-surface.entry-has-clearance",
    scope: "carry-surface",
    severity: "fail",
    check: carryEntryHasClearance,
    message: () => "Carry entry lacks a '**Carry-clearance:**' trigger line",
    hint: "every '### ' Carry entry must name its clearance trigger with a '**Carry-clearance:**' line so the surface stays enumerable at boot",
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
    id: "memory.line-budget",
    scope: "memory",
    severity: "fail",
    when: memoryExists,
    check: lineBudget(MEMORY_LINE_BUDGET),
    message: (_s, r) => `${r.value} lines (limit ${MEMORY_LINE_BUDGET})`,
    hint: "MEMORY.md holds settled cross-cutting state, not history; release settled claims, prune stale priority rows, and move event-by-event detail to the relevant ledger page or weekly log",
  },
  {
    id: "memory.word-budget",
    scope: "memory",
    severity: "fail",
    when: memoryExists,
    check: wordBudget(MEMORY_WORD_BUDGET),
    message: (_s, r) => `${r.value} words (limit ${MEMORY_WORD_BUDGET})`,
    hint: "MEMORY.md holds settled cross-cutting state, not history; release settled claims, prune stale priority rows, and move event-by-event detail to the relevant ledger page or weekly log",
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
    check: matches(ACTIVE_CLAIMS_HEADER_RE),
    message: () => `Active claims header mismatch`,
    hint: `expected header row: '${ACTIVE_CLAIMS_TABLE_HEADER}'`,
  },
  {
    id: "memory.active-claims-separator-row",
    scope: "memory",
    severity: "fail",
    when: memoryHasClaimsHeader,
    check: matches(ACTIVE_CLAIMS_SEPARATOR_RE),
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
    hint: "run `bunx fit-wiki refresh` (or `release --expired`) to clear expired claims",
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
  {
    id: "storyboard.markers-balanced.agent-experiments",
    scope: "storyboard",
    severity: "fail",
    when: storyboardExists,
    check: markersBalanced({
      openRe: AGENT_EXPERIMENTS_OPEN_RE,
      closeRe: AGENT_EXPERIMENTS_CLOSE_RE,
      label: "agent-experiments",
    }),
    message: (_s, r) =>
      `${r.reason} agent-experiments marker${r.label ? ` (${r.label})` : ""}`,
    hint: "every '<!-- agent-experiments -->' needs a matching '<!-- /agent-experiments -->'",
  },

  // -- Metrics CSVs (union merge keeps both sides on concurrent appends;
  // exact-duplicate rows are surfaced here, never silently removed) --

  {
    id: "metrics-csv.duplicate-row",
    scope: "metrics-csv",
    severity: "fail",
    check: duplicateCsvRows,
    message: (_s, r) =>
      `Duplicate metrics row at line ${r.lineNo} (exact match of an earlier row)`,
    hint: "remove the surplus row, or differentiate a genuinely-distinct measurement by editing its run id or note so the rows are no longer identical",
  },

  // -- STATUS.md rows (per-migration-unit sub-row schema) --

  ...STATUS_ROW_RULES,

  // -- Conflict markers (structural; all audited surfaces) --

  CONFLICT_MARKER_RULE,

  // -- Filename admission --

  // The `admission` resolver yields one subject per git-tracked path the
  // filename grammar rejects, so the check always fires. Flag-for-human: a
  // wrong automated move or delete destroys memory, so `fix` routes this to the
  // human report (any non-`agent` remediation class does) and never touches the
  // file.
  {
    id: "admission.not-in-grammar",
    scope: "admission",
    severity: "fail",
    remediation: "flag",
    check: () => ({}),
    message: (s) => `${s.relPath} matches no wiki filename grammar class`,
    hint: "rename to an admitted class, or extend the Wiki Filename Grammar section in memory-protocol.md and audit/grammar.js together (the single admission path)",
  },
];
