# Spec 1610 — Release-engineer summary: move Carry inventory off the summary surface

## Persona and job

Hired by **Teams Using Agents** because the autonomous merge channel
RE controls — the trust-gated docs fast-path — closes whenever RE's own
summary file breaches its audit budget. Carries (durable per-Assess
obligations awaiting a future clearance condition) currently live in
`wiki/release-engineer.md § Message Inbox` and push the summary over
the audit ceiling. While the summary fails audit, the wiki-context
check fails on every open PR, and the docs fast-path — the
team's primary autonomous merge surface for its own substrate
changes — stops working. The continuous-improvement loop the team
hires Kata to run stalls at the merge gate.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)).

A **Carry** in this spec means: a Message-Inbox-resident block that
encodes a per-Assess obligation (predicate-check or routing protocol)
plus a future clearance trigger (experiment verdict, dependent spec
merge, or release-tag publication). Carries are distinct from incoming
memos triaged by `fit-wiki inbox` `ack`/`drop`/`promote` and are
distinct from settled state.

## Problem

The release-engineer's summary file (`wiki/release-engineer.md`) is
audited under the same word-and-line budgets as every other agent's
summary. The constants live in `libraries/libwiki/src/constants.js`
(`SUMMARY_WORD_BUDGET`, `SUMMARY_LINE_BUDGET`) and the protocol document
characterises the summary as "state, not history"
([memory-protocol.md § Summary
Contract](../../.claude/agents/references/memory-protocol.md#summary-contract)).

The `## Message Inbox` section of `wiki/release-engineer.md` now hosts
six Carry blocks plus an Exp #1468 protocol block. These are neither
settled state nor history: they are per-Assess obligations whose
clearance is gated on a future event.

| Carry | Section word-count at obstacle filing | Clearance condition |
|---|---:|---|
| #1 Spec 1490 PR #1383 | 70 | Spec merges + plan-approved |
| #2 Spec 1500 PR #1384 | 50 | Spec merges + plan-approved |
| #3 PR #866 docs fast-path (RESOLVED) | 80 | None — retained for recurrence-counter context |
| #4 Discussion #1385 | 50 | Convention ratified |
| #5 Spec 1520 Part 03 atomic release-tag coupling | 640 | Structural-fix tag published |
| #6 Exp #1475 trace-attestation header | 420 | 2026-06-15 verdict |
| Exp #1468 autonomous-Assess pre-check | 270 | 2026-07-01 verdict |

Total at obstacle filing: ~1 580 words, leaving ~470 words of headroom for the
settled-state sections the contract was written for (last run, run plan,
first-release backlog, open blockers). Reported state at HEAD `a9feca5e` (per
[Issue #1480](https://github.com/forwardimpact/monorepo/issues/1480)): 2 051
words / 2 048-word audit limit. An in-session trim restored audit-pass to ~1 998
words at the same HEAD; that trim is **temporary slack**, not a structural fix.
The next Carry addition recurs the breach.

### Recurrence shape

Each new RE experiment adds a Carry block. Observed cadence over
W22–W23: one Carry per week (Exp #1468 added W22-day7; Exp #1475 added
W23-day6, both recorded in `wiki/release-engineer.md` git log).
Verdict horizons clear Carries only on their own clock: Exp #1475 at
2026-06-15, Exp #1468 at 2026-07-01, and Carry #5 at Spec 1520 Part 03
merge. Between additions and clearances the inventory grows
monotonically.

### Cross-lane impact

When `wiki/release-engineer.md` exceeds the word budget, the
wiki-context check fails on every open PR. The trust-gated docs
fast-path is RE's only autonomous merge surface (every other merge
requires a human-recorded approval signal), so a failing wiki check
removes RE's autonomous lever for the duration of the breach. This is
adjacent to — not the sole cause of — the chronic `prs_merged` xRule2
streak (n=16) tracked in
[`wiki/metrics/kata-release-merge/2026.csv`](../../wiki/metrics/kata-release-merge/2026.csv)
and the human-PR-gate bandwidth precondition tracked under
Obstacle #1358. The relevant claim is that audit-failure-induced
fast-path closure is one observable input to that streak, not the only
input.

### Why this is not an RE editorial choice

Carry shape and durability are dictated by the per-Assess
predicate-check protocol routed by product-manager (the precedent
established by Discussion #1022). The protocols encoded in Carries #5,

## 6, and the Exp #1468 block are intentionally specific: Carry #6's

trace-attestation prepend sequence and Exp #1468's autonomous-Assess
pre-check are falsifier predicates whose load-bearing text *is* the
literal sequence — paraphrase loses enforceability. The summary's
contract treats Carry growth as a budget violation; the protocol
treats Carry growth as the price of safe per-Assess obligation
tracking. The conflict is between two structurally correct things
sharing one file surface.

### Scope

In scope:

- A canonical wiki surface for release-engineer Carry blocks that sits
  outside the summary's word-and-line budget audit.
- Whatever changes to the audit framework
  (`libraries/libwiki/src/audit/*` and the constants module) are needed
  for that surface to be audited — file-classification, rule
  registration, and any new budget constants — chosen by the design.
- Updates to
  [`memory-protocol.md`](../../.claude/agents/references/memory-protocol.md)
  that (a) name the new surface as the canonical home for Carry-style
  obligations, (b) explain how an entry on it identifies its clearance
  trigger, and (c) extend the On-Boot Read Set so the agent enumerates
  open obligations during boot. The existing Summary Contract
  permitted-sections list does not need to change (the new surface is
  a separate file, not a new section of the summary).
- A migration that relocates the six prior Carries (with Carry #3
  permitted to clear instead of relocate, since its clearance condition
  is already met) plus the Exp #1468 block from
  `wiki/release-engineer.md § Message Inbox` onto the new surface.
- A restoration of `wiki/release-engineer.md § Message Inbox` to its
  named purpose: incoming memos awaiting `fit-wiki inbox`
  `ack`/`drop`/`promote` triage.

Out of scope (deferred):

- *Flow side — when Carries clear.* Covered by [spec
  1490](../1490-re-assess-carry-clearance/spec.md) (PR #1383, awaiting
  `spec:approved`). 1610 and 1490 compose without merging: 1610
  relocates the inventory; 1490 clears it.
- *Generalising the surface to other agents.* Reviewed at the next
  `kata-pattern-synthesis` rollup, currently scheduled 2026-07-02. If
  another agent adopts Carry-style obligations before that rollup the
  generalisation work brings forward; until then this spec ships
  RE-only so the docs-fast-path is unblocked at the earliest
  opportunity.
- *Any change to the existing summary word-or-line budgets.* The
  summary stays a settled-state surface under its existing budget.

### Constraints on the design

- The chosen filename and H1 together must not be misclassified by the
  existing wiki audit's summary or weekly-log classifiers (the new
  surface is neither). The audit classifies on both axes, so the
  design must check that neither the filename pattern nor the H1
  pattern accidentally selects an existing scope. If avoiding
  misclassification requires extending the classifier, that extension
  is in scope per above.
- The new surface's name and protocol-section structure should not
  bake in RE-only assumptions that would force a rewrite when the
  2026-07-02 generalisation review picks it up. (For example: the
  protocol-section heading and field names should describe Carry
  semantics rather than release-engineer specifics.)

### Decisions

- **Carries are a third category, distinct from settled state and
  history.** They earn their own surface rather than sharing the
  summary's surface. This is the WHAT.
- **Per-Carry word-cap rejected as an alternative.** Capping each
  Carry at ~200 words would distort the falsifier-predicate text in
  Carries #5, #6, and the Exp #1468 block, losing the enforceability
  those protocols depend on. The constraint should fit the protocol,
  not the reverse.
- **Spec 1610 ships independently of spec 1490.** Each delivers
  standalone value and the two compose at the file-surface and
  predicate-loop boundary, respectively. Merging would re-open
  1490's existing review cycle (panel R1→R2 already complete) without
  changing either's success criteria.

### Success criteria

| # | Criterion | Verifies via |
|---|---|---|
| 1 | A canonical Carry surface exists at a known path. | `memory-protocol.md` names the path verbatim; that path exists in `wiki/` after the migration commit; it contains at least one Carry entry. |
| 2 | The new surface is admitted by the wiki audit with at least one rule that can fail. | A reviewer can construct a file at the new surface's path that violates one of the rules the design registers for it, and `bunx fit-wiki audit` emits a finding against that file; running `audit` on the migrated wiki at HEAD emits no findings against the new surface. (The design picks the rule shape; SC does not assume word-cap, line-cap, or any specific rule kind.) |
| 3 | `wiki/release-engineer.md § Message Inbox` is restored to incoming-memo triage only. | After migration, every entry under that H2 either is an unprocessed memo that `fit-wiki inbox list --agent release-engineer` would surface, or is a section heading the protocol now defines for that surface; no entry encodes a per-Assess obligation. |
| 4 | `wiki/release-engineer.md` passes the summary audit. | `bunx fit-wiki audit` reports zero findings against `wiki/release-engineer.md` at the migration's HEAD. |
| 5 | The live Carries plus the Exp #1468 block are present on the new surface, each with its clearance trigger named. | Each of Carries #1, #2, #4, #5, #6, and the Exp #1468 block in the § Problem table has a corresponding entry on the new surface whose body names a verdict horizon, a spec id whose merge clears it, or a release-tag publication event. Carry #3 is RESOLVED at filing and is not required to migrate. |
| 6 | The memory protocol explains how RE-on-boot finds open obligations. | `memory-protocol.md` contains a section that (a) identifies the new surface as the canonical home for Carry-style obligations, and (b) describes the entry shape sufficient for a boot procedure to enumerate open obligations and their clearance triggers. |

### Evidence

- **Obstacle filing.**
  [Issue #1480](https://github.com/forwardimpact/monorepo/issues/1480) —
  RE-reported, coach-verified at HEAD `a9feca5e`: `bunx fit-wiki audit` returned
  `wiki/release-engineer.md 2051 words (limit 2048) summary.word-budget`. The
  in-session trim that followed restored audit-pass at the same HEAD; the
  underlying inventory pressure is unchanged.
- **Word-budget contract.**
  [`libraries/libwiki/src/constants.js`](../../libraries/libwiki/src/constants.js)
  carries the summary's line and word budgets and the corresponding
  budgets for the weekly-log and storyboard surfaces.
- **Audit framework.**
  [`libraries/libwiki/src/audit/`](../../libraries/libwiki/src/audit/)
  — file classification (`scopes.js`) and rule registration (`rules.js`)
  define the existing audited surfaces; admitting a new surface here is
  the design's call on extension shape.
- **Summary contract.** [memory-protocol.md § Summary
  Contract](../../.claude/agents/references/memory-protocol.md#summary-contract)
  — "state, not history."
- **Carry shape at filing.** `wiki/release-engineer.md § Message Inbox`
  at HEAD `a9feca5e` (sibling-wiki repo HEAD; the monorepo `a9feca5e`
  is the same calendar HEAD coach-verified the audit failure against).
- **Recurrence cadence.** Exp #1468 Carry block added W22-day7 and
  Exp #1475 Carry block added W23-day6, both observable in
  `wiki/release-engineer.md` git log (sibling wiki).
- **Cross-lane signal (not sole cause).**
  `wiki/metrics/kata-release-merge/2026.csv` — `prs_merged` xRule2
  streak (n=16). Carry-induced fast-path closure is one input among
  several to that streak.
- **Precedent for routing protocol changes to PM.** Discussion #1022
  ratified 2026-05-26.

### Adjacency to spec 1490

- **[Spec 1490](https://github.com/forwardimpact/monorepo/pull/1383)**
  attacks the *flow* side (Assess-loop predicate that recognises and
  routes recurring Carries); this spec attacks the *inventory* side
  (where Carries live). The two compose without merging; either alone
  partially mitigates the obstacle, both together fully address it.
  Splitting preserves 1490's existing review cycle.
