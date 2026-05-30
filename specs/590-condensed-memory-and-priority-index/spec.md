# Spec 590 — Condensed Agent Memory and Cross-Cutting Priority Index

## Problem

The kata agents share a wiki that is supposed to be the coordination surface
between them, but the current shape of that wiki fights against both of its
jobs. Every agent pays a large context tax to warm up its memory at the start
of every run, and the information that actually cuts across the team stays
buried in individual agent summaries where teammates only find it by accident.

The wiki is simultaneously too noisy to read cheaply and too flat to surface
what matters.

The concrete examples in this section are a **snapshot captured on
2026-04-21** and will naturally age; they exist to ground the problem, not to
stay live.

### Evidence — context pollution

The shared memory protocol in
[`.claude/agents/references/memory-protocol.md`](../../.claude/agents/references/memory-protocol.md)
instructs every agent to read its own summary plus "the other agent summaries
for cross-agent context." The `kata-wiki-curate` skill goes further and
explicitly says "read every file in `wiki/`" in its Step 0 — all six agent
summaries, all six current-week logs, `MEMORY.md`, and `Home.md`.

A kata-trace analysis of two recent technical-writer runs on 2026-04-21
(run IDs `24706371137` and `24705106429`) shows what that produces in practice:

| Run | Turns | Cost | Wiki reads/globs before first action |
| --- | --- | --- | --- |
| `24706371137` (wiki curation) | 198 | $3.97 | **25**, spanning turns 2–60 |
| `24705106429` (IC gate verify + docs review) | 307 | $3.27 | 17 |

Run `24706371137` spends roughly the first 60 turns loading memory before its
first curation edit. The reads include every summary, every current-week log,
the storyboard, `Home.md`, and `MEMORY.md` — plus re-reads once the agent
begins editing.

The files being loaded are themselves growing past the point where they still
earn their place in startup context. On 2026-04-21, reproduced via
`wc -l wiki/*.md` and summed with `awk`:

```
Total wiki:                                     8,375 lines
Largest weekly log (product-manager-2026-W16):  1,446 lines
All agent summaries + MEMORY.md + Home.md:        719 lines
product-manager.md (summary, supposed to be state):  157 lines
```

The PM summary carries a 32-row `Previously Tracked PRs` table covering merged
and closed PRs back to late March — audit history, not actionable state. The
TW summary carries a 7-item `Observations for Teammates` block because no
other surface exists for cross-cutting items.

### Evidence — cross-cutting priorities are invisible

`wiki/MEMORY.md` today is 20 lines of static navigation: a bullet list pointing
to each agent's summary and a Storyboard link. It surfaces nothing about the
current state of the team.

At the time of analysis, the following items actively affected multiple agents:

- **IC log hygiene gate** — DO-CONFIRM gate merged via PR #451 on 2026-04-20,
  behavioural verification pending next IC run. Named in PM, TW, and IC
  summaries.
- **Spec 420 documentation debt** — 46+ accuracy errors across 6 topics, named
  by TW and referenced by staff-engineer and PM.
- **Issue #441 (phantom `stages.yaml`)** — blocked because `.claude/skills` is
  write-protected for agents; requires a human commit. Named in PM summary and
  TW pending-curation list.
- **Spec 480 plan-approval blocker** — plan on main since April 19; TW standing
  by to implement; named in PM and staff-engineer summaries.

An agent discovers these only by reading multiple teammate summaries. The
`kata-wiki-curate` skill already defines a "Step 5: Critical item roll-up"
whose stated goal is exactly this, but its output rule says to put the roll-up
into affected agents' `Observations for Teammates` sections — i.e., into the
very files that are already bloating. The shared index that every agent
already reads is the natural home for this roll-up and is currently wasted on
navigation.

### Who is affected

Every kata agent: improvement-coach, product-manager, release-engineer,
security-engineer, staff-engineer, technical-writer. The cost is paid on every
scheduled run. The invisibility of cross-cutting priorities affects
coordination quality — systemic blockers and structural gates slip past agents
who did not happen to read the summary that first noted them.

## Proposal

Reshape the wiki so the shared index (`MEMORY.md`) carries the few items every
agent must know, summary files shrink to current state, and weekly logs become
append-only audit records that are not on the critical path of a normal run.

### Capabilities to add or change

**Cross-cutting priority index.**

`wiki/MEMORY.md` must surface items that affect multiple agents or the whole
team so any agent can discover them without reading teammate summaries. The
named fields an entry must carry, the placement within `MEMORY.md`, and the
count bound are design decisions; the WHAT is that the index is the canonical
location for cross-cutting items and is cheap enough to read on every agent's
startup. The `kata-wiki-curate` skill's Step 5 ("Critical item roll-up") treats
this index as its primary output. Whether an item is also mirrored into an
affected agent's `Observations for Teammates` is a conditional action, not a
required duplication.

**Condensed summary contract.**

`wiki/<agent>.md` summary files carry only state that drives an agent's next
action. The set of content categories permitted in a summary includes: last
run metadata, current coverage or backlog state, open blockers, active
observations for teammates, and links into the priority index or storyboard
where relevant. Historical audit material — previously tracked PRs, product
evaluation history, resolved blockers — is not summary content. The contract
is mechanically checkable (a reader can decide yes/no per section without
interpretation). The specific line budget number and the exact canonical
section list are design decisions.

**Tiered memory load.**

Agent startup reads are bounded so that adding another agent or another week
does not grow the default load. The WHAT is a tiered memory protocol: a
minimum surface read by every agent on every run, and an opt-in surface read
only when the task requires it. Which files sit in each tier and the
conditions that trigger opt-in reads are design decisions. Weekly logs leave
the default startup surface — they remain reachable for the agents whose work
is audit or curation, but no agent should pay their cost on a normal run.

**Consistent curation output.**

`kata-wiki-curate/SKILL.md` remains the one place that reads the full wiki;
its Step 0 stays comprehensive because curation is the point of the skill.
Step 5's output section is updated so the priority index is the required
destination for cross-cutting items. The historical pattern of writing
cross-cutting items exclusively into the technical-writer's `Observations
for Teammates` is replaced.

## Scope

### Included

- `wiki/MEMORY.md` content model — `## Cross-Cutting Priorities` section,
  entry fields, size ceiling
- `.claude/agents/references/memory-protocol.md` — tiered memory load rules
- `.claude/skills/kata-wiki-curate/SKILL.md` — Step 0 alignment, Step 5 output
  target, curator-specific read scope
- The `wiki/<agent>.md` summary contract — size budget, state-only content
  rule, canonical sections
- The `wiki/<agent>-YYYY-Www.md` weekly log contract — append-only audit
  record, not on the default startup load
- Migration of existing wiki content to conform to the new contracts

### Excluded

- **Enforcement mechanism.** Whether the size budget is checked by a
  CI linter, a stop hook, a kata-wiki-curate action, or left to review is a
  HOW decision for the design and plan phases.
- **Archival location.** Whether historical tables move to `wiki/history/`,
  into a monthly snapshot, or are simply deleted after merge is a design
  decision.
- **Storyboard redesign.** The monthly storyboard file already carries target
  condition and experiment state; its role and format are out of scope for
  this spec.
- **Changes to per-agent skill-specific memory fields.** Skills that specify
  which subsections to record (e.g., "Areas curated", "Trace analyzed") stay
  as they are; only the container files and the shared index are in scope.
- **Wiki publishing pipeline.** How wiki changes are pushed to the remote
  (existing `Stop` hook / `just wiki-push`) is unchanged.

## Success Criteria

1. `wiki/MEMORY.md` exposes cross-cutting items such that an agent reading
   `MEMORY.md` alone can enumerate every currently-active cross-cutting item
   and identify the affected agents, owner, and status per item — without
   reading any teammate summary. Whether zero items are active is itself
   visible (i.e., the absence of items is explicit, not indistinguishable
   from "not tracked yet").
2. `.claude/agents/references/memory-protocol.md` defines a tiered memory
   load in which the minimum-required startup read is a bounded set of files
   that does not scale with the number of agents or the number of weeks, and
   in which teammate summaries and weekly logs are opt-in. The conditions
   that trigger opt-in reads are stated in the protocol.
3. `.claude/skills/kata-wiki-curate/SKILL.md` Step 5 designates
   `wiki/MEMORY.md` as the required destination for cross-cutting items and
   describes any mirror into `Observations for Teammates` as conditional.
4. A summary-file contract lives in one canonical location and is mechanical:
   a reader can decide in bounded time whether any given `wiki/<agent>.md`
   conforms. The contract names (a) the content categories permitted in a
   summary and (b) a line budget; the specific budget number and the exact
   section list are produced in the design and plan phases.
5. A weekly-log contract lives in one canonical location and states that
   weekly logs are append-only audit records, are not in the default startup
   load, and name which skills or tasks legitimately read them.
6. After migration, every `wiki/<agent>.md` summary file satisfies the
   summary contract (categories + budget). Every `wiki/<agent>-YYYY-Www.md`
   weekly log conforms to the weekly-log contract. `wiki/MEMORY.md` contains
   the cross-cutting index described in Criterion 1. A canonical audit
   command (to be named in the plan) reports conformance as pass/fail over
   the whole wiki and passes at the end of migration.
7. A follow-up `kata-trace` analysis of a technical-writer run after the
   change lands records two numbers for comparison with the baseline: wiki
   file reads before the first non-read assistant action (baseline: 25 on
   run `24706371137`), and the turn index of the first non-read assistant
   action (baseline: ~turn 60 on run `24706371137`). Both numbers are at
   least 50% below the baseline on a non-curate run of the same agent.
   Baseline and post-change measurements live in
   `wiki/metrics/technical-writer/` so the comparison is auditable.
8. `bunx fit-map validate` and existing wiki push / curate workflows continue
   to succeed against the migrated wiki — no regression in existing tooling.
