# Spec 1180: Starter `drivers.yaml` canonical to GetDX taxonomy + health view distinguishes empty from no-match

## Problem

The starter `drivers.yaml` shipped by `fit-map init` and the seeded snapshot
rows produced by `fit-terrain build` use disjoint identifier sets. The two
were never reconciled.

- `products/map/starter/drivers.yaml` declares three driver ids: `quality`,
  `reliability`, `cognitive_load`. The `quality` entry was authored
  2026-03-31 (commit `6e0391cc`) before the synthetic terrain pipeline
  existed; the file was moved from `products/pathway/starter/` into
  `products/map/starter/` on 2026-04-09 (commit `c3896fab`); `reliability`
  and `cognitive_load` were added on 2026-04-12 (commit `275bf7e0`,
  Landmark product implementation). The concept set is
  organizational-outcome-shaped — orthogonal to any DX-vendor taxonomy.
- `libraries/libsyntheticgen/src/engine/activity.js:13-30` declares a 16-id
  `ALL_DRIVERS` constant (`clear_direction`, `say_on_priorities`,
  `requirements_quality`, `ease_of_release`, `test_efficiency`,
  `managing_tech_debt`, `code_review`, `documentation`, `codebase_experience`,
  `incident_response`, `learning_culture`, `experimentation`, `connectedness`,
  `efficient_processes`, `deep_work`, `leveraging_user_feedback`) whose ids
  mirror GetDX's published driver set. The same 16 ids appear in
  `data/synthetic/story.dsl:661-742` as a `standard.drivers` taxonomy block. The
  DSL block is consulted at runtime only for initiative metadata
  (`libraries/libsyntheticgen/src/engine/activity-initiatives.js`); the source
  of `item_id` strings on every score row is the constant.
- `libraries/libsyntheticgen/src/engine/activity.js:242` iterates
  `ALL_DRIVERS` inside `generateScores`; line 260 writes
  `item_id: driverId` for every score row. Zero ids in `ALL_DRIVERS`
  overlap with the starter list.

Observable user impact on the clean install path
(`npx fit-map init` → `npx fit-terrain build` → `npx fit-landmark health`):

```text
$ npx fit-landmark health --manager daedalus@bionova.example 2>warnings.txt
$ wc -l warnings.txt
  # up to 16 distinct "Unknown item_id" lines, one per driver id present
  # in the manager's team scope
$ npx fit-landmark health --manager daedalus@bionova.example | grep Drivers
  Drivers (0)
```

The aggregation reads as "this tool isn't tracking anything," even though
the join logic at `products/landmark/src/commands/health.js:140-187`
(`buildDriverRows`) ran correctly. The percentile math itself ran inside
`fit-terrain build` and arrived pre-computed on each `scoreRow`
(`scoreRow.score`, `scoreRow.vs_*`); every score row was then dropped at the
`driverMap.get(item_id)` join because the user's `drivers.yaml` knows none
of the ids.

The `Drivers (N)` line at `products/landmark/src/formatters/health.js:219`
and `products/landmark/src/formatters/health.js:255` renders identically
when the user's list is empty and when their list is populated but disjoint
from the snapshot rows. The two failure modes need different fixes; today
they look the same.

## Persona and job

**Empowered Engineers → Find Growth Areas** ([JTBD.md](../../JTBD.md)). The
persona checks "whether recent work shows progress" against snapshot scores.
`Drivers (0)` plus a wall of warnings reads as a broken dashboard, which
corrodes confidence in the readout even though the underlying numbers are
intact. The competing Habit — "Waiting for annual feedback rather than
continuously self-assessing" — becomes the more attractive option exactly
when the tool was meant to replace it.

## Strategic position

The starter is opinionated. The monorepo's synthetic-data pipeline already
encodes GetDX as the canonical DX vendor (the 16-id `ALL_DRIVERS` set in
`libraries/libsyntheticgen/src/engine/activity.js`). The starter
`drivers.yaml` shipped to consumers must match that opinion and document
itself as such, so a fresh `fit-map init` plus `fit-terrain build` produces
a coherent view without per-consumer reconciliation work. Consumers
integrating a different DX vendor in future are explicitly out of scope for
this spec — they hold the same shape of conflict and will be addressed when
a second vendor lands, not pre-emptively.

## Scope

| Surface | Change | What it does |
| --- | --- | --- |
| `products/map/starter/drivers.yaml` | replace 3-id list with the 16 ids from `libraries/libsyntheticgen/src/engine/activity.js` `ALL_DRIVERS` | each entry carries `id`, `name`, `description`, and the existing reference arrays (`contributingSkills`, `contributingBehaviours`), populated only with ids that already exist in starter `capabilities/` and `behaviours/` |
| GetDX-canonical note inside `products/map/starter/` | declares GetDX as the canonical DX vendor this starter encodes | reachable from a reader of the starter without leaving the directory; the location is a design decision bounded to forms that do not modify any schema in `products/map/schema/json/` — e.g. a top-of-file YAML comment in `drivers.yaml`, a dedicated starter `README.md`, or another sibling file under `products/map/starter/` |
| `products/landmark/src/commands/health.js` aggregation | produces a distinct operator-visible state when (a) `drivers.yaml` is empty, (b) snapshot rows have ids but none match `drivers.yaml`, vs. the existing populated-and-matched case | the three states are observably distinguishable; phrasing is a design decision |
| `products/landmark/src/formatters/health.js` `Drivers (…)` line | conveys the distinct state without losing the existing baseline behaviour | the populated-and-matched output is unchanged |

### Out of scope

| Surface | Reason | Escape route |
| --- | --- | --- |
| Reconciling `data/synthetic/story.dsl § standard.drivers` with the `ALL_DRIVERS` constant | the DSL block is currently declarative-only and not consulted by score generation; the runtime source already matches itself | follow-on spec if the DSL block is wired into runtime parsing |
| Driver descriptions / `contributingSkills` / `contributingBehaviours` content quality | mapping the 16 GetDX ids to skills and behaviours is itself a content-authoring decision; this spec sets the shape, not the prose | follow-on issue if the design review surfaces mapping ambiguity that needs product input |
| LinearB / Jellyfish / Code Climate / no-vendor starter variants | second-DX-vendor support is hypothetical until a concrete consumer asks for it; pre-empting it would lock the starter into an abstraction nobody yet uses | new spec when a second vendor lands |
| Migration of an existing consumer `data/pathway/drivers.yaml` | `fit-map init` is idempotent — it uses `cp` with `force: false, errorOnExist: false` at `products/map/src/commands/init.js:43-50` and silently skips existing files; existing installs are unaffected by a starter change | document the silent-skip behaviour in the implementation notes; consumers who want the new list re-run `fit-map init` after removing their existing `drivers.yaml` |
| `snapshot show` / `snapshot compare` warning copy | `products/landmark/src/commands/snapshot.js:128-140` (`collectDriverWarnings`) emits the same "Unknown item_id" warnings on those surfaces; tightening their copy is separable from the health-view aggregation fix | follow-on issue if user testing surfaces the same UX gap on those surfaces |
| Schema changes anywhere in `products/map/schema/json/` | the existing `drivers.schema.json` already permits any snake_case id and the documented field set; the canonical-vendor note (above) is bounded to forms that do not modify any schema | n/a |

## Success criteria

| # | Criterion | Verification |
| --- | --- | --- |
| 1 | Starter `drivers.yaml` enumerates exactly the 16 ids defined in the `ALL_DRIVERS` constant at `libraries/libsyntheticgen/src/engine/activity.js:13-30` | id-set equality test: the set of `id:` values in starter `drivers.yaml` equals the set of strings in `ALL_DRIVERS` |
| 2 | A reader of `products/map/starter/` can identify GetDX as the canonical DX vendor without leaving the starter directory | a file under `products/map/starter/` (location chosen in design, from the bounded set in the scope row) carries a discoverable note that names GetDX as the canonical vendor |
| 3 | `npx fit-landmark health --manager <seeded-manager>` against a fresh `fit-map init` + `fit-terrain build` writes zero "Unknown item_id" lines to stderr | run the documented clean-install command sequence against the canonical seed (BioNova or successor), capture stderr, and confirm zero occurrences of the literal string `Unknown item_id` |
| 4 | A user whose `drivers.yaml` is empty, a user whose `drivers.yaml` is populated but disjoint from snapshot ids, and a user whose `drivers.yaml` is populated and overlaps each see observably distinct copy on the health view | the human-readable output of `fit-landmark health` (stdout, the section the user reads — not just stderr warnings) differs across the three states in a way that names which side of the join is empty and where the user would edit |
| 5 | Existing consumer repos with `data/pathway/drivers.yaml` already present are not auto-migrated by the change | re-running `fit-map init` against an existing `data/pathway/` succeeds with exit code 0 (idempotent skip per `products/map/src/commands/init.js:43-50`); the pre-existing `drivers.yaml` is preserved byte-for-byte |
| 6 | The updated starter validates under `bunx fit-map validate` | starter passes shape validation against `products/map/schema/json/drivers.schema.json` and any cross-file ref validation (e.g. `products/map/src/validation/driver.js`) without schema changes |

## Risks

- **Reference arrays may reach ids not present in the starter.** The starter's
  `capabilities/` and `behaviours/` files carry their own opinionated sets;
  introducing 16 drivers that name `contributingSkills` or
  `contributingBehaviours` outside those sets would surface as cross-file
  validation errors during criterion 6. The design must resolve this — either
  by adding missing entries, by leaving the reference arrays empty for
  drivers whose mapping is not yet authored, or by another mechanism — but
  the resolution is a HOW question that does not change the criterion.
- **Downstream consumers who already authored a custom `drivers.yaml`** will
  not be affected by the starter change (criterion 5), but they will continue
  to hit the same observable behaviour the issue describes until they
  reconcile their own list with their snapshot ids. The improved
  health-view copy (criterion 4) gives them a more legible next step.
- **DSL declarative block drift.** `data/synthetic/story.dsl § standard.drivers`
  currently mirrors `ALL_DRIVERS`. If that mirror drifts, criterion 1 will
  still pass (it anchors on the constant), but downstream runtime paths that
  read `ast.standard.drivers` — initiative derivation in
  `libraries/libsyntheticgen/src/engine/activity-initiatives.js` and the
  comment generator in `libraries/libsyntheticgen/src/activity/comment.js`
  — would diverge from the score-row ids. Anchoring criterion 1 on the
  constant keeps this spec's verification pointed at the user-visible
  failure surface, but the divergence is real and lives outside this spec.

## References

- Issue [#986](https://github.com/forwardimpact/monorepo/issues/986) — original
  user-testing report and triage classification.
- Spec 1080 (`spec approved`) — adds `data_engineering` and
  `engineering_management` disciplines to the starter; sibling change in the
  same starter directory, no overlap on `drivers.yaml`.
- `libraries/libsyntheticgen/src/engine/activity.js` `ALL_DRIVERS`
  (lines 13-30) — canonical 16-id source for criterion 1.
- `data/synthetic/story.dsl § standard.drivers` (lines 661-742) — declarative
  mirror of the same 16; not the runtime source but useful provenance.
- `products/map/schema/json/drivers.schema.json` and
  `products/map/src/validation/driver.js` — validation contracts referenced
  by criterion 6.
