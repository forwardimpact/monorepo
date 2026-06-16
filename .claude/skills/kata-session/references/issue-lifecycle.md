# Issue Lifecycle

What an obstacle and an experiment *are* — and the obstacle-vs-experiment test —
is defined in
[work-definition.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/work-definition.md); this file is
the `gh` command shapes for filing and closing them.

The agent being coached — not the facilitator — creates, comments on, and closes
**its own** obstacle and experiment issues with `gh`, in both team storyboard and
1-on-1 sessions. The facilitator has no `Bash`: it `Ask`s the agent to record
each one, and the agent **reports the `#NNN` back via `Answer`** (the facilitator
can't `gh issue list` to find it) for the storyboard headlines and `Conclude`
summary.

The storyboard's Active and Concluded lists render from issue state via the
deterministic `fit-wiki refresh` step — never hand-edit them.

## New Obstacle

```sh
gh issue create --label obstacle \
  --title "Obstacle name" \
  --body "Description.

Blocking dimension: [which gap this blocks]"
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

```sh
gh issue create --label experiment --label "agent:[your-agent-name]" \
  --title "Exp N — short name" \
  --body "Obstacle: #NNN
Owner: [your agent name]

**What:** description
**Expected outcome:** prediction"
```

## Progress Update

```sh
gh issue comment #NNN --body "**Actual outcome:** what happened
**Learning:** what we learned
**Next step:** continue / pivot / new"
```

## Conclusion

```sh
gh issue comment #NNN --body "**Verdict:** one-sentence learning"
gh issue close #NNN
```

Report the closure via `Answer` so it lands in the session summary.
