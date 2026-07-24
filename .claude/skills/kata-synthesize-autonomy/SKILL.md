---
name: kata-synthesize-autonomy
description: >
  Assess whether the balance between agent autonomy and human approval is
  reasonable, via grounded theory analysis of the repository's full change
  history. Codes every open, merged, and closed change for who authorized its
  outcome, compares practice against the stated governance model, and delivers
  an evidence-grounded verdict. Use when reviewing governance health, after a
  trust-boundary or approval-gate change, or when gate bypasses are suspected.
  Improvement-coach scope extension.
---

# Autonomy Synthesis

The governance model states who approves and who merges. This skill measures
who actually did, across the whole change history, and reports where practice
diverges from the stated rules. The output is an assessment with a
recommendation, not a blame record: ask what made the observed path the easy
one.

## When to Use

- Periodic governance health review of an agent-team installation.
- The trust boundary or an approval gate changed and its effect needs
  measurement.
- Admin-merge bypasses, approval droughts, or silently widening agent-merge
  classes are suspected.
- A user requests an autonomy-vs-approval assessment.

Not for single-change mergeability (that is `kata-release-merge`) or backlog
consolidation (that is `kata-backlog-synthesis`).

## Checklists

<read_do_checklist goal="Hold the analysis boundary before coding the corpus">

- [ ] Read the stated governance model first (KATA.md trust boundary and
      approval signals,
      [approval-signals.md](../../agents/x-approval-signals.md),
      `wiki/STATUS.md`). Record each rule as a falsifiable expectation.
- [ ] Close the corpus before coding: enumerate every change — open, merged,
      and closed-unmerged — and record the count and enumeration point.
- [ ] Code who authorized each outcome, in the corpus's own language; the
      governance vocabulary is the comparison surface, not the code list.
- [ ] Quote evidence in-vivo, with the change number as anchor.
- [ ] The artifact record outranks the team's memory; where they disagree,
      memo the disagreement as a finding.
- [ ] Stop at one core category. If two compete, split the corpus by era or
      lane and run each.

</read_do_checklist>

<do_confirm_checklist goal="Verify synthesis quality before publishing the verdict">

- [ ] Every corpus change has exactly one coded row: attribution, evidence,
      code.
- [ ] Distribution table computed: count and share per category, plus an
      author-to-merger matrix over merged changes.
- [ ] Every category cites at least one change by number.
- [ ] Divergences from the stated model each pair the rule with its
      counter-evidence.
- [ ] One core category named; the storyline reads end-to-end without the
      codes table.
- [ ] The verdict answers "is the level reasonable" separately for agent
      autonomy and for human approval.
- [ ] Report published per coordination channels; structural findings routed
      to `kata-spec`, never fixed inline.

</do_confirm_checklist>

## Method

Use grounded theory: let the pattern emerge from the record, not from a
preformed hypothesis. The disciplines specific to this analysis:

- **The unit is the change, and the population is total.** Sampling hides the
  tails, and the tails carry the theory: the still-open changes measure
  approval latency, the closed-unmerged ones measure what died waiting.
- **Code the authorization, not the content.** Who reviewed, who signaled, who
  merged, and under which stated rule — not what the diff did.
- **Silence is data.** A merge with zero reviews, a gate that posted no
  verdict, a requested reviewer who never answered: each is evidence, not a
  gap in it.
- **Timing is data.** Open-to-merge latency separates deliberation from
  inbox-clearing; merges landing in bursts of minutes contradict per-artifact
  approval semantics.
- **Track precedent chains.** When a merge cites an earlier merge as its
  authority, follow the chain to its root; an exemption class that traces to
  an irregular merge instead of a written rule is self-broadening autonomy.
- **Memo as you go.** Three to five sentences per surprise, at coding time.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
Analysis runs write only reports and wiki records — do not `gemba-wiki claim`
unless the run opens a PR.

### Step 1: Ground the Stated Model

Extract the governance rules as falsifiable expectations: which signals count,
who may originate each, who may merge which class, and which classes are
exempt. Each expectation must name the artifact evidence that would confirm or
refute it.

### Step 2: Enumerate the Corpus

`list` every change against the default branch — open, merged, and
closed-unmerged ([work-trackers.md](../../agents/x-work-trackers.md)). Record
the total and the enumeration point. The corpus closes here; changes landing
later belong to the next run.

### Step 3: Collect Approval Trails

For each change, gather one evidence tuple: author, merger, every review with
its state, human comments (quoted), and the gate's own verdict comments
(approval source cited, or block reason). Fan out sub-agents over corpus
partitions when the corpus is large; each returns rows in one fixed shape so
the merge is mechanical.

### Step 4: Open-Code Each Change

Assign each change one code naming who authorized its outcome. Invent codes
from the evidence; do not force the governance vocabulary onto rows it does
not fit. Memo contradictions between what participants said and what they did.

### Step 5: Axial Coding

Consolidate the open codes into categories with stated relations. Compute the
distribution table and the author-to-merger matrix. Name exemplar changes per
category.

### Step 6: Sample the Team's Memory

Read the wiki ledger, summaries, and logs for the team's own account of the
same events. Corroboration strengthens a category; contradiction is a finding
about record integrity. This is theoretical sampling — return to Step 3 for
any change the memory reframes.

### Step 7: Select the Core Category

Name the one central explanation that relates the categories — the storyline a
reader can follow without the codes table. Reject it if any category refuses
to fit; re-code rather than trim the evidence.

### Step 8: Assess and Route

Deliver a split verdict: is the level of agent autonomy reasonable, and is the
level of human approval reasonable — the two fail independently. Ground every
recommendation in cited changes. Publish the report per coordination channels;
route structural findings to `kata-spec` under the fix-or-spec discipline.

## Stopping Conditions

- The corpus is small (under ~20 changes) — counts would be anecdotes;
  record the baseline and stop.
- Merger identity or review data cannot be established from the tracker —
  report the tooling gap instead of coding around it.
- Two core categories persist after an era or lane split — publish both
  corpora as separate analyses.

## Memory: What to Record

Append to the current week's log:

- **Corpus** — total changes, enumeration point, partition layout.
- **Distribution** — the category table and author-to-merger matrix.
- **Core category** — the one selected, plus any rejected alternative.
- **Verdict** — both halves, with the changes each cites.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](../../agents/x-coordination-protocol.md)):

- **Discussion or issue** — the assessment report, carrying the distribution
  table, core category, and split verdict.
- **Spec PR** — structural findings routed via `kata-spec`, each grounded in
  cited changes.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).
