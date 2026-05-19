# Plan 1060 Part 05 — Retroactive Wiki Migration (Eval Corpus)

Convert the existing `wiki/` into a state that audits clean against the
new contract, as if the protocol had been in force since the wiki's
first commit. The migrated wiki becomes the eval substrate for measuring
the system against a large historical corpus; greenfield-wiki evals
follow separately.

This part is a **user-directed deviation from spec § Out of scope**.
The spec disclaims backfill ("past logs remain as they are, append-
only"); the user adds it for eval purposes. See § Spec deviation for
the rationale and the audit-trail preservation strategy.

Libraries used: `@forwardimpact/libwiki` (constants from Part 01 —
`WEEKLY_LOG_LINE_BUDGET`, `DECISION_HEADING`, `ACTIVE_CLAIMS_HEADING`;
audit primitives from Part 01 Step 6 for post-migration verification).
The M-way partition algorithm (Step 2) is **net-new code in
`src/commands/migrate.js`**, not a reuse of Part 01's `rotate` —
`rotate` performs a 1-way rename of the current live file, while
migration partitions a single oversize sealed file into N parts and
deletes the source. No new external dependencies.

## Spec deviation

Spec § Out of scope, deferred (line 222–224):

> **Backfill of past weekly logs to the new contract.** If the
> redesign imposes a weekly-log budget or a Decision-block requirement,
> past logs remain as they are (append-only). The cutover date is named
> in the design, not the spec.

Part 05 backfills anyway. Three points justify the deviation:

1. **Eval substrate.** The user names the migrated wiki as the
   high-fidelity stress test for the new system. Measuring `boot`,
   `audit`, and `log` against a fresh greenfield wiki proves nothing;
   measuring them against 21 weeks of historical content does.
2. **Strict audit gate.** Part 04 installs the audit on Stop-hook and
   in CI. The 31 over-budget weekly logs and the over-cap
   `release-engineer.md` summary (planning-time `wc -l` = 84, target
   ≤80 — re-derive at PR-open time) would re-fail the gate every run
   after the grace window expires; Part 05 retires the grace instead
   of perpetually extending it.
3. **Audit-trail preservation by git.** The git history of the
   monorepo wiki repo preserves every pre-migration file byte-for-byte
   at the prior commit hash; the migration commit is a single,
   reviewable diff that does not destroy past state, only reorganizes
   its physical layout.

The deviation has two concrete parts:

- **Backfill of past weekly logs** (Steps 2 and 3) — spec § Out of scope.
- **Deletion of original sealed `<agent>-YYYY-Www.md` files** (Step 2,
  source files become N parts). Design § Cross-cutting choices says
  rotation "seals the prior part *before* appending" — that semantics
  assumes the live file becomes part 1 and a fresh live file is
  created; for sealed historical files there is no live file to keep,
  so the source is removed. The git history preserves the original
  file at the prior commit; the audit trail survives at the SCM layer.

Spec § Success Criteria row 13 ("The corpus stays the diagnostic")
disallows editing the research corpus pages
`wiki/memory-protocol-*-2026-05-16.md`. Part 05 **does not touch
those files** — only weekly logs and summaries.

If the approver rejects this deviation in PR review, Part 05 is
dropped and a follow-up spec must own the audit-grace lifecycle:
who renews the grace var, on what cadence, and what condition
reopens the question. The release engineer extends the grace var
in 30-day windows until that follow-up spec lands. Surface the
rejection trade-off in the PR description so the lifecycle is
visible to the approver.

## Step 1 — Migration script skeleton

Created: `libraries/libwiki/src/commands/migrate.js`.

Exports `runMigrateCommand(values, args, cli)`. The subcommand is
registered as `fit-wiki migrate` in `bin/fit-wiki.js`, but is **not**
part of the public CLI contract documented in the protocol — it is a
one-shot administrative tool. Mark with `description: "(internal,
one-shot) Retroactively migrate the wiki to the redesigned contract."`
in libcli registration.

Options:
- `--dry-run` (boolean) — print every planned change to stdout; touch nothing on disk.
- `--apply` (boolean) — execute the planned changes. Mutually exclusive with `--dry-run`; one must be present.
- `--wiki-root <path>` (string) — override (default: auto-detect via Finder).

The handler dispatches to Steps 2–5 below in order. Each step reports
to stdout a one-line summary before doing work; `--dry-run` short-
circuits before any write.

Created: `libraries/libwiki/test/cli-migrate.test.js` — covers
`--dry-run` parity (no filesystem changes), `--apply` idempotence
(second run is a no-op), and the four sub-steps individually with
fixture wikis.

Verification: `bun test test/cli-migrate.test.js` passes; a manual
`bunx fit-wiki migrate --dry-run` against the current wiki prints the
expected change set without modifying any file.

## Step 2 — Partition over-budget weekly logs

Two distinct cases:

**(A) Sealed historical files** (every week strictly before the
current ISO week, e.g. W14–W20 at planning time): for every
`wiki/<agent>-YYYY-Www.md` whose `wc -l > WEEKLY_LOG_LINE_BUDGET`
(500), produce an M-way partition.

Entry-boundary regex (use this literal pattern, not the conceptual
`## YYYY-MM-DD` shorthand — actual entry headings carry day annotations
like `## 2026-05-02 (W19-day1 — spec 660-map design)`):

```js
const ENTRY_RE = /^## \d{4}-\d{2}-\d{2}(?:[\s(].*)?$/m;
```

Algorithm:

1. Read the file. Split on `ENTRY_RE` to obtain `[h1Preamble, entry1, entry2, ...]`.
2. Pack entries into chunks where each chunk's cumulative line count
   (including the repeated H1 + annotation, see Step 4 below) stays
   ≤500. Boundaries fall at entry headings only — never mid-entry. If
   a single entry exceeds 500 lines, place it in its own chunk
   regardless (Step 3 records this as a finding for human review;
   migration does not split a single entry).
3. Write the chunks as `<agent>-YYYY-Www-part1.md`, `…-part2.md`, …
   in the same `wiki/` directory. Each part begins with the H1
   `# {Agent Title} — YYYY-Www (part N of M)`. Parts 2..M omit the
   H1 from the byte-equivalence calculation (see verification).
4. The original `<agent>-YYYY-Www.md` file is **deleted** — its
   content has moved into the parts. The week's data is the union of
   the parts; no live file remains for sealed weeks. This is the
   second concrete deviation noted in § Spec deviation.

**(B) Current week file** (`2026-W21.md` at planning time, exact week
re-derived at PR-open time): leave as a live file under Part 01's
`rotate` convention. If the file already exceeds 500 lines at
migration time, call `bunx fit-wiki rotate --agent <name>` — that
primitive renames the existing file to `…-Www-part1.md` (sealed) and
creates a fresh empty `…-Www.md` (live). This is the rotation
convention every future `log` call observes. If `rotate` itself
needs to land an M-way partition for an oversize current week, the
migrate command falls back to the (A) algorithm followed by a fresh
live file creation. Subsequent `log` writes always append to the
unsuffixed `…-Www.md`.

For weekly logs that fit under 500 lines as-is: no change.

Expected scope (re-derive at PR-open time): 31 files over the cap;
largest `staff-engineer-2026-W19.md` at 1909 lines → 4 parts (4 ×
500 ≥ 1909); estimated total parts produced ≈ `Σ ceil(lines_i / 500)`
across the 31 source files ≈ 93.

Verification:
- `bunx fit-wiki audit --legacy-only` (post-rotation, no grace var) reports zero weekly-log-cap violations.
- `git diff --stat` shows the deletion of 31 oversize files and creation of ~93 part files.
- Byte-equivalence test (asserted in `cli-migrate.test.js`): for each rotated file, concatenate `partN`'s body content (skipping each part's H1 except for part 1) and compare against the original file's body. Bytes must match exactly. The H1-strip normalisation is the only permitted divergence.

## Step 3 — Backfill `### Decision` blocks

573 dated entries exist across all weekly logs at planning time; 433
already lead with `### Decision`; **140 entries need backfill stubs**
(re-derive at PR-open time).

Scope: scan **every weekly-log file** (post-partition, so both
`<agent>-YYYY-Www.md` live files and `<agent>-YYYY-Www-partN.md` parts
are in scope). Use the same `ENTRY_RE` from Step 2.

For each matched entry heading where the next non-blank line is
**not** `### Decision`, insert immediately after the date heading:

```markdown
### Decision

*Retroactively reconstructed during spec 1060 migration. The original
entry predates the Decision-block contract; Surveyed / Alternatives /
Chosen / Rationale not recoverable from the entry text alone. Original
entry follows.*
```

The stub is mechanical — no attempt is made to reverse-engineer the
fields. A reader sees the stub, knows the entry is historical, and
reads the original content beneath it.

**Idempotence by content match**: skip entries where any of the
following hold (any one suffices):
1. The next non-blank line after the entry heading is `### Decision`.
2. The literal stub paragraph (first sentence
   `Retroactively reconstructed during spec 1060 migration.`) appears
   in the entry's body.

Both rules together ensure a re-run is a no-op for both genuine
historical Decision blocks and previously-backfilled stubs. The
content-match guard (rule 2) is the load-bearing one for re-runs
against the migrated tree.

Verification:
- `bunx fit-wiki audit` post-backfill reports zero decision-block-opening violations.
- `rg -c "^### Decision" wiki/*-2026-W*.md wiki/*-2026-W*-part*.md` total equals the **exact** entry count from Step 2 (573 + any new W21 entries written during the migration window — record the expected total at PR-open time, no ±tolerance).
- A spot check on 5 random pre-backfill entries shows the original content intact beneath the stub.
- A re-run of `bunx fit-wiki migrate --dry-run` after a successful `--apply` reports zero planned changes (asserted by `cli-migrate.test.js`).

## Step 4 — Compact over-cap summaries

Use `bunx fit-wiki audit --legacy-only` output as the worklist: every
file flagged for `summary-budget` violation is in scope. At planning
time the audit reports `release-engineer.md` (84 lines, 4 over) as
the sole violator; re-derive at PR-open time.

For each over-cap summary `wiki/<agent>.md`:

1. Read the file. Identify trailing or middle-of-file historical
   content (closed PRs, resolved blockers, week-old "Last run" recap
   fragments) — the bottom of the file is the usual target but the
   "Last run" line and `## Open Blockers` section stay.
2. Move that content into a new dated entry in the current week's log
   `wiki/<agent>-YYYY-Www.md` (the live file post-rotation per Step 2
   case B). Heading: `## YYYY-MM-DD` (today). The entry **emits its
   own `### Decision` stub** — Step 3 does not re-run, so Step 4 is
   self-sufficient. Stub body: `Compaction backfill during spec 1060
   migration — content moved from <agent>.md summary to satisfy the
   80-line cap. Original summary location at commit <parent-hash>.`
3. Trim `<agent>.md` to ≤80 lines, preserving the order: H1,
   `**Last run**:`, `## Message Inbox` (with `<!-- memo:inbox -->`
   marker), state H2s, `## Open Blockers`.

Verification:
- `wc -l wiki/<agent>.md` ≤ 80 for every summary listed by the worklist.
- `bunx fit-wiki audit` reports zero summary-budget violations.
- The moved content is locatable in the current week's log under the new dated entry.
- The new dated entry carries a `### Decision` stub (Step 4 self-emitted, not Step 3 re-run).

## Step 5 — Active Claims seed verification

The `## Active Claims` section is seeded by Part 02 with the empty-
state row (`| *None* | — | — | — | — | — |`). Part 05 leaves Active
Claims at the empty state.

Rationale: claims are imperative artifacts — they say "I am working on
X right now" — and nobody is saying that during a migration. The
first post-migration `claim` call seeds the schema by example, which
the agent fleet observes via `boot` and imitates on subsequent runs.

The Cross-Cutting Priorities section is left untouched — that surface
is `kata-wiki-curate`'s domain and adjusting it during migration would
collide with `kata-wiki-curate`'s current responsibilities.

Verification: `bunx fit-wiki audit` reports zero Active Claims schema
violations.

## Step 6 — Retire the audit grace window

Modified: `.github/workflows/<host>.yml` (the file Part 04 added the
audit step to).

Remove the step-level `env: FIT_WIKI_AUDIT_GRACE_UNTIL: "..."` line
introduced by Part 04 Step 1. The audit now runs in strict mode against
the migrated wiki.

Modified: `.claude/settings.json`. The Stop-hook entry installed by
Part 04 Step 2 stays as-is (no grace-var to remove there — the
Stop-hook never set one; agents who hit a Stop-hook audit failure
investigate locally).

Verification:
- `rg "FIT_WIKI_AUDIT_GRACE_UNTIL" .github/` returns zero hits.
- A test commit that adds an 81-line agent summary fails CI. Revert before merge.
- `bunx fit-wiki audit` against the migrated wiki exits 0 with `RESULT: pass`.

## Step 7 — Eval-corpus annotation in spec

Created: `specs/1060-memory-protocol-redesign/eval-corpus.md`.

Document (≤80 lines) recording:

- **Commit hashes** — Migration commit on monorepo `main`; pre-migration commit on the wiki repo (the last commit before the migration commit).
- **File-count delta** — 31 files deleted, ~93 part files created, N summaries trimmed (substitute real N at PR time).
- **Rename map** — Two-column table mapping each deleted source file to its part files, so a future eval can reconstruct which physical file holds which content.
- **Audit baseline** — Path to the saved `bunx fit-wiki audit --format json` snapshot at the migration commit. Snapshot lives at `specs/1060-memory-protocol-redesign/audit-baseline-post-1060.json` (in the monorepo, not the wiki — keeps the audit-clean wiki invariant: a snapshot file in `wiki/` would itself appear in audit scope).
- **Eval invariants** — Bulleted list anchoring future eval scaffolds:
  - 21 weeks of data present (W14 through current week).
  - Decision-block ratio: 100% post-migration (every dated entry leads with `### Decision` or a backfill stub).
  - Weekly-log line distribution: max ≤500 lines per file.
  - Summary line distribution: max ≤80 lines per `<agent>.md`.
  - Active Claims at empty state (no inherited claims from pre-migration).
  - Research-corpus pages (`wiki/memory-protocol-*-2026-05-16.md`) untouched.

This document is the eval substrate's manifest. Future eval scaffolds
(greenfield-wiki, partial-rotation, no-decision-block) reference it.

Verification: the file exists; both hashes are real commits; the audit
baseline JSON parses and shows `result: pass`; the invariants list
matches the migrated state (asserted by a follow-on test that reads
`eval-corpus.md` and re-checks each invariant against `wiki/`).

## Risks (Part 05 only)

- **The migration commit is large.** Git diff will show ~100 file
  renames/creations and a 100+ KB delta. To make the diff reviewable,
  split Part 05 into **two commits** on the same branch:
  - Commit A: `feat(libwiki): add migrate subcommand` — Step 1 plus
    tests in `cli-migrate.test.js`. Small, code-only, reviewable.
  - Commit B: `migrate(wiki): retroactive protocol compliance per spec 1060` —
    the mechanical output of Steps 2–7 against the live wiki, plus
    `eval-corpus.md`. Large in line count, all wiki content.
  The PR description names commit B as skim-not-read and points
  reviewers at commit A as the reviewable surface.
- **Backfill stubs change the readable wiki.** A future reader of an
  old weekly-log entry sees a migration stub above the original
  content. The stub names the migration explicitly to avoid confusion
  about whether the stub is contemporaneous. Acceptable cost for the
  audit-clean state.
- **Same-PR landing ordering** — single recommended ordering, not "or":
  the branch carries commits in order 01 → 02 → 03 → 04 → 05A → 05B.
  Part 04 sets `FIT_WIKI_AUDIT_GRACE_UNTIL` to `today + 30d` so every
  per-commit CI run between 04 and 05B sees a tolerant gate; commit
  05B retires the grace var as part of the same commit that produces
  the audit-clean state. CI on 05B sees a strict gate against the
  migrated wiki — green. The release engineer does no follow-up
  commit; the system is consistent at every commit on the branch.
- **Idempotence.** The migration script must be safe to re-run. Step 2
  guards by `(part N of M)` in the H1 (sealed files no longer exist,
  so the partition does not re-fire). Step 3 guards by content match
  on the literal stub paragraph (the structural-position guard is
  insufficient because Step 4 may have added new dated entries with
  stubs). Step 4 skips summaries already ≤80 lines. The test suite
  asserts a re-run of `migrate --dry-run` after `migrate --apply`
  reports zero planned changes.
- **`--dry-run` parity.** The test captures each step's planned
  actions in dry-run mode, replays them in apply mode, then diffs the
  resulting filesystem against the dry-run expectations. Byte-for-byte
  parity required.
- **Append-only-audit semantics (deletion deviation).** Spec § Decision
  area 2 says rotation preserves append-only-audit "by the chosen
  mechanism or its loss is named in the design with the rationale".
  The migration deletes the original `<agent>-YYYY-Www.md` for sealed
  weeks; the git history preserves the prior state. This deletion
  semantics is a second deviation from the spec, lifted to § Spec
  deviation above (alongside backfill). If a future change wants
  symmetric live + sealed rotation for fresh weeks, that uses Part 01's
  `rotate` primitive which preserves the live-file path.
- **`--legacy-only` flag exists.** Step 2 verification calls
  `bunx fit-wiki audit --legacy-only`; Part 01 Step 6 mentions the
  flag for parity testing only. When implementing, surface
  `--legacy-only` in Part 01's `audit` options block so it is a
  shipped CLI flag, not just a development helper.
