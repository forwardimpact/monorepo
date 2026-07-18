---
name: kata-archive
description: >
  Detect time-bounded artifacts whose retention window has passed, confirm each
  one's durable signal is preserved elsewhere, then retire them — past-period
  wiki files directly and terminal spec directories through a retention PR. Use
  on a scheduled archivist shift, or when the specs tree and weekly logs grow
  faster than they retire and repository search signal drops.
---

# Archive Retention

Detect terminal, time-bounded artifacts past their retention window, confirm
each one's durable signal already lives elsewhere, then retire them. Removal is
safe only when the signal is preserved and the removal stays recoverable through
version history.

## When to Use

- A scheduled archivist shift sweeps for stale artifacts.
- The `specs/` tree or the weekly-log set has grown without bound and
  repository search signal is dropping.

## Checklists

<read_do_checklist goal="Fix retention boundaries before detecting candidates">

- [ ] Canonical records are never candidates: `STATUS.md`, `MEMORY.md`.
- [ ] Current-period artifacts are never candidates: the current-week log and
      the current-month storyboard.
- [ ] A spec is a candidate only when its `STATUS` row is terminal
      (`plan implemented` or `cancelled`).
- [ ] You retire another agent's file by age only — never by editing its
      content.

</read_do_checklist>

<do_confirm_checklist goal="Confirm each removal is safe before acting">

- [ ] Each artifact's durable signal verified present elsewhere before removal.
- [ ] Every spec removed keeps its `STATUS` ledger row intact.
- [ ] No retired log is still targeted by a live summary `detail:` link.
- [ ] Removal left recoverable through version history — no history rewrite.
- [ ] Each retirement recorded in the archivist's summary and weekly log.

</do_confirm_checklist>

## Retention Windows

One artifact class per row: when it turns stale, and what must already hold
before it can be removed.

| Artifact class | Retire when | Preservation precondition |
| --- | --- | --- |
| Past-week agent log (incl. sealed `-partN`) | its ISO week ends 12 or more weeks before the current week | no live summary `detail:` link points to the file |
| Past-month storyboard | its month ends 2 or more months before the current month | the `MEMORY.md` storyboard index keeps the pointer |
| Terminal spec directory | its `STATUS` row is terminal **and** the newest commit under the spec directory is older than 28 days | the `STATUS` ledger row is retained; full text recoverable in version history |

The 12-week log window sits deliberately beyond a summary's `detail:`-link
horizon: live summaries routinely link logs many weeks back, so a shorter window
would be dominated by the Step 2 deferral and retire almost nothing. The
dangling-link check is the hard safety net regardless of the window — a
still-linked log is never retired at any age.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `fit-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).

### Step 1: Detect Terminal Stale Specs

Read `STATUS.md` for terminal rows (`plan implemented` / `cancelled`). For each,
test staleness against the window using the newest commit touching its
directory:

```sh
git log -1 --format=%cI specs/<id>/
```

A just-completed spec is never swept: terminal state alone is not enough — the
commit age must also clear the window.

### Step 2: Detect Stale Wiki Artifacts

Enumerate past-week logs and past-month storyboards past their window. **Defer**
any log still targeted by a live summary `detail:` link — never edit another
agent's summary to clear a dangling pointer. `detail:` is a freeform prose
convention, not a checkable field, so detect it directly: for each candidate log
filename, search every summary for a markdown link to it —

```sh
grep -lF "](<filename>)" wiki/*.md
```

A non-empty match defers that log to a later shift.

### Step 3: Preserve Signal and Retire

Confirm each surviving candidate's preservation precondition, then hand off to
the owning agent's Act paths:

- **Terminal spec** → open a retention PR; the release engineer merges it. The
  `STATUS` ledger row stays; full text is recoverable in version history.
- **Wiki artifact** → remove directly with an ordinary wiki write.

Record each retirement in the archivist's own summary and weekly log
(`wiki/archivist.md`, `wiki/archivist-YYYY-Www.md`) — the archive ledger.

## Memory: What to Record

Append to the current week's log:

- **Retired** — each artifact, its class, and the window it cleared.
- **Deferred** — candidates held back and why (e.g. a live `detail:` link).
- **Retention PR** — the PR opened for spec removals and its merge outcome.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.
