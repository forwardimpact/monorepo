export const MEMO_INBOX_MARKER = "<!-- memo:inbox -->";
export const INBOX_HEADING = "## Message Inbox";
export const BROADCAST_TARGET = "all";

export const MEMORY_FILE = "MEMORY.md";

// Row-structured singleton surfaces under the sync-merge discipline: when a
// landing on one of these is contended, the resolution re-runs the row
// operation against the fresh remote tip (rebase the operation, not the
// lines), never a textual merge. Founding member: MEMORY.md (the Active Claims
// table). STATUS.md phase rows join as their own re-apply operations land.
// Metrics CSV appends take the complementary union-merge path below.
export const SINGLETON_PATHS = new Set([MEMORY_FILE]);

// The tracked `.gitattributes` declaration that makes concurrent appends to
// metrics CSVs union-merge (keep both sides' rows) on every publish path,
// instead of conflicting or side-picking. Carried by the wiki repo itself so
// it governs every clone.
export const GITATTRIBUTES_FILE = ".gitattributes";
export const METRICS_CSV_MERGE_ATTRIBUTE = "metrics/**/*.csv merge=union";
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
  /^([a-z][a-z-]*)-(\d{4})-W(\d{2})-part\d+\.md$/;

// Day-section seam: `## YYYY-MM-DD` at line start, a trailing suffix tolerated
// (e.g. `## 2026-05-19 (third activation)`). One home so the rotation
// seam-finder (weekly-log.js), the `log` command's last-entry probe
// (commands/log.js), and the audit's heading-grammar-drift rule (audit/rules.js)
// cannot disagree on what a conforming entry heading is. Source has no flags;
// call sites add `g`/`m` as needed via `new RegExp(WEEKLY_LOG_SEAM_RE.source, …)`.
export const WEEKLY_LOG_SEAM_RE = /^## (\d{4}-\d{2}-\d{2})/;

// Tier-2 integrity sweep idle-gap: lane-authored commits separated by more
// than this delimit sessions in the wiki history. 30 minutes.
export const SESSION_GAP_MS = 30 * 60 * 1000;

// Carry-surface filename and H1 convention: `<agent>-carries.md` with an H1
// `# <agent> — Carries`. The name capture group is the agent prefix (used by
// the H1↔filename agreement rule). A Carry entry names its clearance trigger
// with the `**Carry-clearance:**` marker — the existing live convention in
// `wiki/release-engineer.md § Message Inbox`, preserved verbatim so the
// migration relocates without re-marking. One home so the audit's classifier
// (audit/scopes.js) and rules (audit/rules.js) cannot drift on the syntax.
export const CARRY_SURFACE_NAME_RE = /^(.+)-carries\.md$/;
export const CARRY_SURFACE_H1_RE = /^# (.+) — Carries$/;
export const CARRY_CLEARANCE_MARKER_RE = /\*\*Carry-clearance:\*\*/;

// Storyboard marker syntax. An open or close marker tolerates optional trailing
// text after the tag (typically an inline "Do not edit. Generated from fit-wiki
// refresh." notice). One home so the marker scanner (marker-scanner.js) and the
// audit's balance check (audit/rules.js) cannot drift on the syntax.
// Capture groups: 1 metric, 2 csvPath, 3 optional prior-read anchor date. The
// `prior=YYYY-MM-DD` token sits before the trailing-text group so the "Do not
// edit" notice is still tolerated and does not swallow the anchor.
export const XMR_OPEN_RE =
  /^<!--\s*xmr:([^:\s]+):(\S+)(?:\s+prior=(\d{4}-\d{2}-\d{2}))?(?:\s+[^>]*?)?\s*-->\s*$/;
export const XMR_CLOSE_RE = /^<!--\s*\/xmr(?:\s+[^>]*?)?\s*-->\s*$/;
export const ISSUE_OPEN_RE =
  /^<!--\s*(obstacles|experiments):(open|closed)(?::(\d+d))?(?:\s+[^>]*?)?\s*-->\s*$/;
export const ISSUE_CLOSE_RE =
  /^<!--\s*\/(obstacles|experiments)(?:\s+[^>]*?)?\s*-->\s*$/;

// Materialized per-agent experiments surface. A distinct marker
// kind from `experiments:open` — it carries attributed, sanitized items plus a
// last-successful-sync stamp, and is read offline by `fit-wiki boot`. One home
// so the scanner (marker-scanner.js), the refresh renderer (commands/refresh.js),
// the boot parser (boot.js), and the audit balance check (audit/rules.js) cannot
// drift on the syntax.
export const AGENT_EXPERIMENTS_OPEN_RE =
  /^<!--\s*agent-experiments(?:\s+[^>]*?)?\s*-->\s*$/;
export const AGENT_EXPERIMENTS_CLOSE_RE =
  /^<!--\s*\/agent-experiments(?:\s+[^>]*?)?\s*-->\s*$/;
export const LAST_SYNC_RE =
  /^<!--\s*last-successful-sync:\s*(\d{4}-\d{2}-\d{2})\s*-->\s*$/;
// Attributed item line: `- #<n> [<agent>] <title> (by <author>)`. The author
// suffix is mandatory and anchored at end; the title group is greedy, which is
// unambiguous because sanitizeTitle defuses any embedded ` (by ` token.
export const AGENT_EXPERIMENT_ITEM_RE =
  /^- #(\d+) \[([a-z][a-z-]*)\] (.*) \(by (.+)\)$/;
