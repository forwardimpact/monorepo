---
name: kata-wiki-curate
description: >
  Curate the wiki (agent memory) for cross-team collaboration. Run `fit-wiki
  audit` to fix every contract violation, clear expired claims, verify summary
  accuracy against weekly logs, follow up on stale teammate observations, and
  keep MEMORY.md current. Use when running scheduled wiki curation, auditing
  agent memory health, or checking cross-agent communication.
---

# Wiki Curation

Keep the wiki a reliable coordination mechanism: without curation, summaries
drift from reality, stale blockers and claims persist, observations go unacted
on, and MEMORY.md falls out of sync.

## Curation areas

`fit-wiki audit` is the spine — it mechanically enforces every contract rule the
memory protocol defines (budgets, section order, decision blocks, MEMORY.md
structure, Active Claims schema, storyboard markers), and the same rules gate
CI. Files that do not match a summary or weekly-log shape are intentionally
left unclassified rather than flagged, so per-deliverable agent files coexist
with audited surfaces. `fit-wiki fix` auto-clears findings; run it first, then
`audit` to confirm. The remaining areas are the _meaning_ audit cannot read.

| Area               | What to check                                            | Tool                         |
| ------------------ | -------------------------------------------------------- | ---------------------------- |
| `contract-audit`   | Every mechanical contract rule passes                    | `fit-wiki fix`, then `audit` |
| `claims-hygiene`   | Expired or settled claims cleared                        | `fit-wiki release --expired` |
| `summary-accuracy` | Each summary _means_ what the agent's latest logs say    | manual (audit can't read it) |
| `inbox-follow-up`  | `## Message Inbox` entries are acknowledged and acted on | `fit-wiki inbox`             |
| `memory-index`     | MEMORY.md / Home.md agent descriptions and links current | manual                       |

If time-constrained, run `contract-audit` to completion, then prioritize
`summary-accuracy` and `inbox-follow-up`.

## Write-time invariants

**Verify state before writing.** When adding or editing any agent-summary entry
that names a PR or Issue (Watching-list, "Recently merged", Open Blockers,
Observations to Teammates), query state at write time via
`gh pr view <num> --json state,mergedAt` or `gh issue view <num> --json state` —
never infer it from teammate summaries, memos, or prior curation entries, which
may be stale by hours. The same applies to edits triggered by cross-agent
corrections: re-verify the named artifact rather than transcribing it verbatim.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot` (per
[Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#on-boot-read-set)).
The boot digest's `owned_priorities`, `claims`, and `storyboard_items` seed the
rest of this Process. Then read every file in `wiki/`: agent summaries
(`wiki/<agent>.md`), the current week's log for each
(`wiki/<agent>-$(date +%G-W%V).md`), `wiki/MEMORY.md`, and `wiki/Home.md`.

> **Writing under `.claude/`:** If this run edits files under `.claude/agents/`
> or `.claude/skills/`, follow
> [self-improvement.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/self-improvement.md).

### Step 1: Contract audit

Run `npx fit-wiki fix` first — it rotates over-budget weekly logs, re-bisects
over-budget sealed parts, hands prose-judgment findings (including a missing
`### Decision`) to a Haiku technical-writer (re-auditing each round), and exits
non-zero flagging anything irreducible (a lone over-budget day-section) for a
human rather than inventing content. Then run
`npx fit-wiki audit --format json` to confirm — it checks every wiki file
(summaries, weekly logs and sealed parts, MEMORY.md, priority and claims rows,
the current storyboard) against the rule catalogue. The same audit gates
pre-merge CI, so a clean local run is the bar. Hand-resolve each flagged
`fail` in the named file:

- **Budgets** (line/word) — trim settled state, or
  `npx fit-wiki rotate --agent <agent>` to seal an overflowing weekly log.
- **Section order / markers** — reorder the summary. The curator is the only
  agent that rewrites summaries; others propose edits via observations.
- **Decision blocks** — `fit-wiki fix` now inserts a missing `### Decision`
  summarising the entry's narrative; verify it matches what the entry records,
  not invented rationale.
- **MEMORY.md structure / row shape** — repair headings, separators, and column
  counts in place.

Any fresh PR/Issue reference written during a fix must satisfy the write-time
invariant above.

### Step 2: Claims hygiene

Audit warns (`expired-claim`) on every `## Active Claims` row past its
`expires_at`; clear them with `npx fit-wiki release --expired` — a stale claim
falsely signals work in flight. For rows not yet expired but naming a PR/Issue
that has since merged or closed, verify state per the write-time invariant and
release each via `npx fit-wiki release --agent <agent> --target <id>`.

### Step 3: Summary accuracy

Audit checks a summary's _shape_; this step checks its _meaning_. Compare each
summary against the agent's most recent weekly log entries:

- **Last run date** — matches the latest `## YYYY-MM-DD` entry in their log?
- **Coverage map** — matches the data in their latest entries? (Applies to
  agents whose skills maintain coverage maps.)
- **Blockers** — still open, or resolved in later logs? Remove resolved ones.
- **Stale summaries** — flag any "Last run" >7 days old with no new log entry.

Fix inaccuracies directly in the summary files; any fresh PR/Issue reference
must satisfy the write-time invariant above.

### Step 4: Inbox follow-up

List each agent's inbox via `npx fit-wiki inbox list --agent <agent>`. For each
memo:

1. The recipient owns the inbox; the sender is the bold name on the bullet
   (`- [date] **<sender>**: <text>`).
2. Check the recipient's weekly logs after the memo date for acknowledgement.
3. A team-level item belongs in Cross-Cutting Priorities —
   `npx fit-wiki inbox promote --agent <recipient> --index N` writes the
   priority row and removes the bullet in one step.
4. Flag memos >2 weeks old with no response: re-send a nudge via
   `npx fit-wiki memo --from technical-writer --to <recipient> --message "<flag text>"`.

### Step 5: Memory index & storyboard

Audit confirms MEMORY.md and the storyboard are structurally valid; this step
checks the content it cannot read.

- **`wiki/MEMORY.md`** — all agents listed with correct one-line descriptions;
  filename-convention docs match usage; no agents missing or extra.
- **`wiki/Home.md`** — agent count matches; summary links work; quick links
  current.
- **`wiki/storyboard-YYYY-MNN.md`** — marker blocks are auto-generated; don't
  hand-edit them, run `npx fit-wiki refresh` if stale. Surrounding prose should
  reflect the live condition.

Update MEMORY.md and Home.md if they've drifted.

### Step 6: Critical item roll-up

Scan summaries and recent logs for items affecting multiple agents or the whole
team — systemic blockers (CI failures, SDK limits), breaking workflow changes,
policy changes needing cross-agent awareness.

The **required destination** is `wiki/MEMORY.md`'s `## Cross-Cutting Priorities`
table (schema: Item / Agents / Owner / Status / Added). Mirroring into an
affected agent's `Message Inbox` is **conditional** — only when the agent needs
context beyond the index entry. Remove resolved items within one curation cycle.

## Output

- **Direct wiki fixes** — Summary corrections, MEMORY.md updates, stale blocker
  removal. Commit directly in `wiki/`.
- **Cross-agent observations** — Note unacted teammate observations in the
  technical-writer's summary for target agents.
- **Structural improvements** — Spec via `kata-spec` if the wiki structure
  itself needs redesign.

### Publishing changes

Hold wiki content to [Citation integrity](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/citation-integrity.md) before publishing.

Wiki changes are not visible to other agents until pushed. After committing,
push the wiki — `cd wiki && git push origin HEAD:master` (or let the `Stop`
hook push it).

If the curation also produced monorepo fixes (e.g. stale spec STATUS, doc
corrections), open a PR from a `fix/wiki-curate-YYYY-MM-DD` branch off `main` —
same discipline as doc-review fixes.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Areas curated** — Which areas checked
- **Audit findings** — Contract `fail`s fixed and `warn`s actioned (expired
  claims released)
- **Summary corrections** — Which agent summaries were updated and why
- **Stale memos** — Inbox entries >2 weeks old with no response
- **MEMORY.md changes** — What was added/updated
- **Memos sent** — Callouts dispatched via `fit-wiki memo`
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for the recording-eligibility
  rule.
