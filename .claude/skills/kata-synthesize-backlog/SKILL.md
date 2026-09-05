---
name: kata-synthesize-backlog
description: >
  Consolidate a sprawling backlog of overlapping issues and PRs into a focused
  set. Use grounded theory analysis of the open backlog. Partitions the backlog
  into clusters. Codes each cluster's corpus to one root cause. Synthesizes one
  spec + design. Closes the redundant issues and superseded PRs as duplicates.
  Use when ad-hoc per-item work repeatedly reinvents the same moves.
  Improvement-coach scope extension.
---

# Backlog Synthesis

A sprawling backlog restates one problem many times. This skill codes each
cluster's corpus through grounded theory to its shared root cause. It then
synthesizes one spec + design that addresses that cause. The cluster then
retires. Redundant issues and superseded PRs close, and each one points at the
new spec.

## When to Use

- A storyboard meeting Q3 surfaces multiple obstacles whose repair shapes
  rhyme.
- A producer-orphaning event lands on the default branch (skill removed,
  renamed, or split) and a metric loses its producer. Treat this as an
  immediate trigger.
- The same RFC shape reappears because a richer channel does not exist.
- A user requests a backlog synthesis run.

Do not use this for single-change mergeability (use `kata-release-merge`) or
governance health measurement (use `kata-synthesize-autonomy`).

## Triggers

At least one threshold must hold for a run to be eligible. `list` open issues
for the `obstacle` and `experiment` labels separately. Then dedupe by number
for the OR-union. A label filter ANDs, so a single combined query would miss
items that carry only one label. ≥10 unique items make a run eligible
([work-trackers.md](../../agents/x-work-trackers.md)).

A sweep processes every eligible cluster. Sweep at most once per ISO week,
unless a producer-orphaning event forces an extra sweep. Do not run on a small
corpus (under ~10 items, or under 3 distinct repair-adjacent moves). Premature
synthesis manufactures patterns from noise.

## Checklists

<read_do_checklist goal="Hold the synthesis boundary before coding the corpus">

- [ ] Confirm that at least one trigger threshold holds. Record which one.
- [ ] Partition the backlog into single-pattern clusters. Each cluster is one
      corpus. Run the method once per cluster.
- [ ] Close each corpus before you code it. Later items then do not bias the
      codes.
- [ ] Code in the corpus's own language. Memos and codes go to scratch, and
      not to the wiki, until you select the proposition.
- [ ] No claim enters the spec or design without an issue/PR number anchor.
- [ ] Stop at one core category per cluster. If two compete, the cluster is
      really two. Split it and run each separately.

</read_do_checklist>

<do_confirm_checklist goal="Verify synthesis quality before opening artifacts">

- [ ] Every corpus item has a memo (3–5 sentences max) and at least one code.
- [ ] Codes group into 3–7 categories with stated relations.
- [ ] One core category is named. The storyline reads end-to-end with no
      reference to the codes table.
- [ ] Record the one-sentence proposition.
- [ ] Draft the spec through `kata-spec` with verifiable success criteria (no
      HOW).
- [ ] Draft the design through `kata-design` (≤200 lines, each decision
      rejects an alternative).
- [ ] The corpus map records one disposition per item, per
      [`references/corpus-map.md`](references/corpus-map.md).
- [ ] Close every addressed issue and superseded PR as duplicate, each with a
      comment that points at the spec. **Leave out-of-scope items untouched**.

</do_confirm_checklist>

## Method

Use grounded theory. Let the pattern emerge from the record. Do not start from
a preformed hypothesis. These disciplines are specific to this interrogation:

- **The unit is the backlog item, and the corpus is the cluster.** Begin with
  no proposition. Read every item. Titles that rhyme often diverge in the body.
- **Code in the corpus's own language** (in-vivo phrases). Do not use
  categories you bring to the analysis.
- **Memo as you go** (3–5 sentences per item). Record the central incident and
  what makes it surprising. Retrospective summaries are worth less.
- **Seek one central explanation.** Do not build a category list. Group codes.
  Ask what triggered each item, what discipline applied, and what failed when
  it lapsed. Look for repair moves invented per case and binding constraints
  never measured. Look also for disciplines with no canonical home and
  producer/consumer couplings where one change rippled.

The strongest propositions are **grounded** (traceable to cited items),
**testable** (a future corpus can refute), and **actionable** (one spec).

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
This skill opens a spec PR. Run `gemba-wiki claim` before the first write.

### Step 1: Confirm Triggers and Partition

Verify a trigger threshold from § Triggers. Record which one fired. Partition
the backlog into single-pattern clusters. Each cluster runs the rest of the
steps.

### Step 2: Close the Corpus

Gather the cluster's items: issues and PRs, with bodies and comment threads.
Record the count and the enumeration point. The corpus closes here. Items that
land later belong to the next sweep.

### Step 3: Memo Each Item

Write each item's memo while you read the item. Record the central incident
and what makes it surprising.

### Step 4: Open-Code the Corpus

Assign each memo one or more codes in the corpus's own language. Do not force
categories onto items they do not fit.

### Step 5: Axial Coding

Group the open codes into 3–7 categories with stated relations. Name exemplar
items per category.

### Step 6: Select the Core Category

Name the one central explanation that relates the categories. That explanation
is the storyline a reader can follow without the codes table. Reject it if any
code refused to fit. Re-code the evidence. Do not trim it.

### Step 7: Draft the Proposition

Record the one-sentence proposition: grounded, testable, actionable.

### Step 8: Spec, Design, and Map Back

Draft the spec through `kata-spec` and the design through `kata-design`.
Re-read the corpus. Act on every item's disposition per
[`references/corpus-map.md`](references/corpus-map.md).

## Stopping Conditions

- A single cluster splits into two core categories that compete. The cluster
  was mis-drawn. Split it and run each subset.
- Open coding produces a category with one code and one incident. The corpus
  is too small for that category to be a pattern.
- The spec's Problem section cannot ground every claim in a cited item. The
  proposition is unsupported. Return to coding.

## Coach Scope Exception

This skill extends the coach's general "no writing specs or fix PRs"
constraint (the `improvement-coach` profile). The
spec writes up what the corpus already implicitly decided. It does not add a
new feature. The extension is scoped to this skill.

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

- **PR body** — The consolidated spec/design PR carries an Addresses overview.
  That overview lists the issues closed and the PRs it supersedes.
- **Issue/PR close** — Close addressed issues and superseded PRs as duplicate.
  Comment the spec link on each. Never comment on out-of-scope items.
- **Storyboard headline** — The next storyboard meeting after a sweep surfaces
  the consolidated PR as a Q1 target-condition reference. If two meetings pass
  and nobody approves the spec PR, file an obstacle.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).
