# Experiment-PR Approval Path

This is the gate's path for a **spec-less experiment PR**. Such a PR is
implementation-typed (`feat`/`fix`/`bug`/`refactor`/`chore`) and references no
spec id. Its lineage is a single experiment-labeled issue with a named owning
agent. This path runs in place of the spec-row approval read (SKILL Step 6) and
the implementation-PR spec check (SKILL Step 9). It is fail-closed throughout.
Any ambiguity blocks.

## Discriminator (classification)

Resolve **every** `#NNN` the PR references (title and body). Classify each by
what it resolves to:

- a number that matches a `STATUS.md` spec row → **spec reference**
- a number that resolves to an experiment-labeled issue **with a named owning
  agent** → **experiment reference**
- a number that matches **both** a spec row and an experiment issue →
  **blocked** fail-closed, and the reason names the ambiguity
- an experiment-labeled issue **without** a named owner → not an experiment
  reference (it does not count)

The PR takes the experiment path only when it has **no spec reference** and
**exactly one** experiment reference. Zero experiment references, more than one,
or any both-match → **blocked** fail-closed, and name the ambiguity. Never
route such a PR silently.

## Approval read (replaces the Step 6 spec-row read)

Read the `exp:{issue}` row in `wiki/STATUS.md` (four cells:
`exp:{issue}<TAB>{state}<TAB>{pin}<TAB>{plan-ref}`).

| Row state                           | Gate verdict                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| absent / `registered` / `cancelled` | **blocked** (`awaiting approval signal`). A `cancelled` row blocks even if it was once `approved` |
| `approved`, pin == PR head SHA      | **pass** the approval read                                                                        |
| `approved`, pin != PR head SHA      | **blocked** (`head moved since signal`)                                                           |

**No rebase while approved-and-pinned.** Do not run the Step 5 rebase on an
approved-and-pinned experiment PR. A rebase moves the head and invalidates the
pin. If a rebase is truly unavoidable, the PR re-blocks until a fresh human
signal covers the new head. The approval read consults only the STATUS row.
PR-side labels, reviews, and comments feed the row through propagation
(approval-signals.md). They never feed the gate predicate directly.

## Diff-scope check (replaces the Step 9 spec check)

Only a PR that passed the approval read above reaches this check. Replace the
"parent spec plan on main" check. Compare the PR's changed-file list against
the execution-plan globs recorded on the experiment issue at registration:

- every changed file matches at least one registered glob → **pass**
- any changed file outside the registered globs → **blocked** (out-of-surface)

Agent-profile and skill self-edit paths (`.claude/agents/**`, skill files) pass
**only** when a registered glob names them **and** the head pin holds. The gate
waives neither condition. Merge does **not** advance the row, because an
experiment row has no `plan implemented` state.

## Block-count re-surface

The blocked report carries the consecutive-block count, tracked in memory at
Step 0. At a consecutive-block count of **3**, re-post the approval-signal
request on the PR. Name the experiment issue and any time-sensitive evidence.
Do not silently re-block again.

## Instrumentation

For each experiment PR you merge, record in memory the PR-open, human-signal,
merge, and, when present, experiment-verdict timestamps. A reader can then
derive verdict→merge latency and request→signal latency.
