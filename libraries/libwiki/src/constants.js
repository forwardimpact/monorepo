export const MEMO_INBOX_MARKER = "<!-- memo:inbox -->";
export const INBOX_HEADING = "## Message Inbox";
export const BROADCAST_TARGET = "all";

export const MEMORY_FILE = "MEMORY.md";
export const ACTIVE_CLAIMS_HEADING = "## Active Claims";
export const ACTIVE_CLAIMS_TABLE_HEADER =
  "| agent | target | branch | pr | claimed_at | expires_at |";
export const ACTIVE_CLAIMS_TABLE_SEPARATOR =
  "| --- | --- | --- | --- | --- | --- |";

// Match a rendered pipe-table row (header or separator) line-anchored and
// whitespace-tolerant between cells. Deriving the matcher from the rendered
// literal keeps the claims parser (active-claims.js) and the audit
// (audit/rules.js) from drifting on the column set — one literal, one matcher.
function pipeRowRe(literal, flags) {
  const cells = literal
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c !== "");
  return new RegExp(`^\\|\\s*${cells.join("\\s*\\|\\s*")}\\s*\\|`, flags);
}
export const ACTIVE_CLAIMS_HEADER_RE = pipeRowRe(
  ACTIVE_CLAIMS_TABLE_HEADER,
  "m",
);
export const ACTIVE_CLAIMS_SEPARATOR_RE = pipeRowRe(
  ACTIVE_CLAIMS_TABLE_SEPARATOR,
  "m",
);
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
export const SUMMARY_WORD_BUDGET = 2048;
export const WEEKLY_LOG_LINE_BUDGET = 496;
export const WEEKLY_LOG_WORD_BUDGET = 6400;
export const STORYBOARD_LINE_BUDGET = 496;
export const STORYBOARD_WORD_BUDGET = 6400;

// Weekly-log filename convention: `<agent>-YYYY-Www.md` for the live main log
// and `<agent>-YYYY-Www-partN.md` for a sealed part. Capture groups are
// agent / year / week. One home so the audit's file classifier
// (audit/scopes.js) and the part re-bisector (weekly-log.js) cannot drift.
export const WEEKLY_LOG_NAME_RE = /^([a-z][a-z-]*)-(\d{4})-W(\d{2})\.md$/;
export const WEEKLY_LOG_PART_NAME_RE =
  /^([a-z][a-z-]*)-(\d{4})-W(\d{2})-part(\d+)\.md$/;

// Storyboard marker syntax. An open or close marker tolerates optional trailing
// text after the tag (typically an inline "Do not edit. Generated from fit-wiki
// refresh." notice). One home so the marker scanner (marker-scanner.js) and the
// audit's balance check (audit/rules.js) cannot drift on the syntax.
export const XMR_OPEN_RE =
  /^<!--\s*xmr:([^:\s]+):(\S+)(?:\s+[^>]*?)?\s*-->\s*$/;
export const XMR_CLOSE_RE = /^<!--\s*\/xmr(?:\s+[^>]*?)?\s*-->\s*$/;
export const ISSUE_OPEN_RE =
  /^<!--\s*(obstacles|experiments):(open|closed)(?::(\d+d))?(?:\s+[^>]*?)?\s*-->\s*$/;
export const ISSUE_CLOSE_RE =
  /^<!--\s*\/(obstacles|experiments)(?:\s+[^>]*?)?\s*-->\s*$/;
