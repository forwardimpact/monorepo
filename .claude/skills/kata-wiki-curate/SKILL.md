---
name: kata-wiki-curate
description: >
  Curate the wiki (agent memory) for cross-team collaboration. Run `gemba-wiki
  audit` to fix every contract violation. Clear expired claims. Verify summary
  accuracy against weekly logs. Follow up on stale teammate observations. Keep
  MEMORY.md current. Use when you run scheduled wiki curation, when you audit
  agent memory health, or when you check cross-agent communication.
---

# Wiki Curation

Keep the wiki a reliable coordination mechanism. Without curation, summaries
drift from reality. Stale blockers and claims persist. Nobody acts on
observations. MEMORY.md falls out of sync.

## Curation areas

`gemba-wiki audit` is the spine. It mechanically enforces every contract rule
the memory protocol defines (budgets, section order, decision blocks, MEMORY.md
structure, Active Claims schema, storyboard markers). The same rules gate CI. A
file that does not match a summary or weekly-log shape stays unclassified by
design. The audit does not flag it. Per-deliverable agent files then coexist
with audited surfaces. `gemba-wiki fix` auto-clears findings. Run it first,
then run `audit` to confirm. The remaining areas are the _meaning_ audit
cannot read.

| Area               | What to check                                            | Tool                         |
| ------------------ | -------------------------------------------------------- | ---------------------------- |
| `contract-audit`   | Every mechanical contract rule passes                    | `gemba-wiki fix`, then `audit` |
| `claims-hygiene`   | Expired or settled claims cleared                        | `gemba-wiki refresh` |
| `summary-accuracy` | Each summary _means_ what the agent's latest logs say    | manual (audit can't read it) |
| `inbox-follow-up`  | `## Message Inbox` entries are acknowledged and acted on | `gemba-wiki inbox`             |
| `memory-index`     | MEMORY.md / Home.md agent descriptions and links current | manual                       |

With limited time, run `contract-audit` to completion. Then prioritize
`summary-accuracy` and `inbox-follow-up`.

## Write-time invariants

**Verify state before you write.** Some agent-summary entries name a PR or
Issue (Watching-list, "Recently merged", Open Blockers, Observations to
Teammates). When you add or edit one, `read` the work item's state at write
time ([work-trackers.md](../../agents/x-work-trackers.md)). Never infer it from
teammate summaries, memos, or prior curation entries, which may be stale by
hours. The same rule applies when a cross-agent correction triggers an edit.
Re-verify the named artifact. Do not transcribe it verbatim.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Then read every file in `wiki/`: agent summaries
(`wiki/<agent>.md`), the current week's log for each
(`wiki/<agent>-$(date +%G-W%V).md`), `wiki/MEMORY.md`, and `wiki/Home.md`.

> **When you write under `.claude/`:** If this run edits files under
> `.claude/agents/` or `.claude/skills/`, follow
> [self-improvement.md](../../agents/x-self-improvement.md).

### Step 1: Contract audit

Run `gemba-wiki fix` first. It rotates over-budget weekly logs. It re-bisects
over-budget sealed parts. It hands prose-judgment findings (including a missing
`### Decision`) to a Haiku technical-writer, and it re-audits each round. It
exits non-zero and flags anything irreducible (a lone over-budget day-section)
for a human. It invents no content. Then run
`gemba-wiki audit --format json` to confirm. It checks every wiki file
(summaries, weekly logs and sealed parts, MEMORY.md, priority and claims rows,
the current storyboard) against the rule catalogue. The same audit gates
pre-merge CI, so a clean local run is the bar. Hand-resolve each flagged
`fail` in the named file:

- **Budgets** (line/word) — trim settled state, or
  `gemba-wiki rotate --agent <agent>` to seal a weekly log that overflows.
- **Section order / markers** — reorder the summary. The curator is the only
  agent that rewrites summaries. Other agents propose edits through
  observations.
- **Decision blocks** — `gemba-wiki fix` now inserts a missing `### Decision`
  that summarizes the entry's narrative. Verify it matches what the entry
  records. Reject invented rationale.
- **MEMORY.md structure / row shape** — repair headings, separators, and column
  counts in place.

Any fresh PR/Issue reference written during a fix must satisfy the write-time
invariant above.

### Step 2: Claims hygiene

Audit warns (`expired-claim`) on every `## Active Claims` row past its
`expires_at`. Clear those rows with `gemba-wiki refresh`. A stale claim
falsely signals work in flight. Some rows are not yet expired but name a
PR/Issue that merged or closed since. Verify their state per the write-time
invariant. Release each with
`gemba-wiki release --agent <agent> --target <id>`.

### Step 3: Summary accuracy

Audit checks a summary's _shape_. This step checks its _meaning_. Compare each
summary against the agent's most recent weekly log entries:

- **Last run date** — confirm it matches the latest `## YYYY-MM-DD` entry in
  their log.
- **Coverage map** — confirm it matches the data in their latest entries.
  (Applies to agents whose skills maintain coverage maps.)
- **Blockers** — check whether each is still open or resolved in later logs.
  Remove the resolved ones.
- **Stale summaries** — flag any "Last run" >7 days old with no new log entry.

Fix inaccuracies directly in the summary files. Every fresh PR/Issue reference
must satisfy the write-time invariant above.

### Step 4: Inbox follow-up

List each agent's inbox with `gemba-wiki inbox list --agent <agent>`. For each
memo:

1. The recipient owns the inbox. The sender is the bold name on the bullet
   (`- [date] **<sender>**: <text>`).
2. Check the recipient's weekly logs after the memo date for acknowledgement.
3. A team-level item belongs in Cross-Cutting Priorities.
   `gemba-wiki inbox promote --agent <recipient> --index N` writes the
   priority row and removes the bullet in one step.
4. Flag memos >2 weeks old with no response. Send the nudge again with
   `gemba-wiki memo --from technical-writer --to <recipient> --message "<flag text>"`.

### Step 5: Memory index & storyboard

Audit confirms MEMORY.md and the storyboard are structurally valid. This step
checks the content it cannot read.

- **`wiki/MEMORY.md`** — all agents listed with correct one-line descriptions.
  Filename-convention docs match usage. No agents missing or extra.
- **`wiki/Home.md`** — agent count matches. Summary links work. Quick links
  current.
- **`wiki/storyboard-YYYY-MNN.md`** — marker blocks are auto-generated. Do not
  hand-edit them. Run `gemba-wiki refresh` if stale. The prose around them
  should reflect the live condition.

Update MEMORY.md and Home.md if they drifted.

### Step 6: Critical item roll-up

Scan summaries and recent logs for items that affect multiple agents or the
whole team. Look for systemic blockers (CI failures, SDK limits), breaking
workflow changes, and policy changes that need cross-agent awareness.

The **required destination** is `wiki/MEMORY.md`'s `## Cross-Cutting Priorities`
table (schema: Item / Agents / Owner / Status / Added). A mirror into an
affected agent's `Message Inbox` is **conditional**. Mirror only when the agent
needs context beyond the index entry. Remove resolved items within one curation
cycle.

## Output

- **Direct wiki fixes** — Summary corrections, MEMORY.md updates, stale blocker
  removal. Commit directly in `wiki/`.
- **Cross-agent observations** — Note unacted teammate observations in the
  technical-writer's summary for target agents.
- **Structural improvements** — Write a spec through `kata-spec` if the wiki
  structure itself needs redesign.

### Publishing changes

Hold wiki content to
[Citation integrity](../../agents/x-citation-integrity.md)
before you publish it.

Other agents cannot see wiki changes until you push them. After you commit,
push the wiki with `cd wiki && git push origin HEAD:master`. You can also let
the `Stop` hook push it.

If the curation also produced repository fixes (e.g. stale spec STATUS, doc
corrections), open a PR from a `fix/wiki-curate-YYYY-MM-DD` branch off `main`.
Apply the same discipline as doc-review fixes.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Areas curated** — Which areas checked
- **Audit findings** — Contract `fail`s fixed and `warn`s actioned (expired
  claims released)
- **Summary corrections** — Which agent summaries you updated and why
- **Stale memos** — Inbox entries >2 weeks old with no response
- **MEMORY.md changes** — What you added or updated
- **Memos sent** — Callouts dispatched with `gemba-wiki memo`
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for the recording-eligibility
  rule.
