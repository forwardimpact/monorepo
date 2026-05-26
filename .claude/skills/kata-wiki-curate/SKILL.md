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

Ensure the wiki remains a reliable coordination mechanism. Without curation,
summaries drift from reality, stale blockers persist, critical observations go
unacted on, and MEMORY.md falls out of sync.

Each run starts with `fit-wiki audit` and then covers the remaining curation
areas in sequence.

## When to Use

- Scheduled wiki curation run
- Auditing agent memory health
- Checking cross-agent communication

## Curation areas

`fit-wiki audit` is the spine. It mechanically enforces every contract rule the
memory protocol defines — line **and** word budgets, section order, decision
blocks, MEMORY.md structure, Active Claims schema, storyboard markers, stray
files — and the same rules gate CI. Curation runs audit first and fixes every
finding; the remaining areas are the _meaning_ audit cannot read.

| Area               | What to check                                            | Tool                         |
| ------------------ | -------------------------------------------------------- | ---------------------------- |
| `contract-audit`   | Every mechanical contract rule passes                    | `fit-wiki audit`             |
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
`gh pr view <num> --json state,mergedAt` or `gh issue view <num> --json state`.
Do not infer state from teammate summaries, memos, or prior curation entries —
they may be stale by hours, not just days.

The same rule applies to agent-summary edits triggered by cross-agent
corrections: re-verify the named artifact rather than transcribing the
correction text verbatim.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot` (per
[Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#on-boot-read-set)).
The boot digest's `owned_priorities`, `claims`, and (when this skill reads
Tier-2 surfaces) `storyboard_items` seed the rest of this skill's Process. Then
read every file in `wiki/`:

- All agent summary files (`wiki/<agent>.md`)
- The current week's log for each agent (`wiki/<agent>-$(date +%G-W%V).md`)
- `wiki/MEMORY.md`
- `wiki/Home.md`

> **Writing under `.claude/`:** If this run edits files under `.claude/agents/`
> or `.claude/skills/`, follow
> [self-improvement.md](../../agents/references/self-improvement.md).

### Step 1: Contract audit

Run `bunx fit-wiki audit --format json`. This is the spine of curation: it
checks every wiki file against the rule catalogue — summaries, weekly logs and
their sealed parts, MEMORY.md structure, priority and claims rows, the current
storyboard, and stray files — for line/word budgets, section order, required
markers, decision blocks, and schema conformance. The same audit gates pre-merge
CI, so a clean local run is the bar.

Fix every `fail` finding directly in the named file:

- **Budgets** (summary, weekly-log, or storyboard line/word) — trim settled
  state into the appropriate surface, or `bunx fit-wiki rotate --agent <agent>`
  to seal an overflowing weekly log.
- **Section order / markers** (first-H2-inbox, memo marker, open-blockers-last)
  — reorder the summary. The curator is the only agent that rewrites summaries;
  other agents propose edits via observations.
- **Decision blocks** — a weekly-log entry missing `### Decision` is a
  historical record; flag it rather than backfilling invented rationale.
- **MEMORY.md structure / row shape** — repair headings, separators, and column
  counts in place.

Any fresh PR/Issue reference written during a fix must satisfy the write-time
invariant above.

### Step 2: Claims hygiene

Audit emits an `expired-claim` **warn** for every `## Active Claims` row past
its `expires_at`. Clear them with `bunx fit-wiki release --expired` — an expired
claim left in place falsely signals work in flight. For rows that are not yet
expired but name a PR/Issue that has since merged or closed, verify state per
the write-time invariant and release each via
`bunx fit-wiki release --agent <agent> --target <id>`.

### Step 3: Summary accuracy

Audit checks a summary's _shape_; this step checks its _meaning_. For each
agent, compare the summary against the most recent weekly log entries:

- **Last run date** — Does the summary's "Last run" match the latest
  `## YYYY-MM-DD` entry in their weekly log?
- **Coverage map** — Does the summary's coverage table match the data in their
  latest log entries? (Applies to agents with coverage maps: security-engineer,
  improvement-coach, technical-writer.)
- **Blockers** — Are blockers in the summary still open, or were they resolved
  in subsequent logs? Remove resolved blockers.
- **Stale summaries** — Flag any agent whose summary shows a "Last run" date
  more than 7 days ago with no new weekly log entries.

Fix inaccuracies directly in the summary files. Any fresh PR/Issue reference
written during a fix must satisfy the write-time invariant above.

### Step 4: Inbox follow-up

List each agent's Message Inbox via `bunx fit-wiki inbox list --agent <agent>`.
For each memo:

1. The recipient is the agent owning the inbox; the sender is the bold name on
   the bullet (`- [date] **<sender>**: <text>`).
2. Check the recipient's weekly logs after the memo date for acknowledgement or
   action.
3. A team-level item belongs in Cross-Cutting Priorities — promote it with
   `bunx fit-wiki inbox promote --agent <recipient> --index N`, which writes the
   priority row and removes the inbox bullet in one step.
4. Flag memos older than 2 weeks with no visible response: re-send a fresh nudge
   via
   `bunx fit-wiki memo --from technical-writer --to <recipient> --message "<flag text>"`
   so the recipient sees it on their next run.

### Step 5: Memory index & storyboard

Audit confirms MEMORY.md and the current storyboard are structurally valid; this
step checks the content audit cannot read.

Verify `wiki/MEMORY.md`:

- Lists all agents with correct one-line descriptions.
- Filename convention documentation matches actual usage.
- No agents missing or extra.

Verify `wiki/Home.md`:

- Agent count matches actual agents.
- All agent summary links work.
- Quick links are current.

Verify the current storyboard (`wiki/storyboard-YYYY-MNN.md`): marker blocks are
auto-generated — do not hand-edit them; run `bunx fit-wiki refresh` if they are
stale. The surrounding prose should reflect the live condition.

Update MEMORY.md and Home.md if they've drifted.

### Step 6: Critical item roll-up

Scan all agent summaries and recent weekly logs for items that affect multiple
agents or the whole team:

- Systemic blockers (e.g., CI failures, SDK limitations)
- Breaking changes that affect agent workflows
- Policy changes that need cross-agent awareness

The **required destination** is `wiki/MEMORY.md`'s `## Cross-Cutting Priorities`
table. Add an entry with the schema (Item / Agents / Owner / Status / Added).
Mirroring an item into an affected agent's `Message Inbox` is **conditional** —
only when the agent needs context beyond what the index entry conveys.

Resolved items: remove from the priority table within one curation cycle.

## Output

- **Direct wiki fixes** — Summary corrections, MEMORY.md updates, stale blocker
  removal. Commit directly in `wiki/`.
- **Cross-agent observations** — Note unacted teammate observations in the
  technical-writer's summary for target agents to see.
- **Structural improvements** — Spec via `kata-spec` if the wiki structure
  itself needs redesign.

### Publishing changes

Wiki changes are not visible to other agents until pushed. After committing:

1. **Push the wiki** — `cd wiki && git push origin HEAD:master` (or let the
   `Stop` hook run `just wiki-push`).

If the curation also produced monorepo fixes (e.g., stale spec STATUS, doc
corrections), branch from `main` as `fix/wiki-curate-YYYY-MM-DD`, commit, push,
and open a PR — same discipline as doc-review fixes.

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Areas curated** — Which areas checked
- **Audit findings** — Contract `fail`s fixed and `warn`s actioned (e.g. expired
  claims released)
- **Summary corrections** — Which agent summaries were updated and why
- **Stale memos** — Inbox entries >2 weeks old with no response
- **MEMORY.md changes** — What was added/updated
- **Memos sent** — Specific callouts dispatched via `fit-wiki memo`
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for the recording-eligibility
  rule.
