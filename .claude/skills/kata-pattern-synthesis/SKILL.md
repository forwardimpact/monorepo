---
name: kata-pattern-synthesis
description: >
  Synthesize a system-level pattern from a corpus of related obstacle,
  experiment, and PR items via grounded coding. Use when the corpus is large
  enough that ad-hoc per-item handling is reinventing the same moves.
  Improvement-coach scope extension — produces a `kata-spec`, a `kata-design`,
  and a corpus map that closes the loop on the items that fed it.
---

# Pattern Synthesis from Backlog

Read a corpus of related issues and PRs, code it to surface the pattern, and
turn that pattern into a single spec + design that addresses the meta-trigger,
instruments any binding constraint, and codifies the moves the team has been
inventing per case.

## When to Use

- A storyboard meeting Q3 surfaces multiple obstacles whose repair shapes
  visibly rhyme.
- A producer-orphaning event lands on `main` (skill removed, renamed, or
  split) and a metric loses its producer — immediate trigger.
- The same RFC shape has appeared more than once because a richer channel was
  unavailable.
- A user explicitly requests a backlog synthesis run.

Do not run when the corpus is small (under ~10 open obstacle+experiment
items) or when fewer than 3 distinct repair-adjacent moves appear. Premature
synthesis manufactures patterns where there is only noise.

## Triggers

```sh
# Eligibility — at least one threshold must hold
gh issue list --label obstacle,experiment --state open --json number \
  | jq 'length'   # ≥10 → eligible
```

The synthesis runs at most once per ISO week unless a producer-orphaning
event forces it.

## Checklists

<read_do_checklist goal="Hold the synthesis boundary before coding the corpus">

- [ ] Confirm at least one trigger threshold is met. Record which.
- [ ] Close the corpus before coding begins; later items do not bias the codes.
- [ ] Memos and codes go to a scratch location, not to the wiki, until the
      proposition is selected.
- [ ] No claim enters the spec or design without an issue/PR number anchor.
- [ ] Stop at one core category. If two compete, the corpus is two patterns,
      not one — route to a coaching session and re-run later on each subset.

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
      binding-constraint instrumented, repair-move codified, or out of scope.
- [ ] Closure broadcast posted on every addressed item; **out-of-scope items
      not tagged**.

</do_confirm_checklist>

## Method

Synthesis works as qualitative research, not checklist verification.
**Grounded theory** is the recommended approach: let the pattern emerge from
the corpus rather than testing a preformed hypothesis.

### Core Principles

1. **Begin with no proposition.** Read the corpus before forming opinions
   about the system-level pattern.
2. **Use the corpus's own language.** Label observations with terms from the
   actual issue/PR text — in-vivo phrases — not abstract categories you bring
   to the analysis.
3. **Write memos as you go.** 3–5 sentences per item capturing the central
   incident and what makes it surprising. Memos written during analysis are
   far more valuable than retrospective summaries.
4. **Read every item.** Skimming produces shallow patterns. Items that look
   similar in the title often diverge in the body.
5. **Seek a central explanation, not a category list.** The most useful
   output is a proposition that connects multiple observations across
   categories.

### From Corpus to Spec

As you read, assign short labels (codes) to meaningful events. Group related
codes into categories by asking: what triggered this, what discipline was
applied, what was the consequence, and what failed when the discipline
lapsed?

Look for: repair moves invented per case, binding constraints that surface
repeatedly without ever being measured directly, disciplines cited without a
canonical home, and producer/consumer couplings where a single change
rippled unexpectedly.

The strongest propositions are **grounded** (traceable to specific items),
**testable** (a future corpus can confirm or refute the pattern), and
**actionable** (they imply a single spec).

### Phase Boundaries

Six checkpoints; output of each feeds the next.

1. Gather the corpus (closed before coding).
2. Memo each item.
3. Code, group, name a core category.
4. Draft the proposition; reject if any code refused to fit.
5. Spec via `kata-spec`; design via `kata-design`.
6. Map back to the corpus; broadcast on addressed items only.

## Mapping Back to Corpus

Re-read the corpus and classify every item. The PR body lists only the first
three buckets; **out-of-scope items receive no comment** — signal hygiene
matters.

| Category | Trigger | Comment shape |
| --- | --- | --- |
| **Directly addressed** | The synthesis's meta-trigger; the spec resolves or absorbs the item. | "Spec NNN codifies `<move>` as a named move; the discipline would have surfaced this when …" |
| **Binding-constraint instrumented** | The item flagged the binding constraint; the spec adds the metric that reads it. | "Spec NNN Success #N adds `<metric>`; the metric is the standing meter for the constraint this issue exemplifies." |
| **Repair-move codified** | The item invented or applied a move that the spec now names. | "Spec NNN names `<move>` in the typology; this issue is the cited precedent." |
| **Out of scope** | Spec's Scope (out) names the item or its category. | (no comment) |

## Stopping Conditions

Stop and route to a coaching session in any of these cases:

- The corpus splits into two competing core categories — file two coaching
  asks, one per category.
- Open coding produces a category with one code and one incident — the
  corpus is too small for that category to be a pattern.
- The spec's Problem section cannot ground every claim in a cited item — the
  proposition is unsupported; return to coding.

## Coach Scope Exception

The coach's general "no writing specs or fix PRs" constraint
([`improvement-coach.md`](../../agents/improvement-coach.md)) is extended
here because the synthesis is observation-as-architecture, not domain work —
the spec is a write-up of what the team has already implicitly decided
across the corpus, not a new feature. The exception is scoped to this skill
only.

## Memory: what to record

Append to the current week's coach log
(`wiki/improvement-coach-$(date +%G-W%V).md`):

- **Trigger** — Which threshold fired, with the count and date.
- **Corpus** — Item numbers gathered (counts by label).
- **Core category** — The one selected, plus the rejected alternative if more
  than one was considered.
- **Proposition** — The one-sentence proposition.
- **Spec / design / PR** — Numbers and links.
- **Corpus map** — A table of corpus item → category. Out-of-scope items are
  recorded here even though they receive no comment.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](../../agents/references/coordination-protocol.md)):

- **PR body** — Synthesis spec/design PR carries an Addresses overview.
- **Issue comment** — One per addressed item; never on out-of-scope items.
- **Storyboard headline** — The next storyboard meeting after a synthesis
  run surfaces the synthesis PR as a Q1 target-condition reference.

If two storyboard meetings pass without the spec PR being approved, file an
obstacle — the synthesis PR is itself subject to whatever binding constraint
the spec proposed.
