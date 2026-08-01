---
name: kata-archive
description: >
  Detect time-bounded artifacts past their retention window. Confirm each one's
  durable signal survives elsewhere. Then retire them. Remove past-period wiki
  files directly. Remove terminal spec directories through a retention PR. Use
  on a scheduled archivist shift, or when the specs tree and weekly logs grow
  faster than they retire and repository search signal drops.
---

# Archive Retention

Detect terminal, time-bounded artifacts past their retention window. Confirm
each one's durable signal already lives elsewhere. Then retire them. Removal is
safe only when the signal survives elsewhere and the removal stays recoverable
through version history.

## When to Use

- A scheduled archivist shift sweeps for stale artifacts.
- The `specs/` tree or the weekly-log set grows without bound and repository
  search signal drops.

## Checklists

<read_do_checklist goal="Fix retention boundaries before detecting candidates">

- [ ] Never treat a canonical record as a candidate: `STATUS.md`, `MEMORY.md`.
- [ ] Never treat a current-period artifact as a candidate: the current-week
      log and the current-month storyboard.
- [ ] Treat a spec as a candidate only when its `STATUS` row is terminal
      (`plan implemented` or `cancelled`).
- [ ] Retire another agent's file by age only. Never edit its content.

</read_do_checklist>

<do_confirm_checklist goal="Confirm each removal is safe before acting">

- [ ] Confirm each artifact's durable signal is present elsewhere before
      removal.
- [ ] Keep the `STATUS` ledger row intact for every spec you remove.
- [ ] Confirm no live summary `detail:` link still targets a retired log.
- [ ] Keep the removal recoverable through version history. Never rewrite
      history.
- [ ] Record each retirement in the archivist's summary and weekly log.

</do_confirm_checklist>

## Retention Windows

One artifact class per row: when it turns stale, and what must already hold
before you remove it.

| Artifact class | Retire when | Preservation precondition |
| --- | --- | --- |
| Past-week agent log (incl. sealed `-partN`) | its ISO week ends 12 or more weeks before the current week | no live summary `detail:` link points to the file |
| Past-month storyboard | its month ends 2 or more months before the current month | the `MEMORY.md` storyboard index keeps the pointer |
| Terminal spec directory | its `STATUS` row is terminal **and** the newest commit under the spec directory is older than 28 days | the `STATUS` ledger row stays, and version history keeps the full text |

The 12-week log window sits deliberately beyond a summary's `detail:`-link
horizon. Live summaries routinely link logs many weeks back. So the Step 2
deferral would dominate a shorter window. That window would retire almost
nothing. The
dangling-link check is the hard safety net regardless of the window. You never
retire a still-linked log at any age.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).

### Step 1: Detect Terminal Stale Specs

Read `STATUS.md` for terminal rows (`plan implemented` / `cancelled`). For each,
test staleness against the window with the newest commit that touches its
directory:

```sh
git log -1 --format=%cI specs/<id>/
```

You never sweep a just-completed spec. Terminal state alone is not enough. The
commit age must also clear the window.

### Step 2: Detect Stale Wiki Artifacts

Enumerate past-week logs and past-month storyboards past their window. **Defer**
any log a live summary `detail:` link still targets. Never edit another agent's
summary to clear a dangling pointer. `detail:` is a freeform prose convention.
It is not a checkable field. So detect it directly. For each candidate log
filename, search every summary for a markdown link to it:

```sh
grep -lF "](<filename>)" wiki/*.md
```

A non-empty match defers that log to a later shift.

### Step 3: Preserve Signal and Retire

Confirm the preservation precondition for each candidate that survives. Then
hand off to the owning agent's Act paths:

- **Terminal spec** → open a retention PR. The release engineer merges it. The
  `STATUS` ledger row stays. Version history keeps the full text.
- **Wiki artifact** → remove directly with an ordinary wiki write.

Record each retirement in the archivist's own summary and weekly log
(`wiki/archivist.md`, `wiki/archivist-YYYY-Www.md`). Those files are the
archive ledger.

## Memory: What to Record

Append to the current week's log:

- **Retired** — each artifact, its class, and the window it cleared.
- **Deferred** — candidates held back and why (e.g. a live `detail:` link).
- **Retention PR** — the PR opened for spec removals and its merge outcome.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.
