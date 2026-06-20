# Issue Lifecycle

What an obstacle and an experiment *are* — and the obstacle-vs-experiment test —
is defined in
[work-definition.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/work-definition.md); this file is
the operation recipes for filing and closing them. Each recipe names an
[abstract operation](../../agents/references/work-trackers.md#abstract-operations);
its concrete shape per tracker lives in the
[matrix](../../agents/references/work-trackers.md#the-matrix). Obstacle and
experiment are both issues, distinguished only by label.

The agent being coached — not the facilitator — creates, comments on, and closes
**its own** obstacle and experiment issues, in both team storyboard and
1-on-1 sessions. The facilitator has no `Bash`: it `Ask`s the agent to record
each one, and the agent **reports the `#NNN` back via `Answer`** (the facilitator
can't `list` to find it) for the storyboard headlines and `Conclude` summary.

The storyboard's Active and Concluded lists render from issue state via the
deterministic `fit-wiki refresh` step — never hand-edit them.

## New Obstacle

`create-issue` with the `obstacle` label:

- **Title:** `Obstacle name`
- **Body:**

  ```text
  Description.

  Blocking dimension: [which gap this blocks]
  ```

## New Experiment

Each experiment references its parent obstacle issue in the body. GitHub renders
`#NNN` as a bidirectional cross-reference, giving the obstacle a visible list of
its related experiments.

The `**Expected outcome:**` line names metrics owned by a single skill. Skills
don't share runs, so a prediction naming metrics from two different skills
cannot resolve in one run — split into one prediction per skill / run type.

The `agent:` label and `Owner:` name the **coached agent itself** (the one
running this command):

`create-issue` with the `experiment` and `agent:[your-agent-name]` labels:

- **Title:** `Exp N — short name`
- **Body:**

  ```text
  Obstacle: #NNN
  Owner: [your agent name]

  **What:** description
  **Expected outcome:** prediction
  **Execution plan:** [omit, or a list of repo-root-anchored path globs]
  ```

The `**Execution plan:**` line is required when the experiment will **ship
code**. It names the intended change surface as a list of repo-root-anchored
path globs (e.g. `libraries/libfoo/**`, `.claude/skills/foo/**`) the merge
gate compares against an Act PR's changed-file list without judgment. Omit it
for experiments that ship no code.

When the plan ships code, the owning agent **also** writes the experiment's
approval row to its memory's `STATUS.md` at `registered` with an empty pin:

```text
exp:{issue}	registered	-	#{issue}
```

This is bookkeeping, written by the owning agent (never the facilitator). The
row's `approved` state is human-originated and written elsewhere; see
[approval-signals.md § Experiment rows](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/approval-signals.md).

## At open-change (code-shipping experiments)

When the owning agent runs `open-change` for the experiment's Act change, it
requests the trusted human's `gate` signal on the change, naming the experiment
issue and flagging any time-sensitive evidence (e.g. retention-bounded trace
artifacts). The agent owns this ask; nobody else requests the signal on its
behalf.

## Progress Update

`comment` on the experiment issue:

```text
**Actual outcome:** what happened
**Learning:** what we learned
**Next step:** continue / pivot / new
```

## Conclusion

Every experiment concludes with one of three verdicts:

- **PASS** — the expected outcome held; the learning is confirmed.
- **FAIL** — the expected outcome did not hold; the hypothesis is refuted.
- **VOID** — the experiment could not be evaluated (e.g. evidence lost, scope
  changed out from under it); no learning either way.

`comment` the verdict, then `close` the issue:

```text
**Verdict:** PASS|FAIL|VOID — one-sentence learning
```

When a code-shipping experiment concludes **FAIL** or **VOID**, the owning
agent writes its approval row to `cancelled` (retaining the pin if the row was
ever `approved`, else `-`), which blocks any open Act PR referencing the
experiment:

```text
exp:{issue}	cancelled	{retained-pin-or-dash}	#{issue}
```

Report the closure via `Answer` so it lands in the session summary.
