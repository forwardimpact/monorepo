# Spec 0670: Product Manager Issue Progression

## Problem

The product manager agent triages issues correctly but never progresses them.
Five issues (#331, #357, #429, #438, #479) have sat in the backlog for 9–16 days
with the `triaged` label and no spec or fix. The agent's own wiki summary tracks
them as "needs spec" or "needs investigation" — it knows what to do but has no
instruction to do it.

Cross-trace analysis of 7 consecutive runs (April 26–27, 2026) shows:

| Run         | Skill loaded    | Domain-advancing result      | Issues touched |
| ----------- | --------------- | ---------------------------- | -------------- |
| 24948297842 | kata-product-pr | 0 PRs merged (both blocked)  | 0              |
| 24955067805 | kata-product-pr | 0 PRs merged (4 blocked)     | 0              |
| 24964775640 | kata-product-pr | 1 PR merged (#547)           | 0              |
| 24976926383 | kata-product-pr | 0 PRs merged (#550 blocked)  | 0              |
| 24993717005 | kata-product-pr | 0 PRs merged (#551 held)     | 0              |
| 25015950006 | kata-product-pr | 0 PRs merged (wiki catch-up) | 0              |
| 25024736001 | _(none)_        | Clean state reported         | 0              |

Total cost: $9.25. PRs merged: 1. Specs written: 0. Issues progressed: 0.

Three instruction-layer defects combine to produce this starvation:

### Defect 1: No assess step for triaged issues (L5 — agent profile)

The product manager's assess section has three steps:

> 1. Open PRs awaiting triage? → kata-product-pr
> 2. Open issues awaiting triage? → kata-product-issue
> 3. Nothing actionable? → Report clean state

There is no step for "triaged issues with pending actions." Once an issue is
classified and labeled, no instruction tells the agent to write its spec or make
its fix. The gap between step 2 and step 3 is where all spec-writing work should
live.

**Evidence (turn 22, run 25024736001):**

> "Issues: 5 open, all carry the `triaged` label... No new feedback in queue."
> Highest-priority action: None.

The agent sees the issues, confirms they are triaged, and concludes there is
nothing to do.

### Defect 2: `triaged` label blocks re-examination (L6 — kata-product-issue)

kata-product-issue Step 1 instructs: "Skip issues already labeled `triaged` or
`wontfix`." This was designed to prevent duplicate classification, but it also
prevents the agent from ever revisiting an issue — even to execute the follow-up
action (spec or fix) that the triage recommended.

The triage skill's Step 4 (Hand Off) labels issues `triaged` after
classification, with the expectation that the calling agent will immediately
take action. But the agent profile's step 1 (PR triage) takes priority, and by
the next run the label has made the issue invisible.

**Evidence (turn 29, run 24948297842):**

> "Surveying state: 2 open PRs (both non-mergeable by PM), 5 open issues (all
> triaged)... Let me invoke kata-product-pr for a proper merge-gate pass on the
> open PRs."

Even with zero actionable PRs, the agent chose PR triage over issue work.

### Defect 3: PR priority always wins (L5 — agent profile)

The assess section's ordering means PRs are processed before issues on every
run. Since there are always open PRs (even permanently blocked ones), the agent
never reaches issue work. In 6 of 7 runs, kata-product-pr was invoked to
re-confirm PRs that were already classified as blocked in prior runs.

**Evidence (turn 42, run 24955067805):**

> "All four PRs blocked-by-type — none in PM's mergeable set (fix/bug/spec)."

The agent spent 35 turns and $1.37 to arrive at the same conclusion as the
previous run.

## Scope

### In scope

| Component                                            | Change                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `.claude/agents/product-manager.md`                  | Ensure the agent progresses triaged issues that still need specs or fixes  |
| `.claude/skills/kata-product-issue/SKILL.md`         | Ensure the hand-off signals pending spec work so subsequent runs act on it |
| `.claude/skills/kata-trace/references/invariants.md` | Add invariant for issue progression                                        |

### Out of scope

- Changing PR type gates (fix/bug/spec eligibility)
- Reducing wiki bookkeeping overhead (procedurally correct, separate concern)
- Changing how kata-product-evaluation creates issues

## Success Criteria

| #   | Criterion                                                                                                                | Verification                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1   | The product manager agent writes a spec or opens a fix PR for a triaged issue when no PRs are mergeable                  | Run the agent with zero mergeable PRs and triaged issues labeled `needs-spec`; confirm kata-spec is invoked         |
| 2   | kata-product-issue's hand-off ensures the agent returns to write a spec for product-aligned issues in a subsequent run   | Triage a product-aligned issue, then verify the next run picks it up for spec work instead of reporting clean state |
| 3   | kata-trace flags a violation when no triaged issue is progressed in a run with zero mergeable PRs and pending issue work | Check that `references/invariants.md` contains an issue-progression invariant under the product-manager section     |

## Design Context

The `triaged` label already serves as a coordination signal between
kata-product-issue and the agent profile — it marks classification as complete.
A `needs-spec` label would follow the same pattern: an action signal set during
triage hand-off that the agent's assess step can query directly via
`gh issue list --label needs-spec`. This is simpler than the existing `SPEC_DUE`
wiki marker (kata-product-pr Step 2), which has a documented write-pipeline
reliability caveat, single-issue cardinality, and a structural attractor failure
confirmed across storyboard Experiments 3, 4, 5, 6, 8, and 10. A label is
GitHub-native, multi-issue, visible to humans, and immune to wiki sync failures.

Note: a `needs-spec` label supplements `triaged` rather than replacing it. The
issue stays triaged (kata-product-issue still skips it for re-classification).
The label signals the next action, not a lifecycle state change. This is
distinct from the rejected two-label lifecycle (`classified` + `actioned`) which
would have replaced `triaged` entirely.

## Alternatives Considered

| Alternative                                              | Trade-off                   | Why not                                                                                                                                                                                      |
| -------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two-label lifecycle (`classified` + `actioned`)          | More precise state tracking | Replaces `triaged` with two labels, adding lifecycle complexity; a supplementary action label (`needs-spec`) achieves the goal without changing the existing classification flow             |
| Wiki `SPEC_DUE` marker (kata-product-pr Step 2)          | Reuses existing mechanism   | Storyboard Experiments 3–10 confirmed a structural attractor where triage always runs first regardless of marker; wiki writes have a documented reliability caveat; single-issue cardinality |
| Remove the `triaged` skip filter from kata-product-issue | Allows re-examination       | Would re-classify already-classified issues every run, wasting turns on duplicate triage                                                                                                     |
| Add issue work to kata-product-pr as a final step        | Same-run integration        | Violates the PR/issue separation the skills are designed around; would make an already-long skill even longer                                                                                |
