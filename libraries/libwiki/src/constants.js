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

// Cap derivation: ≤2.5% of a 1M-token context window = 25k tokens;
// ≈42 tokens/line empirical proxy → ~500 lines. See spec 1060
// design-a.md § Decision area 2 for the full anchor.
export const WEEKLY_LOG_LINE_BUDGET = 496;
export const SUMMARY_LINE_BUDGET = 72;
export const WEEKLY_LOG_WORD_BUDGET = 6400;
export const SUMMARY_WORD_BUDGET = 12800;
