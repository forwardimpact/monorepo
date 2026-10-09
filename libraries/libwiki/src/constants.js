export const MEMO_INBOX_MARKER = "<!-- memo:inbox -->";
export const INBOX_HEADING = "## Message Inbox";
export const BROADCAST_TARGET = "all";

export const MEMORY_FILE = "MEMORY.md";

// Row-structured singleton surfaces under the sync-merge discipline. When a
// landing on one of these is contended, the resolution re-runs the row
// operation against the fresh remote tip. It rebases the operation. It does
// not rebase the lines, and it never does a textual merge. Founding member:
// MEMORY.md (the Active Claims table). STATUS.md phase rows join as their own
// re-apply operations land. Metrics CSV appends take the complementary
// union-merge path below.
export const SINGLETON_PATHS = new Set([MEMORY_FILE]);

// The tracked `.gitattributes` declaration that makes concurrent appends to
// metrics CSVs union-merge (keep both sides' rows) on every publish path. The
// appends then never conflict, and nothing picks one side. The wiki repo
// carries the declaration itself, so it governs every clone.
export const GITATTRIBUTES_FILE = ".gitattributes";
export const METRICS_CSV_MERGE_ATTRIBUTE = "metrics/**/*.csv merge=union";
export const ACTIVE_CLAIMS_HEADING = "## Active Claims";
export const ACTIVE_CLAIMS_TABLE_HEADER =
  "| agent | target | branch | pr | claimed_at | expires_at |";
export const ACTIVE_CLAIMS_TABLE_SEPARATOR =
  "| --- | --- | --- | --- | --- | --- |";

// Match a rendered pipe-table row (header or separator) line-anchored and
// whitespace-tolerant between cells. The matcher comes from the rendered
// literal, so the claims parser (active-claims.js) and the audit
// (audit/rules.js) cannot drift on the column set. One literal, one matcher.
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

// Unified budgets for the audited surfaces (summary, weekly-log, storyboard,
// memory). They keep per-surface rule pairs so the limits can diverge as the
// context-tax model says one surface should be looser or tighter. MEMORY.md is
// the tightest. Every boot reads it, and it holds settled cross-cutting state
// and no history. So its budget keeps the on-boot read cheap.
export const SUMMARY_LINE_BUDGET = 496;
export const SUMMARY_WORD_BUDGET = 2048;
export const WEEKLY_LOG_LINE_BUDGET = 496;
export const WEEKLY_LOG_WORD_BUDGET = 6400;
export const STORYBOARD_LINE_BUDGET = 496;
export const STORYBOARD_WORD_BUDGET = 6400;
export const MEMORY_LINE_BUDGET = 128;
export const MEMORY_WORD_BUDGET = 2048;

// Weekly-log filename convention: `<agent>-YYYY-Www.md` for the live main log
// and `<agent>-YYYY-Www-partN.md` for a sealed part. Capture groups are
// agent / year / week. One home so the audit's file classifier
// (audit/scopes.js) and the part re-bisector (weekly-log.js) cannot drift.
export const WEEKLY_LOG_NAME_RE = /^([a-z][a-z-]*)-(\d{4})-W(\d{2})\.md$/;
export const WEEKLY_LOG_PART_NAME_RE =
  /^([a-z][a-z-]*)-(\d{4})-W(\d{2})-part\d+\.md$/;

// Day-section seam: `## YYYY-MM-DD` at line start. The matcher tolerates a
// trailing suffix (e.g. `## 2026-05-19 (third activation)`). One home so the
// rotation seam-finder (weekly-log.js), the `log` command's last-entry probe
// (commands/log.js), and the audit's heading-grammar-drift rule
// (audit/rules.js) cannot disagree on what a conforming entry heading is. The
// source has no flags. Call sites add `g`/`m` as needed with
// `new RegExp(WEEKLY_LOG_SEAM_RE.source, …)`.
export const WEEKLY_LOG_SEAM_RE = /^## (\d{4}-\d{2}-\d{2})/;

// Idle-gap for the tier-2 integrity sweep. Lane-authored commits with a gap
// larger than this value delimit sessions in the wiki history. 30 minutes.
export const SESSION_GAP_MS = 30 * 60 * 1000;

// Carry-surface filename and H1 convention: `<agent>-carries.md` with an H1
// `# <agent> — Carries`. The name capture group is the agent prefix, which the
// H1↔filename agreement rule uses. A Carry entry names its clearance trigger
// with the `**Carry-clearance:**` marker. That is the existing live convention
// in `wiki/release-engineer.md § Message Inbox`, kept verbatim so the
// migration relocates the entry and does not re-mark it. One home so the
// audit's classifier (audit/scopes.js) and rules (audit/rules.js) cannot drift
// on the syntax.
export const CARRY_SURFACE_NAME_RE = /^(.+)-carries\.md$/;
export const CARRY_SURFACE_H1_RE = /^# (.+) — Carries$/;
export const CARRY_CLEARANCE_MARKER_RE = /\*\*Carry-clearance:\*\*/;

// One ISO date matcher inside the package: the marker scanner checks a
// `prior=` value with it, and the audit rules check claim dates with it.
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Storyboard XmR marker: `<!-- xmr:<metric>:<csv> [key=value]... [free text] -->`.
// Tokens are the `key=value` words that directly follow the CSV path, in any
// order. The first word without `=` begins free text (typically "Do not
// edit. Auto-generated."). A value may be empty, so a bare `key=` reaches
// the scanner as an unusable value. Capture groups: 1 metric, 2 csvPath,
// 3 the token run. One home so the scanner (marker-scanner.js) and the
// audit's balance check (audit/rules.js) cannot drift on the syntax.
export const XMR_OPEN_RE =
  /^<!--\s*xmr:([^:\s]+):(\S+)((?:\s+[^\s=>]+=[^\s>]*)*)(?:\s+[^>]*?)?\s*-->\s*$/;
// The keys the renderer honours, each with the block field it sets, the
// check its value must pass, and the placeholder a notice shows for it. One
// map, so a key added here gets all three in the same edit, and the
// renderer's known-token notice derives from it. The reasons are the one
// vocabulary the scanner writes and the renderer reads.
export const XMR_TOKENS = Object.freeze({
  event_type: {
    field: "eventType",
    placeholder: "<slice>",
    valid: (value) => value !== "",
  },
  prior: {
    field: "priorReadAnchor",
    placeholder: "<YYYY-MM-DD>",
    valid: (value) => ISO_DATE_RE.test(value),
  },
});
export const XMR_TOKEN_REASONS = Object.freeze({
  unknown: "unknown",
  repeated: "repeated",
  unusable: "unusable",
});
export const XMR_CLOSE_RE = /^<!--\s*\/xmr(?:\s+[^>]*?)?\s*-->\s*$/;
export const ISSUE_OPEN_RE =
  /^<!--\s*(obstacles|experiments):(open|closed)(?::(\d+d))?(?:\s+[^>]*?)?\s*-->\s*$/;
export const ISSUE_CLOSE_RE =
  /^<!--\s*\/(obstacles|experiments)(?:\s+[^>]*?)?\s*-->\s*$/;

// Materialized per-agent experiments surface. This is a distinct marker kind
// from `experiments:open`. It carries attributed, sanitized items plus a
// last-successful-sync stamp, and `gemba-wiki boot` reads it offline. One home
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
// suffix is mandatory and anchored at end. The title group is greedy, which is
// unambiguous because sanitizeTitle defuses any embedded ` (by ` token.
export const AGENT_EXPERIMENT_ITEM_RE =
  /^- #(\d+) \[([a-z][a-z-]*)\] (.*) \(by (.+)\)$/;
