---
name: kata-backlog-synthesis
description: >
  Consolidate a sprawling backlog of overlapping issues and PRs into a focused
  set. Partition into clusters, synthesize each cluster's root cause via
  grounded coding into one spec + design, then close the redundant issues and
  superseded PRs as duplicates. Use when ad-hoc per-item handling keeps
  reinventing the same moves. Improvement-coach scope extension.
---

# Backlog Synthesis

When the backlog sprawls into overlapping issues and PRs, partition it into
single-pattern clusters, then take each through grounded coding to one
spec + design that addresses the root cause, instruments any binding
constraint, and codifies the moves the team keeps reinventing per case.
Retire the cluster: close the redundant issues and superseded PRs, each
pointing at the new spec.

## When to Use

- A storyboard meeting Q3 surfaces multiple obstacles whose repair shapes
  rhyme.
- A producer-orphaning event lands on `main` (skill removed, renamed, or
  split) and a metric loses its producer — immediate trigger.
- The same RFC shape has appeared more than once because a richer channel was
  missing.
- A user requests a backlog synthesis run.

Do not run on a small corpus (under ~10 open obstacle+experiment items) or
fewer than 3 distinct repair-adjacent moves — premature synthesis manufactures
patterns from noise.

## Triggers

```sh
# Eligibility — at least one threshold must hold. Comma-separated `--label` ANDs;
# query each label separately, raise `--limit` past 30, and dedupe for the OR-union.
{ gh issue list --label obstacle --state open --json number --limit 1000;
  gh issue list --label experiment --state open --json number --limit 1000; } \
  | jq -s 'add | unique_by(.number) | length'   # ≥10 → eligible
```

A sweep processes every eligible cluster, at most once per ISO week, unless a
producer-orphaning event forces it.

## Checklists

<read_do_checklist goal="Hold the synthesis boundary before coding the corpus">

- [ ] Confirm at least one trigger threshold is met. Record which.
- [ ] Partition the backlog into single-pattern clusters. Each cluster is one
      corpus; run the method once per cluster.
- [ ] Close each corpus before coding it; later items do not bias the codes.
- [ ] Memos and codes go to scratch, not the wiki, until the proposition is
      selected.
- [ ] No claim enters the spec or design without an issue/PR number anchor.
- [ ] Stop at one core category per cluster. If two compete, the cluster is
      really two — split it and run each separately.

</read_do_checklist>

<do_confirm_checklist goal="Verify synthesis quality before opening artifacts">

- [ ] Every corpus item has a memo (3–5 sentences max).
- [ ] Every memo has at least one code.
- [ ] Codes group into 3–7 categories with stated relations.
- [ ] One core category is named; storyline reads end-to-end without
      referencing the codes table.
- [ ] One-sentence proposition recorded.
- [ ] Spec drafted via `kata-spec` with verifiable success criteria (no HOW).
- [ ] Design drafted via `kata-design` (≤200 lines, each decision rejects an
      alternative).
- [ ] Corpus map records, for every item, one of: directly addressed,
      binding-constraint instrumented, repair-move codified, superseded PR, or
      out of scope.
- [ ] Every addressed issue and superseded PR closed as duplicate, each with a
      comment pointing at the spec; **out-of-scope items left untouched**.

</do_confirm_checklist>

## Method

Use **grounded theory**: let the pattern emerge from the corpus, not from a
preformed hypothesis. The non-obvious disciplines:

- **Begin with no proposition**, and read every item — titles that rhyme often
  diverge in the body.
- **Code in the corpus's own language** (in-vivo phrases), not categories you
  bring to the analysis.
- **Memo as you go** (3–5 sentences per item): the central incident and what
  makes it surprising. Retrospective summaries are worth less.
- **Seek one central explanation, not a category list.** Group codes by asking
  what triggered each item, what discipline applied, and what failed when it
  lapsed. Look for repair moves invented per case, binding constraints never
  measured, disciplines with no canonical home, and producer/consumer
  couplings where one change rippled.

The strongest propositions are **grounded** (traceable to cited items),
**testable** (a future corpus can confirm or refute), and **actionable** (imply
a single spec).

### Phase Boundaries

Six checkpoints; output of each feeds the next.

1. Partition the backlog into clusters; gather each cluster's corpus (closed
   before coding).
2. Memo each item.
3. Code, group, name a core category.
4. Draft the proposition; reject if any code refused to fit.
5. Spec via `kata-spec`; design via `kata-design`.
6. Map back to the corpus; close addressed issues and superseded PRs, each
   pointing at the spec.

## Mapping Back to Corpus

Re-read the corpus, classify every item, then act on its disposition. The PR
body lists only the addressed buckets; **out-of-scope items receive no comment
and stay open**.

| Category | Trigger | Disposition |
| --- | --- | --- |
| **Directly addressed** | The meta-trigger; the spec resolves or absorbs the item. | Close as duplicate. Comment: "Spec NNN codifies `<move>`; the discipline would have surfaced this when …" |
| **Binding-constraint instrumented** | The item flagged the binding constraint; the spec adds the metric that reads it. | Close as duplicate. Comment: "Spec NNN Success #N adds `<metric>`, the standing meter for the constraint this item exemplifies." |
| **Repair-move codified** | The item invented or applied a move the spec now names. | Close as duplicate. Comment: "Spec NNN names `<move>` in the typology; this item is the cited precedent." |
| **Superseded PR** | An open PR carved off a slice the consolidated spec now absorbs. | Close the PR, pointing at the consolidated spec PR. A PR still independently shippable stays open. |
| **Out of scope** | Spec's Scope (out) names the item or its category. | Leave open; no comment. |

## Stopping Conditions

Halt the cluster and adjust in any of these cases:

- A single cluster splits into two competing core categories — it was
  mis-drawn; split it and run each subset.
- Open coding produces a category with one code and one incident — the
  corpus is too small for that category to be a pattern.
- The spec's Problem section cannot ground every claim in a cited item — the
  proposition is unsupported; return to coding.

## Coach Scope Exception

The coach's general "no writing specs or fix PRs" constraint
([`improvement-coach.md`](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/improvement-coach.md))
is extended here: the spec writes up what the corpus already implicitly
decided, not a new feature. Scoped to this skill.

## Memory: What to Record

Append to the current week's coach log
(`wiki/improvement-coach-$(date +%G-W%V).md`):

- **Trigger** — Which threshold fired, with the count and date.
- **Corpus** — Item numbers gathered (counts by label).
- **Core category** — The one selected, plus any rejected alternative.
- **Proposition** — The one-sentence proposition.
- **Spec / design / PR** — Numbers and links.
- **Corpus map** — Item → category table; out-of-scope items recorded here
  though they get no comment.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for eligibility.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/coordination-protocol.md)):

- **PR body** — Consolidated spec/design PR carries an Addresses overview
  listing the issues closed and the PRs it supersedes.
- **Issue/PR close** — Addressed issues and superseded PRs closed as duplicate,
  each commenting the spec link; never on out-of-scope items.
- **Storyboard headline** — The next storyboard meeting after a sweep surfaces
  the consolidated PR as a Q1 target-condition reference.

If two storyboard meetings pass without the spec PR approved, file an
obstacle — the consolidated PR is itself subject to the binding constraint
the spec proposed.
