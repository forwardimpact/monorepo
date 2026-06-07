# Spec 1590 — kata-implement zero rows record route-decision context

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The Study step of the daily PDSA cycle reads `wiki/metrics/kata-implement/2026.csv` through `fit-xmr` to read whether `implementations_shipped` is shifting. Today every zero row is recorded identically regardless of why the value is zero. Two distinct upstream populations — *attempt-zero* (an implementation route fired and produced no PR) and *route-conservation-zero* (an implementation route was eligible and the routing predicate chose a different route) — read the same on the chart. The xRule2 streak (slots 40–66 at obstacle filing, 27 consecutive ≤ μ=1.6) cannot be adjudicated as either a real throughput floor or an intentional conservation choice. The Study step returns ambiguous on the streak's interpretation, and any policy work driven from the streak (codify conservation, codify throughput-priority, or leave the routing predicate as an unstated judgment call) cannot be falsified against evidence. |

Issue [#1467](https://github.com/forwardimpact/monorepo/issues/1467) names
four routes a `kata-implement` activation can take when boot-routed: pick a
design (Route 1), draft a plan (Route 2), open implementation against an
approved plan (Route 3), or fall back to a fix (Route 4). The remainder of
this spec uses those names without re-introducing them.

## Problem

`wiki/metrics/kata-implement/2026.csv` carries one row per `kata-implement`
activation: a non-zero value when a `feat(NNN)` implementation PR opens,
a zero value when no implementation PR opens. The schema is
`date,metric,value,unit,run,note`. The `note` field carries free text
naming the activation context (which storyboard, which spec, which
trace-pass).

At obstacle filing (Issue [#1467](https://github.com/forwardimpact/monorepo/issues/1467))
the xRule2 zero-mode streak stands at 27 consecutive slots (40–66) on
`implementations_shipped`. The most recent zero rows on `origin/main`
HEAD `dcc3d315`:

| Date | Run | Why zero (as established in #1467) |
|---|---|---|
| 2026-06-05 | run-62 design(1272) | Route 1 self-pick — design route fired, not implementation route |
| 2026-06-06 | fix(bootstrap) #1459, fix(libeval) #1464 | Route 4 fallback × 2 — fix route fired, not implementation route |

Three plan-approved-no-impl candidates (specs **1160, 1210, 1520**) were
eligible for Route 3 on the same HEAD. The routing predicate skipped
Route 3 on the reasoning "gate backlog (#1361, 5 SE-route PRs open)
binding — no new impl opened". That reasoning is a self-imposed
conservation choice — it is not codified in `kata-implement` SKILL.md,
and the CSV row carries no field naming which route fired or which
routes were eligible-but-not-taken.

Three of the four schema fields on a zero row are mechanical
(`date`, `metric`, `value=0`); the fourth (`note`) is free text whose
content varies per activation. No machine-readable field on either the
row or the surrounding rows lets a `fit-xmr` reader, an obstacle
triager, or a future kata-spec adjudicator partition the streak into
attempt-zero rows vs route-conservation-zero rows.

`fit-xmr` reads the contaminated series and reports a 27-slot xRule2
streak. The chart is mechanically correct; the streak is unreliable as
a signal of throughput floor because each zero row could be either
population, and the populations have different policy implications:

- An **attempt-zero population** dominating the streak is evidence the
  implementation route is producing the floor today and the gate-load
  is the binding constraint upstream.
- A **route-conservation-zero population** dominating the streak is
  evidence the implementation route is intentionally not firing and
  the binding constraint is the unstated conservation rule itself.

The two populations call for different responses. Until the rows carry
the context to distinguish them, neither response is defensible from
evidence. Issue #1467 lists three downstream levers (route-decision
logging; codify conservation; codify throughput-priority); two of the
three are policy choices that cannot be adjudicated without first
accruing route-decision context on the existing population of zero
rows.

The note convention is already extensible — every zero row at obstacle
filing carries free-text context. The classification context (route
fired, routes eligible) is not present in any structured form a
downstream tool can read without parsing free text.

## Scope

### In scope

| Component | What changes |
|---|---|
| `wiki/metrics/kata-implement/2026.csv` — zero rows from the plan-implementation merge to main forward. | Every zero row records (i) which `kata-implement` route fired on the activation and (ii) which routes were eligible-but-not-taken. The two values are machine-readable: a downstream consumer can partition the zero-row population by route-decision context without parsing free text. The structural shape — additive note-field convention vs typed CSV columns vs sidecar file — is a design call within the structured-per-row direction the Decisions section ratifies. |
| The agent-side recording surface that appends a row to `wiki/metrics/kata-implement/2026.csv`. | A new zero row carries the route-decision context at write time, named at the recording surface rather than reconstructed later from the trace. **A single CSV-append surface does not exist on main today** — current zero rows are hand-written by the activated agent. The design identifies an existing surface to extend (e.g. a `kata-implement` post-activation hook, a `fit-wiki` subcommand, or an `append`-style helper invoked from the skill) **or** specifies a new surface to introduce; either way it names the surface and the call site. |
| Non-zero rows in `wiki/metrics/kata-implement/2026.csv`. | Each row records which route fired (the implementation route, by construction of a non-zero value). The routes-eligible field is recorded when known and may be empty when the activation does not enumerate eligibility. The decision over whether to require the field on non-zero rows is a design call. |
| The known set of `kata-implement` routes. | The spec adopts the four routes named in Issue #1467 (`Route 1` design self-pick, `Route 2` plan-draft, `Route 3` plan-approved-no-impl, `Route 4` fix fallback). **No canonical declaration of this set exists on main today** — the names live only in Issue #1467 prose and two author-side pilot CSV rows (see slots 65–66 below). **Creating the single source-of-truth declaration is a design responsibility.** The design names one location, and the recording surface, the validator, and `kata-implement` SKILL.md all consume from that one location so that a divergence between any two of them is mechanically detectable (see SC6). The set is closed and extensible by deliberate update — adding a fifth route is a deliberate change to the single-sourced declaration. |
| Existing zero rows on `wiki/metrics/kata-implement/2026.csv` (slots 40–66 at obstacle filing). | Backfill is **deliberately not attempted from the trace.** The spec records that the rows pre-date the convention and stand as observed. Downstream evidence accrues from rows recorded under the convention forward. **Slots 40–64 are pre-convention by date.** Slots 65 (2026-06-05) and 66 (2026-06-06) already carry the proposed `route_taken=…; routes_eligible=…` syntax. They were author-side pilot rows written during obstacle discussion on Issue #1467 before this spec was approved. **They are treated as pre-convention for SC7 counting purposes.** The evidence threshold accrues from rows recorded by the agent-side surface this spec ships, not from rows hand-written before the surface existed. The design may document the existing rows' known route-decision context where the evidence is on-row (e.g. the 2026-06-05 row whose `note` already says `run-62 was design(1272) authoring route`) but no row is rewritten from inference. |
| Documentation of the convention. | The four route names and the recording rule are documented at one location the design names; `kata-implement` SKILL.md references that location. The convention is discoverable to a fresh `kata-implement` activation without reading prior CSV rows. |

### Out of scope

- **Codifying a conservation policy or a throughput-priority policy in
  `kata-implement` SKILL.md** (Lever 2 or Lever 3 in Issue #1467). Both
  are routing-predicate decisions that cannot be adjudicated until
  enough route-decision-instrumented zero rows accumulate to falsify
  either rule against evidence. The success-criteria gate below names
  the threshold (≥20 instrumented zero rows) and the spec following
  this one is the proximate consumer. This spec is the prerequisite,
  not the policy.
- **Removing the free-text `note` field.** The notes carry per-row
  storyboard, spec, and PR context beyond the routing decision and
  remain useful to a human reader. Only the routing classification
  moves into a machine-readable form.
- **Changes to the xRule2 / mrRule1 / xRule3 rule set or the chart
  rendering.** xRule2, mrRule1, and xRule3 are the Wheeler/Vacanti SPC
  chart rules `fit-xmr` applies to separate signal from noise on a
  time series. This spec changes the input the rules read against,
  not the rules. (Glossary one-liner: xRule2 = ≥8 consecutive points
  on the same side of the mean; mrRule1 = a single moving-range point
  above the upper natural limit; xRule3 = ≥3 of 4 consecutive points
  beyond ±1σ on the same side.)
- **Other per-skill metrics CSVs (`wiki/metrics/kata-spec/`,
  `kata-design/`, `kata-plan/`, etc.).** The conflation surfaced today
  is on `kata-implement`. If the same shape surfaces on a second
  per-skill CSV under independent evidence, generalising is a
  follow-up spec.
- **Cross-link to spec 1540 (per-agent CSV `event_type` split).**
  spec(1540) shifts the per-agent staff-engineer CSV from
  dispatch-boot/shift-work conflation; it is *necessary but not
  sufficient* for this obstacle (a shift-work-restricted zero row on
  the per-agent CSV still conflates attempt-zero with
  route-conservation-zero on the per-skill CSV). The two specs are
  orthogonal; this spec does not block on spec(1540) and spec(1540)
  does not block on this one.
- **kata-pattern-synthesis rollup of the route-conflation pattern.**
  Evidence is n=1 at the per-skill level today. Synthesis is deferred
  until the route-decision data set surfaces a second conflation
  symptom under instrumentation.
- **Pre-draft Reads protocol on `kata-plan`** (Issue
  [#1411](https://github.com/forwardimpact/monorepo/issues/1411) and
  Exp [#1412](https://github.com/forwardimpact/monorepo/issues/1412)).
  Issue #1467 carves out #1411 as a distinct `kata-plan` route-quality
  obstacle on a separate verdict horizon (2026-06-11). This spec does
  not block on or amend that work.

## Decisions

**Route-decision context is structured per-row, not derived from the
free-text `note`.** Three directions were on the table at obstacle
filing; the spec adopts (a).

| Concern | (a) Structured per-row context | (b) Parse free-text `note` | (c) Trace-reconstruct at read time |
|---|---|---|---|
| A downstream consumer can partition the zero-row population without string-matching free text. | Yes — read the named field directly. | No — every consumer carries the parsing rule. | Partial — requires the trace to be present, parseable, and stable; trace lifetimes are bounded. |
| The classification rule stays stable as note phrasing or routing-narrative drifts. | Yes — the structured field is independent of either. | No — drift in note phrasing changes the classification of past rows. | Partial — depends on which trace event names the route, which is itself the gap this spec closes. |
| A row recorded today can be partitioned tomorrow without re-running the original `kata-implement` activation. | Yes — the row is self-contained. | Partial — depends on note convention adherence. | No — the trace is no longer reproducible. |
| Migration cost. | Recording surface change + small validator extension. | No file change, every consumer pays the parse cost forever. | Heavy — requires a trace store keyed on each CSV row that survives row lifetime. |

**The known set of routes is closed and extensible by deliberate
update.** Four routes are named at adoption (`Route 1`, `Route 2`,
`Route 3`, `Route 4`). Adding a fifth is a deliberate change to the
single-sourced declaration; the spec does not pre-allocate a fifth.

**Levers 2 and 3 are deferred behind an evidence gate.** Codifying
either the conservation rule or the throughput-priority rule is
explicitly out of scope until ≥20 zero rows recorded under this
convention accumulate. The threshold is set so the conservation
hypothesis ("gate backlog ≥ N binds the routing predicate") can be
falsified against actual data rather than the obstacle filing's
single-day snapshot. **The "20" is chosen so that, under a plausible
1:3 to 1:1 split between attempt-zero and route-conservation-zero
populations, each population accrues at least 5 observations.** Five
is small enough to reach quickly at current zero-row cadence and large
enough that the smaller population is not a one- or two-row outlier.
The follow-up spec may tighten or loosen the threshold if the early
distribution surfaces a strongly skewed split. The follow-up spec
is the proximate consumer of the accrued evidence; this spec ships
the prerequisite mechanism only.

**Reversibility.** Dropping the structured context returns the CSV to
its pre-migration shape. A consumer that ignores the field reads the
same series it reads today. The change is additive at the row level.

**Backfill is not attempted from the trace.** Existing zero rows
(slots 40–66) stand as observed. Downstream evidence accrues from
rows recorded under the convention forward. The choice avoids the
classifier-divergence shape Exp SE 1432-A surfaced on spec(1540) — an
inferred classifier on existing rows misclassifies at least some
fraction of them and the failure mode is silent. **Slots 65–66 are
treated as pre-convention even though they syntactically resemble
the proposed format, because they were author-side pilot rows hand-
written before this spec was approved or the agent-side recording
surface existed; counting them toward SC7's threshold would credit
the convention with rows that did not exercise the mechanism the
convention ships. See Scope row 5.**

## Success Criteria

| Claim | Verification |
|---|---|
| Every zero row appended to `wiki/metrics/kata-implement/2026.csv` from the plan-implementation merge to main forward carries route-decision context naming the route fired and the routes eligible-but-not-taken. | Inspect the rows the agent-side recording surface appends in the first ten `kata-implement` activations after the plan-implementation merges to main (this criterion verifies the recording-mechanism is operating row-for-row; the ≥20-row evidence gate for Levers 2 and 3 is its own criterion below); observe each zero row carries both values in the form the design adopts, and the value is drawn from the closed known set of four routes. |
| The route-decision context is machine-readable: a downstream consumer can partition the zero-row population by route-fired and by routes-eligible without parsing free-text. | Drive the canonical reader the design names against `wiki/metrics/kata-implement/2026.csv` filtered to zero rows with `route_taken=Route 1`; observe the reader returns exactly the rows whose recorded route is `Route 1`, the row count matches a direct grep of the file under the design's adopted format, and the same query partitioned on `routes_eligible` containing `Route 3` returns exactly the rows whose recorded eligible set includes `Route 3`. (Whether the canonical reader is `fit-xmr` with a new partition flag, the recording surface's own read path, or a new helper is a design call.) |
| A new zero row whose route-decision context is missing or outside the known set is rejected by the validator. | Construct a fixture zero row with the route field empty, append it to a copy of `wiki/metrics/kata-implement/2026.csv`, run the validator the design adopts; observe the validator reports the row's line number and the offending field, and exits non-zero. Repeat with the route field set to an unknown string; observe the same shape of rejection. |
| Existing zero rows (slots 40–66 at obstacle filing) are unchanged in shape and content. | Diff `wiki/metrics/kata-implement/2026.csv` slots 40–66 before and after the change ships; observe no row is rewritten, no row's `note` is mutated, the row count for slots 40–66 is identical, and `fit-xmr analyze` against the file produces the same xRule2 streak verdict on the pre-convention rows as it did at obstacle filing. |
| The route-decision context is documented at one location the design names; a fresh `kata-implement` activation that reads only its SKILL.md and the documented location records a row with route-decision context in the form the convention adopts. | Drive a `kata-implement` activation in a clean context window; observe the recorded row carries route-decision context in the documented form without requiring the activation to read prior CSV rows, and the form matches the documented location's specification. |
| A divergence between the recording surface, the validator, and the documented known set of routes is mechanically detectable through a single source-of-truth declaration that all three components consume. | The design names the single source-of-truth declaration (file path + format) for the known set of routes; the recording surface, the validator, and `kata-implement` SKILL.md all reference that one declaration. Verification: extend the known set in the source-of-truth declaration without updating one of the consuming components, **or** edit one consumer to introduce a fifth route without updating the source-of-truth declaration; observe a test or build failure that names the divergence between the source and the drifted consumer and identifies which one drifted. |
| The downstream evidence accrual gate for Levers 2 and 3 (codify conservation policy / codify throughput-priority policy in `kata-implement` SKILL.md, per Issue #1467) is met when ≥20 zero rows recorded under the convention by the agent-side surface this spec ships accumulate. | The follow-up route-policy codification spec (Levers 2 and 3 of Issue #1467) is the owner of this check and does not open until it passes. The check: run the canonical reader against `wiki/metrics/kata-implement/2026.csv` restricted to zero rows whose route-decision context was appended by the agent-side recording surface this spec ships **after the plan-implementation merge to main**. **Slots 65–66 are excluded — they syntactically resemble the convention but were author-side pilots written before the surface existed (see Scope row 5 and the Backfill decision).** The criterion is met when the count reaches ≥20. Whoever drafts the follow-up spec runs the check at draft time; product-manager flags the count on each kata-implement obstacle triage as a side-channel signal **(interim forward-pointer — supersedes when `kata-implement` SKILL.md is amended to surface the count at activation, the L3 signal lever named in Issue #1467)**. |

— Product Manager 🌱
