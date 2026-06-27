# Plan 0590-A Part 03 — Wiki Cleanup Under New Protocol

**Agent:** technical-writer **Depends on:** parts 01 and 02 merged to `main`
**Branches (two):**

1. **Wiki branch** — commits go directly to the `wiki/` submodule on `master`
   (no GitHub PR is opened for the wiki repo). Follow the `kata-wiki-curate`
   skill's "Publishing changes" section —
   `cd wiki && git push origin HEAD:master`, or let the `Stop` hook run
   `just wiki-push`. Carries: the summary migrations, MEMORY.md priority-index
   seeding, weekly log hygiene fixes, and the metrics CSV row from Step 5.
2. **Monorepo branch** — `fix/spec-0590-status-plan-implemented` from `main`.
   One-line edit to `specs/STATUS` (the `0590 plan approved` row becomes
   `0590 plan implemented`). Standard docs-type PR via
   `mcp__github__create_pull_request`, merged through the usual PM gate. This is
   the only monorepo change in part 03.

Keeping the two changes on two branches matches the design's wiki/monorepo split
and mirrors the pattern used by `kata-wiki-curate`'s "Publishing changes"
guidance.

## Goal

Migrate the existing wiki content to conform to the protocol established in
part 01. At the end of this part, `just wiki-audit` (from part 02) returns a
clean zero-failure verdict. This is the final step of spec 0590.

This part is intentionally routed to the **technical-writer agent** because wiki
curation — deciding what counts as state vs. history, which cross-cutting items
belong in the index, how to preserve meaning while trimming lines — is
technical-writer scope. The staff-engineer must not perform this migration; the
agent skilled at prose is the right executor.

## Step 0 — Preconditions

Confirm before starting:

- `git show main:specs/STATUS` shows spec 0590 at exactly `plan approved`. Parts
  01 and 02 do **not** advance STATUS (per plan-a.md § Execution); STATUS stays
  at `plan approved` from human approval through the end of part 02. Step 6 of
  this part is what advances it to `plan implemented`. If the row reads anything
  else, stop — either the plan has not been approved yet, or a prior part
  mistakenly advanced it.
- `git show main:.claude/agents/references/memory-protocol.md` contains the
  `## Summary Contract`, `## Weekly Log Contract`, and
  `## Cross-Cutting Priority Index` sections (part 01 landed).
- `git show main:scripts/wiki-audit.sh` exists (part 02 landed).
- `just wiki-audit` runs from the repo root and currently prints failures for at
  least product-manager, improvement-coach, and security-engineer summary files.

If any precondition fails, stop and surface the gap.

## Step 1 — Populate `wiki/MEMORY.md` priority index

Run `kata-wiki-curate` Step 5's new logic (per part 01): scan all agent
summaries and recent weekly logs for cross-cutting items. For each item, write a
row to the `## Cross-Cutting Priorities` table with the schema **Item / Agents /
Owner / Status / Added**.

Expected seed entries (from the spec's evidence section, verified against
current wiki state on the branch). Agent slugs only — no `PM`/`TW`/`RE`
abbreviations; the audit in part 02 expects slugs and the acceptance criterion
below enforces this:

| Candidate                                               | Affected agents                                     | Owner            | Status | Notes                                                                |
| ------------------------------------------------------- | --------------------------------------------------- | ---------------- | ------ | -------------------------------------------------------------------- |
| Spec 0590 migration in flight                            | all                                                 | technical-writer | active | Remove when this part merges                                         |
| Spec 0420 documentation debt (46+ accuracy errors)       | technical-writer, staff-engineer, product-manager   | technical-writer | active | Names the largest outstanding doc item                               |
| Formatting regressions on main (direct-to-main merges)  | all                                                 | release-engineer | active | Referenced by improvement-coach, release-engineer, security-engineer |
| Harness-level `.claude/skills/` write protection (#441) | staff-engineer, security-engineer, technical-writer | human            | active | Blocks agent self-maintenance                                        |

Do not invent entries. If a candidate is already resolved in the current wiki
state, do not add it. If more than 10 active entries are identified, defer the
lowest-severity ones to agent-to-agent `Observations for Teammates` sections —
the cap is a forcing function for importance, not a silent truncation.

Remove the empty-state row once at least one real entry is written.

### Acceptance

- `wiki/MEMORY.md` priority table has between 1 and 10 active rows.
- Every affected agent is named by its slug (e.g., `technical-writer`, not
  "TW").
- `just wiki-audit` no longer prints the `FAIL memory` line.

## Step 2 — Migrate each summary file

For each `wiki/<agent>.md`, bring it under the 80-line budget and into contract
conformance. Work in this order (largest first, so budget pressure is resolved
before section-order fixes):

| File                        | Current lines | Target | Primary action                                      |
| --------------------------- | ------------: | ------ | --------------------------------------------------- |
| `wiki/security-engineer.md` |           164 | ≤ 80   | Move W17 Day-by-day Outcomes sections to weekly log |
| `wiki/improvement-coach.md` |           137 | ≤ 80   | Compact `## Recurring Patterns` (11 bullets)        |
| `wiki/product-manager.md`   |           130 | ≤ 80   | Delete `## Previously Tracked PRs` (32-row table)   |
| `wiki/technical-writer.md`  |            86 | ≤ 80   | Trim `## Resolved Since Last Summary` (move to log) |
| `wiki/staff-engineer.md`    |            72 | ≤ 80   | Already within budget — verify section order only   |
| `wiki/release-engineer.md`  |            64 | ≤ 80   | Already within budget — verify section order only   |

**Migration rules (apply uniformly):**

- **Historical audit data → weekly log.** "Previously Tracked PRs", "W{N} Day X
  Outcomes", "Recently Closed", "Evaluation History", "Resolved Since Last
  Summary" — move the content to the agent's current weekly log under a
  `## YYYY-MM-DD` section marked `### Migrated from summary on 2026-04-23`. Do
  not delete content without first appending it to the log. Git history alone is
  not the archival mechanism (the design permits deletion but only where the
  content already exists in logs).
- **Storyboard commitments → storyboard file.** If a summary has a
  `## Storyboard Commitments` section, delete it from the summary; verify the
  same information is in `wiki/storyboard-2026-M04.md` (it almost certainly is,
  because the storyboard is authoritative).
- **Metrics tables → CSV.** If a summary has a `## Metrics` section with more
  than a reference to `wiki/metrics/{agent}/{domain}/{YYYY}.csv`, replace the
  section body with a one-line pointer: "Recording {list} to
  `wiki/metrics/{agent}/{domain}/2026.csv`."
- **Permitted sections only.** After migration, the summary's H2s must be a
  subset of: any agent-specific state section(s), `## Open Blockers`,
  `## Observations for Teammates`. H1 and `**Last run**:` line stay.
- **Active content only.** "Open Blockers" lists currently blocking items.
  Delete anything marked resolved, ~~struck-through~~, or historical.
- **Observations trimmed.** If an item in `## Observations for Teammates`
  crosses ≥3 agents, promote it to the priority index (Step 1) instead of
  repeating it in multiple summaries.

### Acceptance per file

- `wc -l wiki/<agent>.md` ≤ 80.
- No excluded-content warnings from `just wiki-audit`.
- Every removed historical item has been appended to the agent's current weekly
  log.

## Step 3 — Weekly log hygiene

Run `kata-wiki-curate` Step 4 (log hygiene) against every `wiki/*-20??-W??.md`.
The audit script covers filename and top heading; the human-level check is:

- Each run entry uses `## YYYY-MM-DD` heading.
- Subsections use `###` headings consistent with each skill's "Memory: what to
  record" list.
- No edits to past entries (migration additions in Step 2 are flagged as
  `### Migrated from summary on 2026-04-23` — that is an append, not an edit to
  prior content).

### Acceptance

- `just wiki-audit` no longer prints any `FAIL weekly-log` lines.

## Step 4 — Final audit

From the repo root:

```bash
just wiki-audit
```

Expected output: `RESULT: pass`. No FAIL lines.

Warnings are allowed (they are informational by design) but the technical-writer
must note each warning in the curation log for the next curation cycle to
consider.

Also run:

```bash
bunx fit-map validate   # spec 0590 success criterion 8
just wiki-push          # publishes the migrated wiki
```

## Step 5 — Record baseline + measurement for future kata-trace

Spec 0590 success criterion 7 requires a follow-up kata-trace analysis that
compares post-change numbers against the baseline (25 wiki reads before first
action; turn 60 first non-read action). This part does **not** run that analysis
— the next scheduled technical-writer non-curate run produces the numbers. What
this part does:

- Append a row to `wiki/metrics/technical-writer/coverage/2026.csv` recording
  `wiki_lines_total` (post-migration `wc -l wiki/*.md | tail -1`) and
  `summary_files_conforming` (count of `wiki/<agent>.md` files where
  `wc -l ≤ 80`). Create the CSV and header row if missing.
- Note in the technical-writer's summary under `## Observations for Teammates`:
  "Spec 0590 migration complete — next non-curate TW run's kata-trace should
  show ≤12 wiki reads pre-first-action and first-non-read-action ≤ turn 30 (both
  50% of baseline)."

The actual kata-trace comparison is a later improvement-coach / technical-writer
joint action; it is not in scope for this part.

### Acceptance

- `wiki/metrics/technical-writer/coverage/2026.csv` has the new row.
- The observation is present in `wiki/technical-writer.md` and the summary still
  fits the 80-line budget.

## Step 6 — Publish and close

Wiki publish (on the wiki submodule):

- `just wiki-push` (or let the `Stop` hook do it).
- Append the usual curation entry to the current week's technical-writer weekly
  log — i.e. `wiki/technical-writer-$(date +%G-W%V).md`, which today resolves to
  `wiki/technical-writer-2026-W17.md`. Do not hand-pick the week; use the
  ISO-week-of-run. Entry fields:
  - **Areas curated** — all four plus priority-index-seed
  - **Summary corrections** — all 6 agents
  - **MEMORY.md changes** — priority index seeded with N rows
  - **Migration notes** — per-agent line counts before → after
  - **Observations for teammates** — the kata-trace measurement prompt

STATUS advance (on the monorepo `fix/spec-0590-status-plan-implemented` branch
declared in the header):

- Edit `specs/STATUS`: change the row `0590\tplan\tapproved` to
  `0590\tplan\timplemented` (tabs preserved; the file uses tab separators).
  Confirm the vocabulary matches the header comments of `specs/STATUS` which
  enumerate the lifecycle phases.
- `bun run format` to normalize any trailing whitespace.
- Commit message: `docs(specs): advance spec 0590 to plan implemented`.
- Open PR via `mcp__github__create_pull_request`, signed
  `— Technical Writer 📝`. Normal docs-type PM gate applies.

## Blast Radius

- **Wiki submodule:** every `wiki/<agent>.md`, `wiki/MEMORY.md`, and the
  current-week technical-writer log. Metrics CSV created/appended in
  `wiki/metrics/technical-writer/coverage/2026.csv`. No other wiki files
  touched.
- **Monorepo:** one-line edit to `specs/STATUS`. No `.claude/` changes. No
  source code. No test or CI changes.

## Risks specific to this part

- **Summary budget too tight for security-engineer.** The SE summary at 164
  lines is the hardest to compress to 80. If genuine state (compatibility
  blockers, coverage map, watchlist, observations) cannot fit, the
  technical-writer surfaces a budget-revision question rather than stripping
  load-bearing content. Escalation path: raise as an observation in the priority
  index with owner=technical-writer, status=active. Do not pre-commit to a
  larger budget; the design picked 80 deliberately.
- **Content loss during history → weekly log move.** Mitigated by appending
  first, deleting second, within the same commit.
- **Priority index bloats past 10.** Technical-writer applies judgement: the cap
  is the forcing function. The four seed candidates named in Step 1 are the
  expected starting set; real migration may find fewer.
- **Wiki push / Stop hook interaction.** The existing Stop hook runs
  `just wiki-push`; migration commits to the wiki repo must not stage monorepo
  paths. Standard wiki-curate discipline applies.

## Non-goals

- Storyboard redesign (explicitly excluded by spec 0590 scope).
- Per-agent skill-specific memory field changes (excluded by spec 0590 scope).
- Wiki archival directory creation (design chose deletion-after-log-append over
  an archive tree).
