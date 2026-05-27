# Plan 1060 Part 01 — libwiki CLI Primitives

Add the subcommands that realize the redesigned protocol. No protocol or
agent files change in this part — those land in 02 and 03 once the
primitives exist. Build under `libraries/libwiki/`; commit the full part as
one atomic commit on `feat/memory-protocol-redesign`.

Libraries used: `@forwardimpact/libcli` (createCli, dispatch),
`@forwardimpact/libutil` (Finder), `@forwardimpact/libmock` (test
helpers in test files only).

## Step 1 — `MEMORY_FILE` and `ACTIVE_CLAIMS_HEADING` constants

Created: `libraries/libwiki/src/constants.js` (modify existing).

```js
// Weekly log cap derivation: ≤2.5% of 1M-token context window = 25k
// tokens; ≈42 tokens/line empirical proxy → ~500 lines. See spec 1060
// design-a.md § Decision area 2 for the full anchor.
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
export const WEEKLY_LOG_LINE_BUDGET = 500;
export const SUMMARY_LINE_BUDGET = 80;
export const CUTOVER_ISO_WEEK = "2026-W23";
```

Re-export from `src/index.js`.

Verification: `bun test test/marker-scanner.test.js` still passes
(constants imported by upcoming modules; no behaviour change).

## Step 2 — `active-claims.js` (parser + writer)

Created: `libraries/libwiki/src/active-claims.js`.

Exports:
- `parseClaims(memoryText)` → `[{ agent, target, branch, pr, claimed_at, expires_at }]`. Returns `[]` when `## Active Claims` heading is missing (silent tolerance per design § Cross-cutting choices).
- `appendClaim(memoryText, claim, today)` → `{ text, inserted }`. Inserts a row after the existing table; creates header + separator if absent. Refuses (`inserted: false`) if a row with the same `(agent, target)` already exists.
- `removeClaim(memoryText, { agent, target })` → `{ text, removed }`. Idempotent — `removed: false` when no matching row.
- `filterExpired(claims, today)` → `{ active, expired }`. Active = rows whose `expires_at >= today`.

The parser uses line-prefix scanning, not regex over the whole file, to
keep behaviour deterministic when the table is the last section.

Created: `libraries/libwiki/test/active-claims.test.js` covering:
- parse with empty / missing / present sections
- append idempotence for `(agent, target)` duplicates
- remove returns `removed: false` for unknown rows
- `filterExpired` splits on ISO date comparison

Verification: `bun test test/active-claims.test.js` passes.

## Step 3 — `weekly-log.js` (rotation + append)

Created: `libraries/libwiki/src/weekly-log.js`.

Exports:
- `weeklyLogPath(wikiRoot, agent, today)` → `wiki/{agent}-YYYY-Www.md`. Uses a manual ISO 8601 week computation (Thursday-of-week algorithm) — no `Intl.DateTimeFormat` (cross-runtime instability on edge weeks; see Risks).
- `rotateIfOverBudget(wikiRoot, agent, today, fs)` → `{ rotated, fromPath, toPath }`. If the current file's `wc -l + appendLines > WEEKLY_LOG_LINE_BUDGET`, rename to `{agent}-YYYY-Www-partN.md` (N = next free integer ≥ 1) and create a fresh file with the H1 heading.
- `appendEntry(path, body, fs)` → appends `\n` + body to the file, creating it (with H1) if missing.

The rotation reads the file once to count lines; the append never
rewrites existing bytes.

Created: `libraries/libwiki/test/weekly-log.test.js` covering:
- rotation at exactly the line budget (boundary)
- part numbering increments correctly on multiple rotations
- append creates the file with H1 when missing
- rotation preserves prior content byte-for-byte (read-then-rename, no rewrite)

Verification: `bun test test/weekly-log.test.js` passes.

## Step 4 — `boot.js` (digest builder)

Created: `libraries/libwiki/src/boot.js`.

Exports:
- `buildDigest({ wikiRoot, agent, today, fs, gh })` → JSON object matching design § Digest schema:
  ```
  { summary, owned_priorities[], cross_cutting[], claims[], storyboard_items[], inbox_count, storyboard_path }
  ```
- `summary` is the first paragraph of `wiki/{agent}.md` after the H1 (string).
- `owned_priorities` and `cross_cutting` parse the MEMORY.md priority table; `owned_priorities` filters to rows where `Owner == agent`.
- `claims` calls `filterExpired(parseClaims(memoryText), today).active`.
- `storyboard_items` parses the current storyboard's per-agent H3 section (e.g. `### staff-engineer — spec`) when present; falls back to `[]`.
- `inbox_count` counts bullets immediately after `<!-- memo:inbox -->` until the next blank or H2.

Missing-section tolerance: every field defaults to its empty form
(`""`, `[]`, `0`) when the surface is absent (design § Cross-cutting
choices, silent tolerance).

Created: `libraries/libwiki/test/boot.test.js` covering:
- digest against a fixture wiki with all surfaces present
- digest against a wiki with `## Active Claims` missing (silent tolerance)
- digest against a wiki with no storyboard file (`storyboard_items: []`)
- digest against a 106-line `{self}.md` (audit-grace cohort case)

Verification: `bun test test/boot.test.js` passes.

## Step 5 — Command modules

Created files, each exporting `runXCommand(values, args, cli)`:

| File | Subcommand | Behaviour |
|---|---|---|
| `src/commands/boot.js` | `boot` | Calls `buildDigest`; writes JSON to stdout. With `--format markdown`, renders the same content as Markdown. Reads only. |
| `src/commands/log.js` | `log decision` / `log note` / `log done` | Resolves project root; calls `rotateIfOverBudget` then `appendEntry`. `decision` writes the leading `### Decision` block with `--surveyed --chosen --rationale --alternatives`. `note` writes `### {--field}` + `--body`. `done` writes a `### Closed` line then closes the run entry. Sub-dispatch: the bin file registers `log` as one libcli command with `args: "[subcommand]"`; the handler reads the positional, looks up the sub-handler in a `{ decision, note, done }` map, exits 2 with usage on miss. |
| `src/commands/claim.js` | `claim` / `release` | `claim` calls `appendClaim` with `--target --branch [--pr] [--expires-at]` (default `today + 7d`); refuses duplicates with exit 2. `release` calls `removeClaim`; `release --expired` removes every row past `expires_at`. Two separate libcli commands (no sub-dispatch). |
| `src/commands/inbox.js` | `inbox list` / `ack` / `promote` / `drop` | Parses `## Message Inbox`. `list` writes JSON. `ack` removes a bullet by index. `promote` removes the bullet and appends a row to MEMORY.md `## Cross-Cutting Priorities`. `drop` removes the bullet. Sub-dispatch: same pattern as `log` — one libcli command, positional subcommand, `{ list, ack, promote, drop }` lookup. |
| `src/commands/rotate.js` | `rotate` | Explicit rotation primitive (uses `rotateIfOverBudget` with `force: true`). |
| `src/commands/audit.js` | `audit` | Pure-JS port of `scripts/wiki-audit.sh` + new checks (see Step 6). |

Each command file exports `runXCommand(values, args, cli)` with the
exact signature used by `src/commands/memo.js` line 50, and starts with
the Finder pattern from `src/commands/memo.js` lines 70–73:

```js
const logger = { debug() {} };
const finder = new Finder(fsAsync, logger, process);
const projectRoot = finder.findProjectRoot(process.cwd());
```

Where applicable, `wikiRoot` and `agentsDir` derivation mirrors
`memo.js` lines 74–75 (`values["wiki-root"]` override → project-root
join).

`inbox promote` writes a new row into MEMORY.md `## Cross-Cutting
Priorities` using the table header from `constants.js`
(`PRIORITY_INDEX_TABLE_HEADER` = `| Item | Agents | Owner | Status |
Added |`). The promoted-from agent's name becomes the default Owner
unless `--owner` overrides; `Status` defaults to `active`; `Added`
defaults to today's ISO date. The bullet text becomes `Item`.

Verification per file: `bun test test/cli-{name}.test.js` (one new test
file per command, structured like `test/cli-memo.test.js`).

## Step 6 — `audit` (absorb `scripts/wiki-audit.sh`)

`src/commands/audit.js` ports every check in `scripts/wiki-audit.sh` to
JS — summary budget, summary sections (Message Inbox first H2, Open
Blockers last), weekly log filename + heading, priority index schema —
plus four new checks:

1. **Weekly log line budget (cutover-gated).** For files whose week is `>= CUTOVER_ISO_WEEK`, `wc -l <= WEEKLY_LOG_LINE_BUDGET`. Pre-cutover files exempt.
2. **Decision-block opening.** Every `## YYYY-MM-DD` entry in current-week logs is followed (within 5 non-blank lines) by `### Decision`.
3. **Active Claims schema.** When `## Active Claims` is present, table header matches `ACTIVE_CLAIMS_TABLE_HEADER`; every row has 6 cells; `expires_at` parses as ISO date.
4. **Expired claims.** Rows past `expires_at` report as findings (not errors) so `release --expired` cleanup is observable.

First-run grace: when `FIT_WIKI_AUDIT_GRACE_UNTIL` env var is set to an
ISO date `>= today`, the **summary-budget** check and **decision-block
opening** check report findings but do not exit non-zero. Design § CLI
Surface only names summary violations explicitly; the decision-block
check is included in the grace because pre-cutover weekly logs lack the
leading `### Decision` block (the contract is newly mechanised here),
so failing the gate on pre-existing entries blocks every PR. Document
this widening in the redesigned protocol (Part 02) so the grace scope
is contracted, not implicit. All other findings (priority schema,
weekly-log filename, Active Claims schema, expired claims) fail
regardless. The grace var is set in CI by Part 04 to expire 7 days
after merge.

Output: human-readable lines to stdout, with a final `RESULT: pass` or
`RESULT: fail (N checks failed)`. JSON output via `--format json` for
programmatic consumers. `--legacy-only` flag runs only the checks the
old `scripts/wiki-audit.sh` carried (summary budget, summary sections,
weekly-log filename, priority index) and skips the four new checks
introduced by this step — needed for development-time parity and for
Part 05's per-step verification.

Created: `libraries/libwiki/test/cli-audit.test.js` covering each new
check plus the grace-var behaviour.

Verification: `bun test test/cli-audit.test.js` passes; running
`node bin/fit-wiki.js audit --legacy-only` against the current `wiki/`
produces the same fail count as `bash scripts/wiki-audit.sh` (parity
check on the legacy-check subset during development; the new checks —
Active Claims, decision-block, cap — are surfaced separately with
`--legacy-only` off). The shell script is deleted in Part 04.

## Step 7 — `refresh` extension (obstacle/experiment markers)

Modified: `libraries/libwiki/src/marker-scanner.js`.

Extend `OPEN_RE` to also match
`<!--\s*(obstacles|experiments):(open|closed)(?::\d+d)?\s*-->`. Return
a discriminated union: `{ kind: 'xmr', metric, csvPath, ... }` or
`{ kind: 'issue-list', topic, state, window, ... }`.

Modified: `libraries/libwiki/src/block-renderer.js`. Add an
`issue-list` branch that shells `gh issue list --label <topic>
--state <state> --json number,title,labels,closedAt`, filters Concluded
by `closedAt >= today - 7d` (or the suffix-specified window), and
renders one bullet per issue: `- **{owner-label or topic} Exp N
(#NNN) — {title}**`. On `gh` failure, emit empty block content and
write a stderr warning (design § Trade-offs).

Modified: `src/commands/refresh.js`. Pass `gh` invoker through (DI so
tests can stub).

Created: `libraries/libwiki/test/issue-list-block.test.js` covering:
- open obstacles render under `<!-- obstacles:open -->`
- closed experiments respect the 7-day window
- `gh` failure produces empty block + stderr warning, leaves XmR blocks
  intact

Verification: `bun test test/cli-refresh.test.js test/issue-list-block.test.js` passes.

## Step 8 — `init` (Active Claims scaffold + Stop-hook entry)

Modified: `libraries/libwiki/src/commands/init.js`.

After the existing clone/identity/metrics block:

1. Read `wiki/MEMORY.md`. If `## Active Claims` heading is absent,
   append the section with header row + separator + empty
   `| *None* | — | — | — | — | — |` row. The audit parser (Step 6
   check #3) treats this empty-state row as the explicit empty-state
   convention — first cell `*None*` skips schema validation, mirroring
   the existing priority-index pattern.
2. Read `.claude/settings.json` (relative to projectRoot). Schema-aware
   merge logic:
   - If the file does not exist: create
     `{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "bunx fit-wiki audit" }] }] } }`.
   - If `hooks.Stop` is absent or empty: add a new matcher group with
     the audit entry.
   - If `hooks.Stop[N].hooks` already contains an entry whose `command`
     contains `fit-wiki audit`: no-op (idempotent).
   - Otherwise: append `{ "type": "command", "command": "bunx fit-wiki audit" }`
     to `hooks.Stop[0].hooks` alongside the existing `just wiki-push`
     entry. Preserve all other top-level keys and other hook groups
     byte-for-byte where possible (use a structured read-parse-write
     with JSON `stringify`-indent-2; never overwrite or rewrite the
     file).
3. Idempotent re-run: a second `init` makes no changes to MEMORY.md or
   settings.json.

Modified: `libraries/libwiki/test/cli-init.test.js`. Add cases for:
- fresh MEMORY.md without `## Active Claims` → section added with empty row
- existing MEMORY.md with section → not duplicated
- settings.json **absent** → file created with the minimal shell
- settings.json with `hooks.Stop` absent → group added
- settings.json with `hooks.Stop` present, no audit entry → entry appended; existing `just wiki-push` preserved
- settings.json with audit entry already → no change (idempotent)

Verification: `bun test test/cli-init.test.js` passes.

## Step 9 — `bin/fit-wiki.js` wiring

Modified: `libraries/libwiki/bin/fit-wiki.js`.

Register the new subcommands in the `commands` array of `definition`:
`boot`, `log`, `claim`, `release`, `inbox`, `rotate`, `audit`. Each
carries `args`, `options`, and `description`. Add the new handlers to
the `COMMANDS` map.

The `audit` subcommand's options block must include `--legacy-only`
(boolean) and `--format` (string, default `text`, allowed `text|json`)
— `--legacy-only` is named in Step 6 and load-bearing for Part 05's
per-step verification (`bunx fit-wiki audit --legacy-only`), so it
ships as a real CLI flag, not a development-only helper.

`log`, `inbox` are routed to a sub-dispatcher inside their handler
because they carry sub-subcommands (`decision|note|done` /
`list|ack|promote|drop`).

Append matching `examples` entries:

```
fit-wiki boot
fit-wiki log decision --surveyed "..." --chosen "..." --rationale "..."
fit-wiki claim --target spec-1060 --branch claude/...
fit-wiki release --target spec-1060
fit-wiki inbox list
fit-wiki rotate
fit-wiki audit
```

Bump `package.json` version to the next minor of whatever `version`
field is on `main` at implementation time (additive surface — minor
bump). Planning-time value is `0.1.5` so the bump targets `0.2.0`;
verify before committing.

Verification: `node bin/fit-wiki.js --help` shows the new subcommands;
`node bin/fit-wiki.js audit` runs end-to-end against the live `wiki/`
(grace var set so summary violations don't fail).

## Risks (Part 01 only)

- **ISO week derivation across runtimes.** `Intl.DateTimeFormat` differs
  between Node and Bun on edge weeks. Step 3 uses a manual ISO 8601
  computation, not Intl.
- **`gh issue list` JSON-shape stability.** Pin to the specific fields
  the parser uses; ignore unknown fields. A breaking gh change is
  observable at marker-rendering time, not at boot.
- **`### Decision` block on pre-cutover entries.** Audit check #2
  fires retroactively on every `## YYYY-MM-DD` entry without a leading
  `### Decision`. The grace var documented in Step 6 covers this until
  the 7-day window closes; the alternative — skipping the check on
  pre-cutover-week entries — is rejected because the contract is
  "Decision-block opening required from cutover forward" and pre-cutover
  is a soft-launch, not an exemption.
