# Conditions

Reference for `extract-entities` Step 7d. Conditions are time-bound
organizational states that affect multiple entities at the same time (hiring
freezes, reorgs, budget holds, leadership transitions). They are the "weather"
of the knowledge graph.

## Detection signals

When **3+ different entity updates in the same processing run** reference the
same constraint or state, suspect a Condition.

| Signal                                   | Example                          | Potential Condition         |
| ---------------------------------------- | -------------------------------- | --------------------------- |
| "on hold", "paused", "frozen", "blocked" | "All recruitment is on hold"     | Hiring Freeze               |
| "reorg", "restructuring", "transition"   | "Team may move outside division" | Organizational Restructure  |
| "budget", "cost reduction", "headcount"  | "30% reduction planned"          | Budget Constraint           |
| "waiting on", "pending approval from"    | "Waiting on leadership decision" | Leadership Decision Pending |
| "new CTO", "leadership change"           | "New CTO starting next month"    | Leadership Transition       |

## Create a Condition

1. Check existing: `ls Knowledge/Conditions/ 2>/dev/null`.
2. **No match:** create a new Condition note with
   [templates-conditions.md](templates-conditions.md). Give it a descriptive
   name ("Hiring Freeze Q2", "Division Reorg").
3. **Match exists:** update with new activity and any changes to status,
   blocker, or affected entities.

## Update affected entities

When you create or update a Condition:

1. Add `[[Conditions/{Condition}]]` to the `## Affects` section of affected
   Priorities.
2. Add `[Status → on hold]` state changes to affected Projects where
   appropriate.
3. Add a `## Blockers` entry to affected Role files if recruitment is frozen.
4. Log the Condition reference in activity entries:
   `- **YYYY-MM-DD** ({source}): {update}. See [[Conditions/{Condition}]]`.

## Resolve Conditions

Source content indicates the Condition ended: "approved", "freeze lifted",
"reorg complete", "back on track".

- Set `**Status:** resolved`, `**Resolved:** {date}`.
- Remove `[[Conditions/{Condition}]]` from affected Priority `## Affects`.
- Log with `[Status → resolved]`.

## Conservatism

Only create Conditions for genuinely cross-cutting states that affect 3+
entities. A single project that goes "on hold" is a project status change. It is
**not** a Condition. A hiring freeze that affects 20 roles across 5 teams **is**
a Condition.
