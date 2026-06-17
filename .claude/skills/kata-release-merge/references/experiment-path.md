# Experiment-PR Approval Path

The gate's path for a **spec-less experiment PR**: an implementation-typed PR
(`feat`/`fix`/`bug`/`refactor`/`chore`) referencing no spec id, whose lineage
is a single experiment-labeled issue with a named owning agent. It runs in
place of the spec-row approval read (SKILL Step 6) and the implementation-PR
spec check (SKILL Step 9). Fail-closed throughout: any ambiguity blocks.

## Discriminator (classification)

Resolve **every** `#NNN` the PR references (title and body). Classify each by
what it resolves to:

- a number matching a `STATUS.md` spec row → **spec reference**
- a number resolving to an experiment-labeled issue **with a named owning
  agent** → **experiment reference**
- a number matching **both** a spec row and an experiment issue → **blocked**
  fail-closed, reason names the ambiguity
- an experiment-labeled issue **without** a named owner → not an experiment
  reference (does not count)

The PR takes the experiment path only when it has **no spec reference** and
**exactly one** experiment reference. Zero experiment references, more than
one, or any both-match → **blocked** fail-closed with the ambiguity named —
never silently routed.

## Approval read (replaces the Step 6 spec-row read)

Read the `exp:{issue}` row in `wiki/STATUS.md` (four cells:
`exp:{issue}<TAB>{state}<TAB>{pin}<TAB>{plan-ref}`).

| Row state | Gate verdict |
|---|---|
| absent / `registered` / `cancelled` | **blocked** (`awaiting approval signal`); a `cancelled` row blocks even if it was once `approved` |
| `approved`, pin == PR head SHA | **pass** the approval read |
| `approved`, pin != PR head SHA | **blocked** (`head moved since signal`) |

**No rebase while approved-and-pinned.** Do not run the Step 5 rebase on an
approved-and-pinned experiment PR — a rebase moves the head and invalidates the
pin. If a rebase is genuinely unavoidable, the PR re-blocks until a fresh human
signal covers the new head. The approval read consults only the STATUS row;
PR-side labels, reviews, and comments feed the row via propagation
(approval-signals.md), never the gate predicate directly.

## Diff-scope check (replaces the Step 9 spec check)

Reached only by a PR that passed the approval read above. In place of the
"parent spec plan on main" check, compare the PR's changed-file list against
the execution-plan globs recorded on the experiment issue at registration:

- every changed file matches at least one registered glob → **pass**
- any changed file outside the registered globs → **blocked** (out-of-surface)

Agent-profile and skill self-edit paths (`.claude/agents/**`, skill files) pass
**only** when a registered glob names them **and** the head pin holds — neither
condition is waived. Merge does **not** advance the row (an experiment row has
no `plan implemented` state).

## Block-count re-surface

The blocked report carries the consecutive-block count (tracked in memory at
Step 0). At a consecutive-block count of **3**, re-post the approval-signal
request on the PR — naming the experiment issue and any time-sensitive
evidence — rather than silently re-blocking again.

## Instrumentation

Per experiment PR merged, record in memory the PR-open, human-signal, merge,
and (when present) experiment-verdict timestamps, so verdict→merge and
request→signal latency are derivable.
