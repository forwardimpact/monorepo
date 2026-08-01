# Issue Lifecycle

[work-definition.md](../../../agents/x-work-definition.md)
defines what an obstacle and an experiment *are*. It also gives the
obstacle-vs-experiment test. This file holds the operation recipes to file and
close them. Each recipe names an
[abstract operation](../../../agents/x-work-trackers.md#abstract-operations).
Its concrete shape per tracker lives in the
[matrix](../../../agents/x-work-trackers.md#the-matrix). Obstacle and
experiment are both issues. Only the label separates them.

The coached agent creates, comments on, and closes **its own** obstacle and
experiment issues. It does this in both team storyboard and 1-on-1 sessions.
The facilitator does none of this. The facilitator has no `Bash`. It `Ask`s the
agent to record each one. The agent **reports the `#NNN` back through
`Answer`** for the storyboard headlines and `Conclude` summary. The facilitator
cannot `list` to find it.

The storyboard's Active and Concluded lists render from issue state through the
deterministic `gemba-wiki refresh` step. Never hand-edit them.

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
`#NNN` as a bidirectional cross-reference. The obstacle then shows a visible
list of its related experiments.

The `**Expected outcome:**` line names metrics that a single skill owns. Skills
do not share runs. A prediction that names metrics from two different skills
cannot resolve in one run. Split it into one prediction per skill / run type.

The `agent:` label and `Owner:` name the **coached agent itself**, the agent
that runs this command:

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

Include the `**Execution plan:**` line when the experiment will **ship code**.
It names the intended change surface as a list of repo-root-anchored path globs
(e.g. `libraries/libfoo/**`, `.claude/skills/foo/**`). The merge gate compares
those globs against an Act PR's changed-file list without judgment. Omit the
line for experiments that ship no code.

When the plan ships code, the owning agent **also** writes the experiment's
approval row to its memory's `STATUS.md` at `registered` with an empty pin:

```text
exp:{issue}	registered	-	#{issue}
```

This is bookkeeping. The owning agent writes it, never the facilitator. A human
originates the row's `approved` state, and it is written elsewhere. See
[approval-signals.md § Experiment rows](../../../agents/x-approval-signals.md).

## At open-change (code-shipping experiments)

When the owning agent runs `open-change` for the experiment's Act change, it
requests the trusted human's `gate` signal on the change. The request names the
experiment issue. It also flags any time-sensitive evidence (e.g.
retention-bounded trace artifacts). The agent owns this ask. Nobody else
requests the signal on its behalf.

## Progress Update

`comment` on the experiment issue:

```text
**Actual outcome:** what happened
**Learning:** what we learned
**Next step:** continue / pivot / new
```

## Conclusion

Every experiment concludes with one of three verdicts:

- **PASS** — the expected outcome held. The result confirms the learning.
- **FAIL** — the expected outcome did not hold. The result refutes the
  hypothesis.
- **VOID** — nobody could evaluate the experiment (e.g. evidence lost, scope
  changed out from under it). There is no learning either way.

`comment` the verdict, then `close` the issue:

```text
**Verdict:** PASS|FAIL|VOID — one-sentence learning
```

When a code-shipping experiment concludes **FAIL** or **VOID**, the owning
agent writes its approval row to `cancelled`. Keep the pin if the row was ever
`approved`, else write `-`. The `cancelled` row blocks any open Act PR that
references the experiment:

```text
exp:{issue}	cancelled	{retained-pin-or-dash}	#{issue}
```

Report the closure through `Answer` so it lands in the session summary.
