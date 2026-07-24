---
name: kata-synthesize-backlog
description: >
  Consolidate a sprawling backlog of overlapping issues and PRs into a focused
  set, via grounded theory analysis of the open backlog. Partitions the
  backlog into clusters, codes each cluster's corpus to one root cause,
  synthesizes one spec + design, and closes the redundant issues and
  superseded PRs as duplicates. Use when ad-hoc per-item handling keeps
  reinventing the same moves. Improvement-coach scope extension.
---

# Backlog Synthesis

A sprawling backlog restates one problem many times. This skill codes each
cluster's corpus through grounded theory to its shared root cause and
synthesizes one spec + design that addresses it. The cluster then retires:
redundant issues and superseded PRs close, each pointing at the new spec.

## When to Use

- A storyboard meeting Q3 surfaces multiple obstacles whose repair shapes
  rhyme.
- A producer-orphaning event lands on the default branch (skill removed,
  renamed, or split) and a metric loses its producer — immediate trigger.
- The same RFC shape keeps reappearing because a richer channel was missing.
- A user requests a backlog synthesis run.

Not for single-change mergeability (that is `kata-release-merge`) or
governance health measurement (that is `kata-synthesize-autonomy`).

## Triggers

Eligibility — at least one threshold must hold. `list` open issues for the
`obstacle` and `experiment` labels separately, then dedupe by number for the
OR-union (a label filter ANDs, so a single combined query would miss items
carrying only one label); ≥10 unique items → eligible
([work-trackers.md](../../agents/x-work-trackers.md)).

A sweep processes every eligible cluster, at most once per ISO week, unless a
producer-orphaning event forces it. Do not run on a small corpus (under ~10
items, or under 3 distinct repair-adjacent moves) — premature synthesis
manufactures patterns from noise.

## Checklists

<read_do_checklist goal="Hold the synthesis boundary before coding the corpus">

- [ ] Confirm at least one trigger threshold is met. Record which.
- [ ] Partition the backlog into single-pattern clusters. Each cluster is one
      corpus; run the method once per cluster.
- [ ] Close each corpus before coding it; later items do not bias the codes.
- [ ] Code in the corpus's own language; memos and codes go to scratch, not
      the wiki, until the proposition is selected.
- [ ] No claim enters the spec or design without an issue/PR number anchor.
- [ ] Stop at one core category per cluster. If two compete, the cluster is
      really two — split it and run each separately.

</read_do_checklist>

<do_confirm_checklist goal="Verify synthesis quality before opening artifacts">

- [ ] Every corpus item has a memo (3–5 sentences max) and at least one code.
- [ ] Codes group into 3–7 categories with stated relations.
- [ ] One core category is named; storyline reads end-to-end without
      referencing the codes table.
- [ ] One-sentence proposition recorded.
- [ ] Spec drafted via `kata-spec` with verifiable success criteria (no HOW).
- [ ] Design drafted via `kata-design` (≤200 lines, each decision rejects an
      alternative).
- [ ] Corpus map records one disposition per item, per
      [`references/corpus-map.md`](references/corpus-map.md).
- [ ] Every addressed issue and superseded PR closed as duplicate, each with a
      comment pointing at the spec; **out-of-scope items left untouched**.

</do_confirm_checklist>

## Method

Use grounded theory: let the pattern emerge from the record, not from a
preformed hypothesis. The disciplines specific to this interrogation:

- **The unit is the backlog item, and the corpus is the cluster.** Begin with
  no proposition, and read every item — titles that rhyme often diverge in
  the body.
- **Code in the corpus's own language** (in-vivo phrases), not categories you
  bring to the analysis.
- **Memo as you go** (3–5 sentences per item): the central incident and what
  makes it surprising. Retrospective summaries are worth less.
- **Seek one central explanation, not a category list.** Group codes by
  asking what triggered each item, what discipline applied, and what failed
  when it lapsed. Look for repair moves invented per case, binding
  constraints never measured, disciplines with no canonical home, and
  producer/consumer couplings where one change rippled.

The strongest propositions are **grounded** (traceable to cited items),
**testable** (a future corpus can refute), and **actionable** (one spec).

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
This skill opens a spec PR — `gemba-wiki claim` before the first write.

### Step 1: Confirm Triggers and Partition

Verify a trigger threshold from § Triggers and record which fired. Partition
the backlog into single-pattern clusters; each runs the remaining steps.

### Step 2: Close the Corpus

Gather the cluster's items — issues and PRs, with bodies and comment threads.
Record the count and the enumeration point. The corpus closes here; items
landing later belong to the next sweep.

### Step 3: Memo Each Item

Write each item's memo at reading time: the central incident and what makes
it surprising.

### Step 4: Open-Code the Corpus

Assign each memo one or more codes in the corpus's own language. Do not force
categories onto items they do not fit.

### Step 5: Axial Coding

Group the open codes into 3–7 categories with stated relations. Name exemplar
items per category.

### Step 6: Select the Core Category

Name the one central explanation that relates the categories — the storyline
a reader can follow without the codes table. Reject it if any code refused to
fit; re-code rather than trim the evidence.

### Step 7: Draft the Proposition

Record the one-sentence proposition: grounded, testable, actionable.

### Step 8: Spec, Design, and Map Back

Draft the spec via `kata-spec` and the design via `kata-design`. Re-read the
corpus and act on every item's disposition per
[`references/corpus-map.md`](references/corpus-map.md).

## Stopping Conditions

- A single cluster splits into two competing core categories — it was
  mis-drawn; split it and run each subset.
- Open coding produces a category with one code and one incident — the corpus
  is too small for that category to be a pattern.
- The spec's Problem section cannot ground every claim in a cited item — the
  proposition is unsupported; return to coding.

## Coach Scope Exception

The coach's general "no writing specs or fix PRs" constraint
([`improvement-coach.md`](../../agents/improvement-coach.md)) is extended
here: the spec writes up what the corpus already implicitly decided, not a
new feature. Scoped to this skill.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Trigger** — Which threshold fired, with the count and date.
- **Corpus** — Item numbers gathered (counts by label).
- **Core category** — The one selected, plus any rejected alternative.
- **Proposition** — The one-sentence proposition.
- **Spec / design / PR** — Numbers and links.
- **Corpus map** — Item → disposition table, out-of-scope items included.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](../../agents/x-coordination-protocol.md)):

- **PR body** — Consolidated spec/design PR carries an Addresses overview
  listing the issues closed and the PRs it supersedes.
- **Issue/PR close** — Addressed issues and superseded PRs closed as
  duplicate, each commenting the spec link; never on out-of-scope items.
- **Storyboard headline** — The next storyboard meeting after a sweep
  surfaces the consolidated PR as a Q1 target-condition reference. If two
  meetings pass without the spec PR approved, file an obstacle.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).
