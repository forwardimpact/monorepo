---
name: kata-synthesize-autonomy
description: >
  Assess whether the balance between agent autonomy and human approval is
  reasonable. Use grounded theory analysis over the full change history. Codes
  every open, merged, and closed change for who authorized its outcome.
  Compares practice against the stated governance model. Delivers an
  evidence-grounded verdict. Use when you review governance health, after a
  trust-boundary or approval-gate change, or when you suspect gate bypasses.
  Improvement-coach scope extension.
---

# Autonomy Synthesis

The governance model states who approves and who merges. This skill measures
who actually did across the whole change history. It reports where practice
diverges from the stated rules. The output is an assessment. It is not a blame
record. Ask what made the observed path the easy one.

## When to Use

- A periodic review of governance health for an agent-team installation.
- The trust boundary or an approval gate changed. You must measure its effect.
- You suspect admin-merge bypasses, approval droughts, or agent-merge classes
  that widen silently.
- A user requests an autonomy-vs-approval assessment.

Do not use this for single-change mergeability (use `kata-release-merge`) or
backlog consolidation (use `kata-synthesize-backlog`).

## Triggers

At least one condition makes a run eligible. A governance surface changed
since the last run (trust boundary, approval signals, or gate skills). You
suspect a bypass, a drought, or a merge class that widens. A user requests a
run.

A run covers the full change history. Run at most once per ISO month, unless a
suspicion forces an extra run. Governance drifts slowly. Do not run on a small
corpus (under ~20 changes). The counts would be anecdotes. Record the baseline
instead.

## Checklists

<read_do_checklist goal="Hold the synthesis boundary before coding the corpus">

- [ ] Read the stated governance model first (KATA.md,
      [approval-signals.md](../../agents/x-approval-signals.md),
      `wiki/STATUS.md`). Record each rule as a falsifiable expectation.
- [ ] Close the corpus before you code it. Enumerate every change: open,
      merged, and closed-unmerged. Record the count and enumeration point.
- [ ] Code who authorized each outcome, in the corpus's own language. The
      governance vocabulary is the comparison surface. It is not the code list.
- [ ] Quote evidence in-vivo, with the change number as the anchor.
- [ ] The artifact record outranks the team's memory. Where they disagree,
      memo the disagreement as a finding.
- [ ] Stop at one core category. If two compete, split the corpus by era or
      lane and run each separately.

</read_do_checklist>

<do_confirm_checklist goal="Verify synthesis quality before publishing the verdict">

- [ ] Every corpus change has exactly one coded row: attribution, evidence,
      code.
- [ ] The distribution table gives the count and share per category. It adds
      an author-to-merger matrix over merged changes.
- [ ] Every category cites at least one change by number.
- [ ] Divergences from the stated model each pair the rule with its
      counter-evidence.
- [ ] One core category is named. The storyline reads end-to-end with no
      reference to the codes table.
- [ ] The verdict answers "is the level reasonable" separately for agent
      autonomy and for human approval.
- [ ] Publish the report per coordination channels. Route structural findings
      to `kata-spec`. Never fix them inline.

</do_confirm_checklist>

## Method

Use grounded theory. Let the pattern emerge from the record. Do not start from
a preformed hypothesis. These disciplines are specific to this interrogation:

- **The unit is the change, and the corpus is the total population.** A sample
  hides the tails. The tails carry the theory. Still-open changes measure
  approval latency. Closed changes measure what died while it waited.
- **Code the authorization.** Do not code the content. Record who reviewed,
  who signaled, who merged, and under which stated rule. Do not record what
  the diff did.
- **Silence is data.** Each of these is evidence: a merge with zero reviews, a
  gate that posted no verdict, and a requested reviewer who never answered.
- **Time is data.** Open-to-merge latency shows whether a merger deliberated
  or only cleared an inbox. Merge bursts contradict per-artifact approval
  semantics.
- **Track precedent chains.** When a merge cites an earlier merge as its
  authority, follow the chain to its root. An exemption class can trace to an
  irregular merge instead of a written rule. That class broadens autonomy by
  itself.
- **Memo as you go** (3–5 sentences per surprise), while you code.
  Retrospective summaries are worth less.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
This skill publishes reports. Run `gemba-wiki claim` only when a run opens a PR.

### Step 1: Ground the Stated Model

Extract the governance rules as falsifiable expectations: which signals
count, who may originate each, who may merge which class, and which classes
are exempt. Each expectation names the artifact evidence that would refute it.

### Step 2: Close the Corpus

`list` every change against the default branch: open, merged, and
closed-unmerged ([work-trackers.md](../../agents/x-work-trackers.md)). Record
the count and the enumeration point. The corpus closes here. Changes that land
later belong to the next run.

### Step 3: Collect Approval Trails

For each change, gather one evidence tuple: author, merger, every review with
its state, human comments (quoted), and the gate's own verdict comments
(approval source cited, or block reason). Fan out sub-agents over partitions
when the corpus is large. Each sub-agent returns rows in one fixed shape.

### Step 4: Open-Code the Corpus

Assign each change one code that names who authorized its outcome. Invent
codes from the evidence. Do not force the governance vocabulary onto rows it
does not fit. Memo contradictions between what participants said and did.

### Step 5: Axial Coding

Group the open codes into categories with stated relations. Compute the
distribution table and the author-to-merger matrix. Name exemplar changes per
category.

### Step 6: Sample the Team's Memory

Read the wiki ledger, summaries, and logs for the team's own account of the
same events. Corroboration strengthens a category. Contradiction is a finding
about record integrity. Return to Step 3 for any change the memory reframes.

### Step 7: Select the Core Category

Name the one central explanation that relates the categories. That explanation
is the storyline a reader can follow without the codes table. Reject it if any
category refused to fit. Re-code the evidence. Do not trim it.

### Step 8: Assess and Route

Deliver a split verdict. Say whether the level of agent autonomy is
reasonable. Say whether the level of human approval is reasonable. The two
fail independently. Ground every recommendation in cited changes. Publish the
report per coordination channels. Route structural findings to `kata-spec`.

## Stopping Conditions

- Two core categories persist after an era or lane split. Publish both corpora
  as separate analyses.
- The tracker cannot establish merger identity or review data. Report the
  tooling gap. Do not code around it.
- A category holds one code and one incident. The corpus is too small for that
  category to be a pattern.

## Coach Scope Exception

This skill extends the coach's general "no writing specs or fix PRs"
constraint ([`improvement-coach.md`](../../agents/improvement-coach.md)). A
routed spec writes up what the record already shows. It does not add a new
feature. The extension is scoped to this skill.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Corpus** — total changes, enumeration point, partition layout.
- **Distribution** — the category table and author-to-merger matrix.
- **Core category** — The one selected, plus any rejected alternative.
- **Verdict** — both halves, with the changes each cites.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](../../agents/x-coordination-protocol.md)):

- **Discussion or issue** — the assessment report, which carries the
  distribution table, core category, and split verdict.
- **Spec PR** — structural findings routed through `kata-spec`, each grounded
  in cited changes.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).
