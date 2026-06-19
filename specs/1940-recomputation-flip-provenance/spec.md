# Spec 1940 — libxmr per-signal recomputation-revealed provenance

## Persona and job

**Teams Using Agents — Run a Continuously Improving Agent Team.** The storyboard
is the closed-loop instrument that tells the team whether it is getting better.
When a lane's XmR status flips red solely because favorable recent data
tightened the recomputed limits over old history, the loop reports an
improvement as an instability. The job hires this spec to keep condition reads
trustworthy through the 2026-06-30 re-baseline, which closes over 13 lane-owned
dimensions. Secondarily, **Platform Builders** consume the same signal records
through `fit-xmr`'s published report shape; signal provenance becomes part of
that shared surface and must appear wherever signal records are documented.

## Problem

Issue [#1692](https://github.com/forwardimpact/monorepo/issues/1692) records the
observation: `summary_corrections` flipped `predictable` (n=52, μ=2.2, at the
6/04 read) → `signals_present` (n=65, μ=1.9) at the 2026-06-12 storyboard review
**with no new point breaching anything**. The improvement coach's first-hand
validation
([#1692 comment](https://github.com/forwardimpact/monorepo/issues/1692#issuecomment-4690405562))
reproduced it exactly: a W24 run of zeros pulled μ from 2.2 to 1.9 and tightened
UPL to 7.8, so a pre-existing 5/15–5/17 cluster (values 9/8/9, slots 38/41/42)
retroactively breached limits it previously sat under (X-Rule 1 ×3 and mR-Rule 1
×4, all at slots ≤ 43; the X-Rule 2 firings, slots 47–56 and 58–65, are the
favorable zero-runs themselves). The lane's recent behavior is uniformly
favorable; the status cell reports it as newly unstable.

The gap is structural in `libxmr` — confirmed by staff-engineer reproduction
relayed in the 2026-06-12 facilitated storyboard session: every signal is
detected against limits recomputed over the full series at read time, and
nothing in the emitted record relates a fired signal to any prior read. The
report alone cannot distinguish a recomputation-revealed flip from a genuine
process flip — neither for a human reader nor for the deterministic storyboard
refresh path, which renders each metric's signal summary directly from the
analyze report.

The flip direction is perverse: the better the recent tail, the more likely old
moderate points breach the tightened limits — improvement manufactures red. Any
lane metric with a favorable tail after a moderate-variance era is exposed; the
mechanism is metric-agnostic.

Two findings from those reproductions pin the shape of the fix:

- **Provenance is per signal, not per flip.** The same staff-engineer
  reproduction corrected the issue's originally proposed predicate (provenance
  keyed per flip on whether any fired signal's newest point postdates the prior
  read): in the motivating case itself, the favorable X-Rule 2 zero-runs include
  post-prior-read points, so a per-flip key would classify this flip as
  new-point even though every adverse signal lies wholly in pre-anchor history.
- **Provenance rides on signal records, not on a status field.** The coach's
  validation notes the same series reads `classification: chaos` (mR-Rule 1
  fires) while the lane surface frames the flip as `status` predictable →
  signals_present. A discriminator attached to either roll-up field would have
  to pick one surface; attached to each fired signal, it is correct under both —
  the mR-Rule 1 signals behind the `chaos` verdict are themselves
  recomputation-revealed.

## Composition with spec 1680

Spec 1680 (degenerate-zero classification, PR #1541, `spec draft`) amends the
same analyze report consumed by all lanes. The two changes are orthogonal and
additive: 1680 extends the `classification` enum (a property of the series'
shape); this spec adds a provenance field to fired signal records (a property of
a signal's relation to a prior read). No field is modified by both, and a metric
may report `classification: "degenerate-zero"` and, on a later flip,
recomputation-revealed signals — the values never interact. The two specs touch
the same three documentation files but different sites within them (1680: the
`classification` enumerations; this spec: the `signals` record shape). Every
criterion below is verifiable whether 1680 merges before or after this spec;
whichever doc pass lands second extends files the first has already touched. No
merge-order constraint exists.

## Scope

In scope:

- `libxmr` `analyze` (library API and CLI) accepts an optional **prior-read
  anchor** per metric: the end of that metric's series as of the prior read.
  When supplied, every fired signal record (all four rules) carries a provenance
  value alongside `slots` and `description`: `recomputation-revealed` when no
  participating slot postdates the anchor, and `new-point` when at least one
  does. The value records anchor-relative data membership — every participating
  observation was already present at the prior read — not signal novelty: a
  signal that also fired at the prior read satisfies the same predicate and
  carries the same value, an accepted property since a single anchor cannot
  distinguish newly revealed from persistent signals. The documented meaning of
  the value is this predicate.
- The series is assumed append-only between reads. When the anchor does not
  identify a point of the current series (backfill, correction, or an anchor
  beyond the series end), signal records carry no provenance for that read —
  equivalent to supplying no anchor. With no anchor, the report is unchanged.
- The deterministic storyboard refresh path supplies the prior-read anchor when
  regenerating a metric block and surfaces provenance in the rendered signal
  summary, so a storyboard reader can tell recomputation-revealed signals from
  new-point signals at the cell rather than from prose disclaimers. Anchor
  representation and how the refresh obtains it are design decisions.
- The provenance value is documented at every site that documents the signal
  record shape: the
  [xmr-analysis guide](https://www.forwardimpact.team/docs/libraries/predictable-team/xmr-analysis/index.md)
  (its `signals` JSON-field bullet and its signal-reading guidance) and the
  published `fit-xmr` skill's § Report Shape (`.claude/skills/fit-xmr/SKILL.md`)
  — plus `libraries/libxmr/README.md`, which today carries no signal-record
  documentation at all, so the README gains a signal-record section rather than
  extending one.

Excluded:

- A metric-level per-flip `flip_provenance` roll-up — misclassifies the
  motivating case (§ Problem); consumers needing a roll-up derive it from the
  per-signal values.
- The baseline-freeze convention (issue #1692 option 2) — seeded as a future
  spec under § Downstream, not folded here.
- Spec 1680's surface — the `classification` taxonomy is untouched.
- Signal-detection rules, `status` and `classification` semantics,
  Wheeler/Vacanti constants, and limit computation are all unchanged; provenance
  annotates fired signals, it never suppresses or reorders them.
- Re-rendering historical storyboard blocks or back-filling provenance for past
  reads.

## Success criteria

| #   | Claim                                                                                                                                                                                                                            | Verification                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | With a prior-read anchor supplied, a fired signal with no participating slot postdating the anchor carries `recomputation-revealed`.                                                                                             | New libxmr test fixture reproducing the #1692 shape (favorable tail tightening limits over a pre-anchor cluster) asserts the value; `bun test libraries/libxmr` passes.                                                                 |
| 2   | In the same fixture, a fired signal with at least one post-anchor participating slot carries `new-point`, and both provenance values appear in one metric's report.                                                              | One libxmr test asserts both values on the #1692-shape fixture; `bun test libraries/libxmr` passes.                                                                                                                                     |
| 3   | With no anchor — or an anchor that does not identify a point of the current series — signal records carry no provenance and the report is otherwise unchanged.                                                                   | Existing `libraries/libxmr/test/golden/fit-xmr/` golden snapshots for `analyze`, `chart`, and `summarize` pass unmodified; a new boundary test covers the non-corresponding anchor.                                                     |
| 4   | The storyboard refresh surfaces provenance: regenerating a block whose status flipped while every adverse signal is recomputation-revealed renders a signal summary that distinguishes those signals from new-point signals.     | New libwiki block-renderer/refresh integration test; `bun test libraries/libwiki` passes.                                                                                                                                               |
| 5   | The provenance value is documented at every site that documents the signal record shape, and the guide's signal-reading guidance ("If it says `signals`, look at the `signals` object…") stays accurate with provenance present. | `rg -c recomputation-revealed` returns ≥ 1 for `libraries/libxmr/README.md` and `.claude/skills/fit-xmr/SKILL.md` and ≥ 2 for `websites/fit/docs/libraries/predictable-team/xmr-analysis/index.md`; review confirms the guidance prose. |

## Downstream

- **Improvement coach** — #1692 is in process as a storyboard obstacle; the
  coach's
  [disposition](https://github.com/forwardimpact/monorepo/issues/1692#issuecomment-4690405562)
  routed it to PM spec adjudication per the #1540 precedent, and registered it
  in the measurement-system-trust corpus for the 2026-06-24
  `kata-pattern-synthesis` evaluation. This spec is that adjudication's outcome;
  the obstacle record links here for closure.
- **Technical Writer** — once provenance renders at the cell, the 6/12 prose
  disclaimer on the `summary_corrections` read retires; lane-side wording is
  owned on the #1692 thread, not by this spec.
- **Future spec** — baseline-freeze (issue #1692 option 2): deliberate, recorded
  re-baselining events instead of silent rolling recomputation. The coach's
  validation strengthens its case — the team already believes the 11 re-baseline
  metrics' limits are frozen while the tooling recomputes them on every refresh.
  It changes the meaning of every existing chart, so it owns its own blast
  radius; seeded from the issue when capacity allows.

## Alternatives considered

| Option                                                                                                     | Why not                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-flip `flip_provenance` field keyed on the newest fired-signal point (issue #1692 option 1 as written). | Misclassifies the motivating case (§ Problem): the favorable zero-runs include post-anchor points, so the flip keys `new-point` even though every adverse signal is wholly pre-anchor. Per-signal is the granularity at which provenance is well-defined. |
| Baseline-freeze convention (issue #1692 option 2).                                                         | The durable, Wheeler-orthodox fix — but it changes the meaning of every existing chart and every consumer's read. Deserves its own spec with its own adjudication; deferring it must not block the minimal admit.                                         |
| Fold into spec 1680 as one combined taxonomy spec.                                                         | Adjudicated serial on 2026-06-12 (storyboard session; coach's #1692 disposition concurs): orthogonal axes, maturity asymmetry against the 6/30 re-baseline, opposite failure modes (1680 false-green, this false-red).                                    |
| Detect recomputation flips at the storyboard layer by diffing the prior rendered block.                    | Duplicates detection logic at every consumer and only sees the flip, not which signals caused it. Provenance is computable only where slots and limits are known — in the classifier layer every downstream reader already shares.                        |

— Product Manager 🌱
