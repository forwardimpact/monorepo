# Spec 1490 — Release-engineer Assess loop: carry-forward clearance step

## Persona and job

Hired by **Teams Using Agents** so the release-engineer can land its own
substrate improvements (agent profile, SKILL.md content) at the same
cadence at which it discovers them, rather than letting carry
recurrence counters climb across runs.

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

The release-engineer's carry inventory — durable per-Assess action
items that recur run-over-run — lives one level down from where the
routing predicate looks. This spec calls the section that holds that
inventory **the canonical carry surface**, resolved by rule rather
than by hardcoded section name: the canonical carry surface is the
surface that
[`memory-protocol.md`](../../.claude/agents/references/memory-protocol.md)
designates as the canonical home for Carry-style obligations — spec
1610 words the designation agent-generically, and a generic
designation satisfies this rule; while no designation exists (the
state of `memory-protocol.md` today), it is
`wiki/release-engineer.md § Message Inbox`. The probe is
deterministic: a reader checks `memory-protocol.md` on `origin/main`
for the designation, whose verbatim-path form spec 1610's success
criterion 1 defines. The designation (a monorepo commit) and the
inventory migration (a sibling-wiki commit) cannot land atomically;
sequencing that skew window is spec 1610's concern, not this spec's.

At obstacle filing (2026-06-03) the inventory lived in the summary's
then-named `§ Run Plan` section; today it lives under
`§ Message Inbox`; and companion spec 1610
([PR #1487](https://github.com/forwardimpact/monorepo/pull/1487),
which adds `specs/1610-re-carries-out-of-summary/spec.md`) relocates
it to a dedicated Carry surface whose path `memory-protocol.md` names
verbatim (spec 1610 success criteria 1 and 6). Because both this spec
and spec 1610 anchor through the `memory-protocol.md` designation,
the two compose whichever lands first.

The canonical carry surface is **not** in the Assess predicate. At
filing, each run read the carry inventory in context (the Step 4
fallback reads only `wiki/MEMORY.md`), re-emitted its carries into
the next run's summary, and reported clean.

### Evidence of the gap (at filing, 2026-06-03)

Two carries at the time of obstacle filing
([Issue #1381](https://github.com/forwardimpact/monorepo/issues/1381),
2026-06-03) needed a code or doc change outside the release-engineer's
own working surfaces and could not self-clear, because the resolution
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
recurring in the carry inventory at the time of obstacle filing
(21 recurrences) but had already been resolved on `main` by
[PR #866](https://github.com/forwardimpact/monorepo/pull/866), merged
2026-05-22, which added a docs fast-path to the kata-release-merge
SKILL. The carry counter continued to climb after the resolution
landed because no step in the Assess loop reconciles carry items
against the current state of the referenced surface. That counter
mismatch is part of the gap this spec closes, not a separate carry.

### Behavioural evidence from a recent run

Run-149 (workflow run `26866997414`) read the then-current carry
inventory (`§ Run Plan` at the time) into context, made zero reads of
the two referenced skill files, made zero edits or writes to those
files, opened zero Issues or Discussions about the carries, and
re-emitted the inventory with each carry's recurrence counter
incremented by one. The run's output budget was not the limiter —
cache-read totals dwarfed the output cap by orders of magnitude. The
deferral is not capacity-bound; it is structure-bound. The same
inventory section that records the carries is the same section the
next run reads, so the recurrence shape compounds.

### Current state (2026-06-11) and the residual gap

Both filing-time carries have since been routed by the
product-manager, exactly the routing § Excluded anticipates: the
`kata-release-cut` hazards a–h to Spec 1500
([PR #1384](https://github.com/forwardimpact/monorepo/pull/1384)),
and the first-release procedure split into Spec 1500's hazard `(c)`
plus
[Discussion #1385](https://github.com/forwardimpact/monorepo/discussions/1385).
The live entries on `wiki/release-engineer.md § Message Inbox`
already practice the discipline this spec mandates: the two
spec-routed carries are annotated "Not counter-bumped; re-enters RE
queue only when plan-approved," and the first-release split is held
as "tracked not carried."

The residual gap this spec closes is therefore not the unmitigated
counter-climb of 2026-06-03. It is that the practice is structural
nowhere:

- **The recognition step lives only as per-entry annotation and
  session memory, not in the profile.** The Assess priority order on
  `main` still has no recognition step between Step 3 and the Step-4
  report-clean fallback, so nothing requires a fresh session to apply
  the discipline. The practice survives only as long as the entries
  that exhibit it; a new carry written by a future session has no
  step obliging it to route rather than count.
- **The reconciliation arm has no per-entry analogue at all.** A
  carry whose referenced surface has already landed on `main` (the
  carry-#3 / PR #866 counter-mismatch pattern above) is cleared only
  if a run happens to notice; no step requires the check, and the
  filing-time evidence shows counters climbing for weeks past
  resolution when none does.

Codifying both in the profile is what makes the practice survive
sessions rather than remaining an annotation convention.

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
  that recognises recurring carries on the canonical carry surface
  and routes them to an outbound coordination channel instead of
  allowing the recurrence counter to bump. The step must run within
  the Assess priority order before the agent reports clean.
- A relocation-surviving binding: the step body itself must state the
  § Problem resolution rule — the `memory-protocol.md` designation
  lookup and the `wiki/release-engineer.md § Message Inbox`
  undesignated default — rather than solely a hardcoded section name,
  so that a later relocation of the inventory (spec 1610) re-points
  the step without a further profile edit.
- A defined behaviour for data-deficient entries: the step body must
  state what a run does when a carry entry on the resolved surface
  lacks the data the recurring-carry condition references (for
  example, after a migration that preserved an entry's clearance
  trigger but not its recurrence record) — restoring the data or
  routing the entry, never silently skipping it. The design picks the
  specific behaviour; the spec requires that one be stated.
- A definition in the agent profile of when a carry item counts as a
  *recurring carry* the step must act on. The definition must be
  applicable by reading the canonical carry surface alone — without
  recourse to a separate ledger, prior-run state, or external memory.
- A definition in the agent profile of *what counts as a carry*. The
  definition must be stated positively (what counts) rather than only
  by exclusion; the design picks the specific predicate.
- The set of outbound routing destinations the new step may use must
  be enumerated in the profile so the step's behaviour is operable
  without further interpretation. Which destination is chosen for a
  given carry is the design's call; the spec only requires that the
  set be enumerated and finite.
- An explicit prohibition: once a carry item meets the
  recurring-carry definition, the run must emit a routing artifact
  rather than incrementing the entry's recurrence record. The
  prohibition must appear in the profile alongside the new step.
- A reconciliation expectation: the step recognises carry items
  whose underlying resolution has already landed on `main` (the
  carry-#3 / PR #866 pattern) and clears them rather than carrying
  them forward. Unlike the recurring-carry condition, this check
  consults the entry's referenced surface on `main`; the carry
  surface must give it the per-entry pointer (the referenced surface
  or clearance condition) that makes the check possible.
- Whatever change to the canonical carry surface is required to make
  the recurring-carry definition operable from that surface's content
  alone and to give the reconciliation case its per-entry pointer.
  The spec does not pre-commit which lines change; the design picks
  the minimum content change on whichever surface the resolution rule
  selects at implementation time. In the undesignated default this
  extends the existing carry-entry practice under `§ Message Inbox`
  without altering that section's memo-triage contract. Because the
  wiki is a sibling repository, this change lands as a wiki commit,
  not in the implementation PR's diff, and is verified by inspection
  (success criteria below).

### Excluded

- **Where the carry inventory lives.** Companion spec 1610 owns the
  inventory side — relocating carries off the summary surface. This
  spec takes the canonical carry surface as given by the reference
  rule in § Problem and does not move, rename, or recreate it; in
  particular the implementation must not reintroduce a carry section
  onto the summary if spec 1610's relocation has landed.
- **The content of the two filing-time carries.** Carry #2
  (kata-release-cut SKILL.md hazards a–h) is the subject of Spec
  1500. Carry #1 (first-release procedure) is routed via Spec 1500's
  treatment of its hazard `(c)` plus
  [Discussion #1385](https://github.com/forwardimpact/monorepo/discussions/1385)
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
- **Retroactive routing of the already-routed carries.** They are routed via
  [Issue #1381](https://github.com/forwardimpact/monorepo/issues/1381) and the
  resulting specs (see § Current state). Once Spec 1490 ships, the new step
  prevents future accumulation; it does not re-process the existing ones.
- **Cross-agent generalisation.** Only the release-engineer profile
  changes. Other agents' profiles may inherit the pattern in their
  own specs if their kata surfaces it; this spec does not edit them.
- **New automation in `fit-wiki` or `kata-dispatch`.** The new step
  is agent-side reasoning over data the carry surface carries.
  Tooling changes are excluded outright; the diff criterion below
  confines the implementation accordingly.
- **Carry-surface content beyond what the new step reads.**
  Narrative paragraphs, prior-run summaries, and unrelated lists are
  untouched.

## Success criteria

| Claim | Verifies via |
|---|---|
| The release-engineer agent profile defines a new Assess step for carry-forward clearance. | `.claude/agents/release-engineer.md` § Assess contains a step that names the phrase "carry-forward clearance" and runs within the Assess priority order ahead of any report-clean outcome. |
| The step's binding to the carry surface survives relocation of the inventory. | The step body states the § Problem resolution rule inline — both the `memory-protocol.md` designation lookup and the `wiki/release-engineer.md § Message Inbox` undesignated default — not solely a hardcoded section name. |
| The step defines behaviour for data-deficient entries. | The step body states what a run does when an entry on the resolved surface lacks the data the recurring-carry condition references; silent skipping is not among the stated behaviours. |
| The step's body defines a recurring-carry condition that a run can apply by reading the canonical carry surface alone. | The step body states the condition. The condition's terms refer only to data present on the canonical carry surface after the in-scope surface change; the step does not require a separate ledger, prior-run state, or external memory to evaluate. |
| The step's body defines what counts as a carry, stated positively. | The step body names a positive criterion for the carry category; a reader can decide a candidate carry item against the criterion without resort to negative-only definitions. |
| The step's body enumerates a finite set of outbound routing destinations. | The step body lists the destinations as a closed set (each named once; no "etc." or open-ended phrasing), each addressable by the release-engineer with no new tooling. |
| The step's body forbids counter-bump once the recurring-carry condition is met. | The step body contains an explicit prohibition: when the recurring-carry condition is met, the run emits a routing artifact instead of incrementing the entry's recurrence record. The prohibition is detectable from a read of the step body alone (no inference from surrounding context required). |
| The step accounts for carry items whose resolution has already landed on `main`. | The step body names the reconciliation case (a carry item whose referenced surface is already up to date) and specifies that the step clears such items rather than routing them. |
| The canonical carry surface gives the step the data it needs. | Inspection of the surface the § Problem resolution rule selects at verification time (default path `wiki/release-engineer.md § Message Inbox`) shows each carry entry carries the data the recurring-carry condition references — readable without additional file reads — and names the referenced surface or clearance condition the reconciliation case consults on `main`. |
| The implementation PR's diff stays within the monorepo files named in scope. | The PR diff touches only `.claude/agents/release-engineer.md` and the spec/design/plan tree under `specs/1490-re-assess-carry-clearance/`; the carry-surface content change lands as a wiki commit (sibling repository) and is verified via the row above, not via this diff. |

— Product Manager 🌱
