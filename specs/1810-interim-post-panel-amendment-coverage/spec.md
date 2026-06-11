# Spec 1810 — Interim Coverage Evidence for Post-Panel Amendments Before the STATUS Write

## Problem

A STATUS approval row minted after a post-panel amendment silently claims
panel coverage of content the panel never read, and the merge gate has no
question that surfaces the gap. Realized on PR #1631 (plan 1670), timeline
coach-verified in [Issue #1635](https://github.com/forwardimpact/monorepo/issues/1635):

| Event | Ref | Time (Z) |
| --- | --- | --- |
| Pre-fold plan draft | `3536d675` | 21:22:57 |
| Both panel review rounds | on `3536d675` | between draft and fold |
| Carry-fold amendment (adjudicated, never panel-read) | `abbca369` | 21:26:20 |
| STATUS write `1670 plan approved` | wiki `67692af3` | 21:29:49 |
| Merge citing "STATUS row … postdating the … amendment — approval covers the amended head" | merge comment | 22:07:47 |

The staff engineer's own disclosure on the PR (21:26:37Z) showed both panels
ran before the fold — the disclosing evidence existed, but the gate had no
rule requiring it to ask. The merge gate inferred panel coverage from
timestamp ordering alone, an inference that is unsound whenever any commit
lands between panel execution and the STATUS write. The instance was repaired
by a scoped delta re-review (PR #1636); this spec closes the system gap.

The gap has two halves (per the controlling triage,
[#1635 issuecomment-4685666163](https://github.com/forwardimpact/monorepo/issues/1635#issuecomment-4685666163),
as amended by the PM run-338 reconciliation adopting the security engineer's
2a/2b split):

1. **Writer-side** — nothing in `kata-plan` STATUS-write practice requires
   the writer to either panel-re-read the amendment delta or annotate the
   row's evidence as two states ("panel-clean at `<sha>` + amendment at
   `<sha>`") rather than "panel-clean at head."
2. **Gate-side (2a, fail-closed half)** — `kata-release-merge` Step 6 now
   carries the prohibitive line ("timestamp ordering … is not coverage
   evidence", landed interim via PR #1638) but no positive rule: the gate
   still passes on the bare row even when available evidence shows the head
   postdates the panel-certified state.

**Relation to the existing review-transfer family.** Spec 1790 (#1602)
governs head moves *after* an approval signal — fail-closed transfer of a
pinned approval to a new head. Here the head moved *before* the signal was
minted, so the transfer standard never triggers; this is the complementary
failure direction. The durable mechanical fix — the STATUS row pinned to the
panel-certified SHA, with a row-pin-vs-head comparison at the gate (#1605,
which also absorbs the positive-evidence half 2b) — is sequenced behind
spec 1790's settlement. This spec is the bounded interim cover for the
exposure window until #1605 lands.

## Personas and Job

**Teams Using Agents** — run a continuously improving agent team
([JTBD.md](../../JTBD.md)). The approval ledger and merge gate are the trust
spine of the Plan-Do-Study-Act cycle; this obstacle showed them admitting a
false-coverage merge with no system signal — the honest state had no place to
live, and the dishonest reading was the easy path. Engineering Leaders
inherit the audit-trail benefit.

## What changes

1. **Writer-side convention** (`kata-plan` STATUS-write practice): any
   amendment landing after panel execution and before the STATUS write
   requires, before that write, one of:
   - **(a) Scoped panel re-read** of the amendment delta, recorded on the PR;
     or
   - **(b) Dual-SHA coverage annotation** on an addressable surface the gate
     reads — the PR thread, optionally mirrored in the STATUS merge-gate
     prose notes — naming both states: panel-clean SHA and not-panel-read
     amendment SHA. The row never silently claims head coverage.
2. **Gate-side fail-closed consumption** (`kata-release-merge` Step 6): the
   gate never infers panel coverage from timestamps; when the evidence
   available to the gate shows any commit postdating the panel-evidence SHA,
   it blocks pending positive coverage evidence — a delta re-read record or
   the dual-SHA annotation from (1). Writer-side evidence and gate-side
   consumption ship as one coherent package.
3. **Named supersession criterion**: when #1605's mechanical
   row-pin-vs-head comparison lands, the writer-side convention, the
   gate-side interim rule, and the PR #1638 prohibitive line all retire in
   its favor. The skill text marks the convention as interim in generic terms
   (retires when approval rows carry a commit pin); this spec records the
   #1605 mapping.

### Open question for design

The gate-side block's **trigger form**: commit-postdates-panel-evidence-SHA
(controlling triage form) vs disclosure-triggered (security engineer's
optional form, [#1605 issuecomment-4685674107](https://github.com/forwardimpact/monorepo/issues/1605#issuecomment-4685674107)).
Neither form needs a STATUS schema change or spec 1790 vocabulary; the design
phase adjudicates.

## Scope

**In:** `kata-plan` STATUS-write practice; `kata-release-merge` Step 6
consumption rule. Both are published skills — the resulting lines must state
the generic principle (correct in a repository that installed the skill pack
yesterday; no incident references, no monorepo issue links) and pass the
skill-genericity invariants.

**Out:**

- STATUS schema changes — the row carries no SHA until #1605 mints one.
- Spec 1790's transfer standard (post-signal head moves) — untouched;
  panel-evidence naming must not collide with 1790's pinned-head vocabulary,
  its named compose-with surface.
- The positive-evidence mechanical half (2b) — folds into #1605.
- Human approval-signal semantics (`approval-signals.md`) — spec and design
  approvals are human-originated and out of scope; this spec covers
  panel-evidence-backed STATUS writes, which today means plan approvals.

## Success criteria

Each criterion is a claim plus its verification path on the implementing PR.

| # | Claim | Verify |
| --- | --- | --- |
| 1 | `kata-plan` states the writer-side convention: amendment between panel execution and STATUS write requires a scoped delta re-read or a dual-SHA coverage annotation | `kata-plan` SKILL.md (or its reference) diff |
| 2 | `kata-release-merge` Step 6 blocks fail-closed when evidence shows a commit postdating the panel-evidence SHA and no positive coverage evidence exists | `kata-release-merge` SKILL.md Step 6 diff |
| 3 | Two-state scenario holds: a PR-#1631-shaped timeline (amendment between panel and STATUS write) **blocks** absent positive evidence and **passes** with a delta re-read record or dual-SHA annotation | both outcomes derivable from the changed skill text alone |
| 4 | Changed skill text marks the convention interim, retiring when approval rows carry a commit pin; no monorepo issue/PR references in published-skill text | skill diffs + this spec's supersession section |
| 5 | No STATUS schema change; no spec-1790 vocabulary dependence | implementing PR diff inspection |
| 6 | Skill-genericity invariants and length caps pass | repository invariants check in CI |
