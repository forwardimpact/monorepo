# Spec 1490 — Release-engineer Assess loop: carry-forward clearance step

## Persona and job

Hired by **Teams Using Agents** so the release-engineer can land its own
substrate improvements (agent profile, SKILL.md content) at the same
cadence at which it discovers them, rather than letting Run-Plan
counters climb across runs.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)).

## Problem

The release-engineer agent profile
([`.claude/agents/release-engineer.md`](../../.claude/agents/release-engineer.md))
defines an Assess priority order of four steps:

1. Main CI failing from trivial issues → repair
2. Open PRs to gate → merge
3. Unreleased changes on main → cut
4. Fallback — `MEMORY.md` items listing release-engineer under Agents,
   then report clean

The Run-Plan section of the release-engineer's own summary file
(`wiki/release-engineer.md` § Run Plan) is **not** in the predicate.
Carry-forward action items that recur run-over-run live one level down
from where the routing predicate looks. The result: each run reads the
Run-Plan in context (Step 4 fallback only reads `wiki/MEMORY.md`),
re-emits its carries with incremented recurrence counters into the
next run's summary, and reports clean.

### Evidence of the gap

Two carries at the time of obstacle filing
([Issue #1381](https://github.com/forwardimpact/monorepo/issues/1381),
2026-06-03) need a code or doc change outside the release-engineer's
own working surfaces and cannot self-clear, because the resolution
path is either (a) an amendment to the release-engineer's own agent
profile, or (b) a `.claude/skills/kata-release-cut/SKILL.md` PR that
re-enters the very merge gate release-engineer operates — the
SKILL/profile change has no `spec approved` STATUS row at the time of
authoring, so the PR cannot self-merge under release-engineer's own
approval gate:

| Carry item | Recurrences at filing | Self-clearance blocked by |
|---|---:|---|
| First-release procedure clarification | 29 | No spec-authoring slot in release-engineer profile |
| `kata-release-cut` SKILL.md hazards a–h | 22 | Skill PR re-enters merge gate without `spec approved` STATUS row |

A third carry — the `kata-release-merge` `docs` type-allowlist — was
recurring in the Run Plan at the time of obstacle filing
(21 recurrences) but had already been resolved on `main` by
[PR #866](https://github.com/forwardimpact/monorepo/pull/866), merged
2026-05-22, which added a docs fast-path to the kata-release-merge
SKILL. The carry counter continued to climb after the resolution
landed because no step in the Assess loop reconciles Run-Plan items
against the current state of the referenced surface. That counter
mismatch is part of the gap this spec closes, not a separate carry.

### Behavioural evidence from a recent run

Run-149 (workflow run `26866997414`) read the Run-Plan into context,
made zero reads of the two referenced skill files, made zero edits or
writes to those files, opened zero Issues or Discussions about the
carries, and re-emitted the Run-Plan section with each carry's
recurrence counter incremented by one. The run's output budget was
not the limiter — cache-read totals dwarfed the output cap by orders
of magnitude. The deferral is not capacity-bound; it is
structure-bound. The same Run Plan section that records the carries
is the same Run Plan section the next run reads, so the recurrence
shape compounds.

### Why deferral is the structural default

For release-engineer specifically, the cost asymmetry is structural,
not laziness:

- **Defer cost**: one line in the summary file
  (`X-run carry. Backlog now N…`) — extends an existing wiki write.
- **Self-fix cost**: open a feature branch, edit a SKILL.md file,
  push, open a PR — which then re-enters the merge gate
  release-engineer itself operates, requiring (i) a STATUS row at
  `spec approved` / `plan approved` that does not yet exist, (ii) CI
  green, (iii) an approval signal release-engineer cannot self-grant.

The self-fix path therefore traverses Steps 1–3 of the agent profile
plus an absent STATUS row, while the defer path is a trivial
extension of the current run's wiki write. Without a step in the
priority order that recognises recurring carries and routes them to
a spec-authoring agent, the deferral gradient holds.

### Precedent for routing rather than self-fix

Discussion #1022 (sibling-repo composite actions, ratified
2026-05-26) established the cross-team precedent: internal
infrastructure changes that need spec authoring before they can merge
are routed by release-engineer to the product-manager for spec
authoring, with release-engineer reviewing the resulting artifacts.
The existing release-engineer profile encodes the *outcome* of that
precedent (no spec-authoring slot in Steps 1–4) but not the
*recognition step* — there is currently no step that asks "is this a
recurring carry that needs spec authoring?" before the Step 4
fallback report-clean.

## Scope

### In scope

- A new Assess step in
  [`.claude/agents/release-engineer.md`](../../.claude/agents/release-engineer.md)
  that recognises recurring Run-Plan carries and routes them to an
  outbound coordination channel instead of allowing the recurrence
  counter to bump. The step must run within the Assess priority order
  before the agent reports clean.
- A definition in the agent profile of when a Run-Plan item counts as
  a *recurring carry* the step must act on. The definition must be
  applicable by reading the Run-Plan section alone — without recourse
  to a separate ledger, prior-run state, or external memory.
- A definition in the agent profile of *what counts as a carry*. The
  definition must be stated positively (what counts) rather than only
  by exclusion; the design picks the specific predicate.
- The set of outbound routing destinations the new step may use must
  be enumerated in the profile so the step's behaviour is operable
  without further interpretation. Which destination is chosen for a
  given carry is the design's call; the spec only requires that the
  set be enumerated and finite.
- An explicit prohibition: once a Run-Plan item meets the
  recurring-carry definition, the run must emit a routing artifact
  rather than incrementing the recurrence counter. The prohibition
  must appear in the profile alongside the new step.
- A reconciliation expectation: the step recognises Run-Plan items
  whose underlying resolution has already landed on `main` (the
  carry-#3 / PR #866 pattern) and clears them rather than carrying
  them forward.
- Whatever change to the release-engineer summary file (or its
  regeneration template) is required to make the recurring-carry
  definition operable from Run-Plan content alone. The spec does not
  pre-commit which file or which lines change; the design picks the
  minimum surface to touch.

### Excluded

- **The content of the two currently-routed carries.** Carry #2
  (kata-release-cut SKILL.md hazards a–h) is the subject of Spec
  1500. Carry #1 (first-release procedure) is routed via Spec 1500's
  treatment of its hazard `(c)` plus a follow-up Discussion thread
  for the contributor-facing convention; this spec does not author
  either.
- **The threshold value.** The spec requires the agent profile to
  state a recurring-carry definition the step can apply; the choice
  of threshold (e.g., "after 2 recurrences" vs "after 3") is a
  design-level routing-cost trade-off, not a WHAT/WHY question. The
  spec does not pre-commit a number anywhere in scope or in success
  criteria.
- **The exact routing destination for any specific carry.** The set
  of destinations is enumerated by the spec; the per-carry choice
  belongs to design.
- **Retroactive routing of the two currently-pending carries.** They
  are routed via [Issue #1381](https://github.com/forwardimpact/monorepo/issues/1381)
  and the resulting specs. Once Spec 1490 ships, the new step
  prevents future accumulation; it does not re-process the existing
  ones.
- **Cross-agent generalisation.** Only the release-engineer profile
  changes. Other agents' profiles may inherit the pattern in their
  own specs if their kata surfaces it; this spec does not edit them.
- **New automation in `fit-wiki` or `kata-dispatch`.** The new step
  is agent-side reasoning over data the Run-Plan already carries.
  Tooling changes are a design-time consideration, not a spec
  success criterion.
- **The Run-Plan freeform sections beyond what the new step reads.**
  Narrative paragraphs, prior-run summaries, and unrelated lists are
  untouched.

## Success criteria

| Claim | Verifies via |
|---|---|
| The release-engineer agent profile defines a new Assess step for carry-forward clearance. | `.claude/agents/release-engineer.md` § Assess contains a step that names the phrase "carry-forward clearance" and runs within the Assess priority order ahead of any report-clean outcome. |
| The step's body defines a recurring-carry condition that a run can apply by reading its Run-Plan content alone. | The step body states the condition. The condition's terms refer only to data already present in the Run-Plan section; the step does not require a separate ledger, prior-run state, or external memory to evaluate. |
| The step's body defines what counts as a carry, stated positively. | The step body names a positive criterion for the carry category; a reader can decide a candidate Run-Plan item against the criterion without resort to negative-only definitions. |
| The step's body enumerates a finite set of outbound routing destinations. | The step body lists the destinations as a closed set (each named once; no "etc." or open-ended phrasing). The destinations are addressable by the release-engineer with no new tooling. The per-carry destination choice is left to the design. |
| The step's body forbids counter-bump once the recurring-carry condition is met. | The step body contains an explicit prohibition: when the recurring-carry condition is met, the run emits a routing artifact instead of incrementing the recurrence counter. The prohibition is detectable from a read of the step body alone (no inference from surrounding context required). |
| The step accounts for Run-Plan items whose resolution has already landed on `main`. | The step body names the reconciliation case (a Run-Plan item whose referenced surface is already up to date) and specifies that the step clears such items rather than routing them. |
| The release-engineer summary content gives the step the data it needs. | After the implementation, inspection of `wiki/release-engineer.md` § Run Plan (or its regeneration template) shows that each carry row carries the data the step's recurring-carry condition references — readable from that one section without additional file reads. |
| The implementation PR's diff stays within the file sets named in scope. | The PR diff touches only `.claude/agents/release-engineer.md`, the release-engineer summary file or its regeneration template (whichever the design names), and the spec/design/plan tree under `specs/1490-re-assess-carry-clearance/`. |

— Product Manager 🌱
