---
name: kata-wiki-curate
description: >
  Curate the wiki (agent memory) for cross-team collaboration. Verify summary
  accuracy against weekly logs, follow up on stale teammate observations,
  update MEMORY.md, and clean log hygiene. Use when running scheduled wiki
  curation, auditing agent memory health, or checking cross-agent
  communication.
---

# Wiki Curation

Ensure the wiki remains a reliable coordination mechanism. Without curation,
summaries drift from reality, stale blockers persist, critical observations go
unacted on, and MEMORY.md falls out of sync.

Each run covers all four curation areas in sequence.

## When to Use

- Scheduled wiki curation run
- Auditing agent memory health
- Checking cross-agent communication

## Curation areas

| Area                    | What to check                                                  |
| ----------------------- | -------------------------------------------------------------- |
| `summary-accuracy`      | Each agent's summary matches their latest weekly log entries   |
| `inbox-follow-up`       | `## Message Inbox` entries are acknowledged and acted on       |
| `memory-index`          | MEMORY.md and Home.md list all agents, conventions are current |
| `log-hygiene`           | Weekly logs use correct format, headings, ISO week conventions |

If time-constrained, prioritize `summary-accuracy` and `inbox-follow-up`.

## Write-time invariants

**Verify state before writing.** When adding or editing any agent-summary
entry that names a PR or Issue (Watching-list, "Recently merged", Open
Blockers, Observations to Teammates), query state at write time via
`gh pr view <num> --json state,mergedAt` or `gh issue view <num> --json state`.
Do not infer state from teammate summaries, memos, or prior curation entries —
they may be stale by hours, not just days.

The same rule applies to agent-summary edits triggered by cross-agent
corrections: re-verify the named artifact rather than transcribing the
correction text verbatim.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot` (per [Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#on-boot-read-set)). The boot digest's `owned_priorities`, `claims`, and (when this skill reads Tier-2 surfaces) `storyboard_items` seed the rest of this skill's Process. Then read every file
in `wiki/`:

- All agent summary files (`wiki/<agent>.md`)
- The current week's log for each agent (`wiki/<agent>-$(date +%G-W%V).md`)
- `wiki/MEMORY.md`
- `wiki/Home.md`

> **Writing under `.claude/`:** If this run edits files under `.claude/agents/`
> or `.claude/skills/`, follow
> [self-improvement.md](../../agents/references/self-improvement.md).

### Step 1: Summary accuracy

For each agent, compare the summary against the most recent weekly log entries:

- **Last run date** — Does the summary's "Last run" match the latest
  `## YYYY-MM-DD` entry in their weekly log?
- **Coverage map** — Does the summary's coverage table match the data in their
  latest log entries? (Applies to agents with coverage maps: security-engineer,
  improvement-coach, technical-writer.)
- **Blockers** — Are blockers in the summary still open, or were they resolved
  in subsequent logs? Remove resolved blockers.
- **Stale summaries** — Flag any agent whose summary shows a "Last run" date
  more than 7 days ago with no new weekly log entries.
- **Contract conformance** — Run `bunx fit-wiki audit` (the audit logic
  lives in `fit-wiki` — formerly a separate recipe; the legacy
  `just wiki-audit` recipe shells out to the same code) and fix any summary
  failures directly in the summary file. The curator is the only agent that
  rewrites summaries; other agents propose edits via observations.

Fix inaccuracies directly in the summary files. Any fresh PR/Issue reference
written during a fix must satisfy the write-time invariant above.

### Step 2: Inbox follow-up

Collect all `## Message Inbox` sections across all agent summaries. For each
memo:

1. The inbox is the recipient — this is the agent owning the file. The sender
   is the bold name on the bullet (`- [date] **<sender>**: <text>`).
2. Check the recipient agent's weekly logs after the memo date for
   acknowledgement or action.
3. Flag memos older than 2 weeks with no visible response.
4. Re-send a fresh memo via `fit-wiki memo --from technical-writer --to
   <recipient> --message "<flag text>"` so the recipient sees the nudge on
   their next run.

### Step 3: Memory index

Verify `wiki/MEMORY.md`:

- Lists all agents with correct one-line descriptions.
- Filename convention documentation matches actual usage.
- No agents missing or extra.

Verify `wiki/Home.md`:

- Agent count matches actual agents.
- All agent summary links work.
- Quick links are current.

Update both files if they've drifted.

### Step 4: Log hygiene

For each weekly log file in `wiki/`:

- Filename follows `<agent>-YYYY-Www.md` convention.
- File starts with `# <Agent Name> — YYYY-Www` heading.
- Each run entry uses `## YYYY-MM-DD` heading.
- Subsections use `###` headings matching the skill's "Memory: what to record"
  fields.

Flag format violations but do not rewrite log content — logs are historical
records.

### Step 5: Critical item roll-up

Scan all agent summaries and recent weekly logs for items that affect multiple
agents or the whole team:

- Systemic blockers (e.g., CI failures, SDK limitations)
- Breaking changes that affect agent workflows
- Policy changes that need cross-agent awareness

The **required destination** is `wiki/MEMORY.md`'s `## Cross-Cutting Priorities`
table. Add an entry with the schema (Item / Agents / Owner / Status / Added).
Mirroring an item into an affected agent's `Message Inbox` is
**conditional** — only when the agent needs context beyond what the index entry
conveys.

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
- **Summary corrections** — Which agent summaries were updated and why
- **Stale memos** — Inbox entries >2 weeks old with no response
- **MEMORY.md changes** — What was added/updated
- **Memos sent** — Specific callouts dispatched via `fit-wiki memo`
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.
