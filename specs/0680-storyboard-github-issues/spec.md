# Spec 0680 — Track Storyboard Experiments and Obstacles as GitHub Issues

## Problem

Experiments and obstacles in the monthly storyboard
(`wiki/storyboard-YYYY-MNN.md`) are free-text sections that grow unbounded. The
April 2026 storyboard carries 14 active experiments and 13 active obstacles —
over 400 lines of inline PDSA content. This creates three problems:

1. **Discoverability.** Items drown in a single long file. Finding experiment 14
   means scrolling past 12 other experiments. No search, no filtering, no
   assignment.
2. **Visibility for humans.** The wiki is an agent coordination surface. Humans
   in the loop must read a wall of markdown to find the one item they need to
   decide on — or miss it entirely (e.g., Exp 12 approvals dossier buried among
   22 other experiments).
3. **No conversation space.** Progress updates, agent comments, and verdict
   discussions happen as edits to the same storyboard text. There is no threaded
   history per item — only the latest state survives, and intermediate reasoning
   is lost in git diffs.

GitHub issues are the standard coordination mechanism for work in this repo.
Specs, bugs, and features are already tracked as issues. Experiments and
obstacles are work too — they have owners, expected outcomes, and deadlines —
but they bypass the issue system entirely.

## Scope

### In scope

| Area                  | Change                                                                            |
| --------------------- | --------------------------------------------------------------------------------- |
| GitHub issue labels   | Add `experiment` and `obstacle` labels to the repository                          |
| Storyboard format     | Replace inline experiment/obstacle content with lightweight issue references      |
| `kata-session` skill  | Update storyboard template and facilitator process to create/reference issues     |
| Storyboard workflow   | Add `issues: write` permission to `kata-storyboard.yml`                           |
| PM triage bypass      | Exclude `experiment` and `obstacle` issues from the product-manager's triage gate |
| Coordination channels | Define single-source-of-truth ownership for experiment/obstacle state             |

### Out of scope

| Area                                                      | Reason                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Individual agent workflow permissions                     | Only the storyboard workflow creates/comments on experiment issues; agents do not comment during solo runs |
| Challenge / Target Condition / Current Condition sections | These are storyboard-native — they summarize team state, not individual work items                         |
| Existing concluded experiments                            | Already archived; no backfill                                                                              |
| GitHub Projects boards                                    | Optional future enhancement, not required for this change                                                  |

## What Changes

### Issue labels

Two new GitHub labels — `experiment` and `obstacle` — are added to the
repository. Each experiment or obstacle becomes a GitHub issue with the
corresponding label applied at creation.

### Storyboard format

The Obstacles and Experiments sections in `wiki/storyboard-YYYY-MNN.md` change
from multi-line inline content to one-line issue references. The "Exp N" naming
convention is preserved as the human-readable identifier; the issue number is
appended as a link:

```text
- Exp 15 (#527) — SE coverage retirement proposal
```

The full PDSA content (What, Expected outcome, Actual outcome, What did we
learn, Next step) lives in the issue body. All other storyboard sections
(Current Condition, Target Condition, Next Review) continue to reference
experiments by "Exp N" with the issue link in parentheses.

Concluded items follow the existing 7-day retention rule — the storyboard entry
rolls off, but the closed issue remains as a permanent, searchable archive. This
is strictly better than the current git-history-only archive.

### Channel ownership

The issue is the single source of truth for experiment and obstacle state. To
prevent competing sources of truth across the five coordination channels:

1. **Issue owns state.** The issue body and comment thread are the authoritative
   record of an experiment or obstacle: hypothesis, progress, and verdict. No
   other channel restates this content.
2. **Storyboard references, never duplicates.** The storyboard lists active
   experiments and obstacles as one-line issue references. Observations made
   during a session are posted as issue comments, not written into the
   storyboard.
3. **Wiki cites, never summarizes.** The weekly log records the issue URL and a
   one-line disposition (open / closed / blocked). The full narrative stays in
   the issue.
4. **Closing comment captures learning.** When an experiment concludes, the
   agent writes the "what did we learn" verdict as a closing comment on the
   issue, then closes it. The wiki log picks up the URL — no separate summary.
5. **No cross-channel duplication for visibility.** If the same content appears
   in two channels, one of them is wrong.

### PM triage bypass

Experiment and Obstacle issues are process-improvement artifacts, not product
work. The product-manager agent's triage gate must exclude them entirely:

- Issues labeled `experiment` or `obstacle` do not enter the PM's P1/P2/P3
  buckets.
- `kata-product-issue` does not classify or write specs for them.
- The `open_issues` metric excludes issues with `experiment` or `obstacle`
  labels so that existing XmR process limits and signals remain valid.

### Experiments link to obstacles

Each experiment issue references its parent obstacle issue in the body. GitHub
renders this as a bidirectional cross-reference, giving each obstacle a visible
list of its related experiments.

### Workflow permissions

The `kata-storyboard.yml` workflow gains `issues: write` permission. This is the
only workflow that creates or comments on experiment/obstacle issues — the
improvement coach posts on behalf of agents during facilitated sessions.
Individual agent workflows are unchanged.

### Migration

At cutover, each currently active experiment and obstacle gets a GitHub issue
created. The storyboard entry gains the issue link suffix `(#NNN)`. Concluded
experiments that have already rolled off need no action.

## Success Criteria

| #   | Criterion                                                                         | Verification                                                                                                                          |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `experiment` and `obstacle` labels exist in the repository                        | `gh label list` returns both labels                                                                                                   |
| 2   | The storyboard template uses one-line issue references with `Exp N (#NNN)` format | `wiki/storyboard-YYYY-MNN.md` contains issue-linked references, no inline PDSA blocks                                                 |
| 3   | New experiments and obstacles are created as labeled GitHub issues                | `gh issue list --label experiment` and `gh issue list --label obstacle` return issues created during a storyboard session             |
| 4   | The improvement coach comments on experiment issues during storyboard sessions    | Issue timeline shows progress comments posted during facilitated sessions                                                             |
| 5   | Experiments reference their parent obstacle issue                                 | Issue body contains an obstacle issue reference and GitHub renders the cross-reference                                                |
| 6   | PM triage excludes experiment and obstacle issues                                 | PM's `gh issue list` survey returns zero `experiment`/`obstacle`-labeled issues; `open_issues` metric is unaffected by their creation |
| 7   | No content duplication across channels                                            | Weekly wiki logs cite issue URLs without restating PDSA content; storyboard entries are one-liners                                    |
