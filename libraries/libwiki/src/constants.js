export const MEMO_INBOX_MARKER = "<!-- memo:inbox -->";
export const INBOX_HEADING = "## Message Inbox";
export const BROADCAST_TARGET = "all";

export const MEMORY_FILE = "MEMORY.md";
export const ACTIVE_CLAIMS_HEADING = "## Active Claims";
export const ACTIVE_CLAIMS_TABLE_HEADER =
  "| agent | target | branch | pr | claimed_at | expires_at |";
export const ACTIVE_CLAIMS_TABLE_SEPARATOR =
  "| --- | --- | --- | --- | --- | --- |";
export const PRIORITY_INDEX_HEADING = "## Cross-Cutting Priorities";
export const PRIORITY_INDEX_TABLE_HEADER =
  "| Item | Agents | Owner | Status | Added |";
export const DECISION_HEADING = "### Decision";

// Unified budgets for the three audited surfaces (summary, weekly-log,
// storyboard). They share the same numeric limits today so the
// context-tax floor is symmetric across surfaces; each surface keeps
// its own audit rule pair so the limits can diverge later if the
// context-tax model says one surface should be looser or tighter.
export const SUMMARY_LINE_BUDGET = 496;
export const SUMMARY_WORD_BUDGET = 6400;
export const WEEKLY_LOG_LINE_BUDGET = 496;
export const WEEKLY_LOG_WORD_BUDGET = 6400;
export const STORYBOARD_LINE_BUDGET = 496;
export const STORYBOARD_WORD_BUDGET = 6400;
