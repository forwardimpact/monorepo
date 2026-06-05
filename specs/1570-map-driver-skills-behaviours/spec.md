# Spec 1570 — Per-Driver Contributing Skills and Behaviours for the Starter Drivers

## Problem

[Spec 1180](../1180-starter-drivers-getdx-canonical/spec.md) landed the
16-id GetDX driver taxonomy in `products/map/starter/drivers.yaml`. Each
entry carries `id`, `name`, and `description` only — the optional
`contributingSkills` and `contributingBehaviours` arrays were deferred.

The schema declares both fields as optional arrays of skill and behaviour
ids; the map validator gates populated arrays for referential integrity
against the starter capabilities and behaviours catalogs. Consumer code in
Landmark, Pathway, and Summit handles the empty case gracefully — and so
degrades silently on every driver:

- The Landmark verbose health view does not render the "Contributing
  skills:" line for any driver.
- Pathway driver cards report zero contributing-skill and
  contributing-behaviour counts for every driver.
- Pathway skill and behaviour cards yield zero driver references in their
  reverse mappings.
- Summit growth recommendations produce no driver-to-skill join when
  proposing growth direction.

Every consumer that should connect drivers (the outcomes the standard
measures) to skills and behaviours (the practices that influence them) is
unwired on a clean starter install.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Engineering Leaders | [Define the Engineering Standard](../../JTBD.md#engineering-leaders-define-the-engineering-standard) — Map | The starter standard ships with no practice-to-outcome wiring, so the standard the leader hands their org to evaluate against carries an outcome list disconnected from the skills it expects engineers to practice. |
| Empowered Engineers | [Find Growth Areas](../../JTBD.md#empowered-engineers-find-growth-areas) — Landmark | The verbose health view's per-driver "Contributing skills:" line does not render for any driver, so the engineer sees per-driver scores with no growth direction attached to them. |
| Empowered Engineers | [Understand Expectations](../../JTBD.md#empowered-engineers-understand-expectations) — Pathway | Pathway's driver, skill, and behaviour cards report empty contribution counts and empty reverse mappings on the starter standard, so the engineer sees a taxonomy without the connections that would let them act on it. |

## Scope

### In scope

| Component | What changes |
|---|---|
| `products/map/starter/drivers.yaml` | Each of the 16 starter drivers carries a non-empty `contributingSkills` array referencing skill ids that resolve through the starter capabilities catalog. `contributingBehaviours` is populated where a starter behaviour applies. The catalog's current shape (15 skills across 5 capabilities; 1 behaviour) bounds what is achievable; closing semantic gaps by adding new catalog entries is excluded below. |

### Invariants preserved (not changes)

- **Driver set.** The 16 driver ids and their existing `name` and
  `description` fields are unchanged.
- **Schema.** The drivers schema is unchanged; both contribution fields
  remain optional arrays of snake_case string ids.
- **Validator.** The map validator's `INVALID_REFERENCE` rule is unchanged;
  this spec satisfies the existing rule rather than introducing or relaxing
  it.
- **Consumer code.** No source file under `products/landmark/`,
  `products/pathway/`, or `products/summit/` is changed. The consumer
  surfaces named in § Problem become non-empty because the data becomes
  non-empty, not because any rendering rule changes.
- **Skill and behaviour catalogs.** The starter capabilities under
  `products/map/starter/capabilities/` and the starter behaviour under
  `products/map/starter/behaviours/` are unchanged. No new skill or
  behaviour ids are added to fill a perceived semantic gap.

### Out of scope

- Authoring `contributingSkills` / `contributingBehaviours` on driver
  entries in downstream installations of the starter — each consuming
  organization owns its own driver-to-skill mapping after install.
- Adding new skill ids to the starter capabilities or new behaviour ids to
  the starter behaviours catalog to close perceived semantic gaps; semantic
  gaps surfaced during authoring are not closed in this spec.
- Changes to the schema, validator, or any consumer rendering rule in
  Landmark, Pathway, or Summit.
- Renaming, replacing, or extending the 16 GetDX driver ids.
- Adding an `evidence` field or other per-driver metadata beyond what the
  schema already declares.

## Success Criteria

| Claim | Verification |
|---|---|
| Every one of the 16 starter drivers carries a non-empty `contributingSkills` array. | Run `yq '[.[] \| select((.contributingSkills // []) \| length == 0)] \| length' products/map/starter/drivers.yaml`; observe `0`. |
| Every id used in any driver's `contributingSkills` resolves to a skill id in the starter capabilities catalog; every id used in any driver's `contributingBehaviours` resolves to a behaviour id in the starter behaviours catalog. | Run `bunx fit-map validate --data products/map/starter`; observe zero `INVALID_REFERENCE` errors and overall pass. |
| The map test suite stays green. | Run `bun test products/map/`; observe pass. |

## References

- [Spec 1180](../1180-starter-drivers-getdx-canonical/spec.md) — landed
  the 16 driver ids and deferred contribution-array authoring.
- [Issue #1112](https://github.com/forwardimpact/monorepo/issues/1112) — the
  surfaced gap.
- [JTBD.md](../../JTBD.md) — Engineering Leaders and Empowered Engineers
  personas.

— Product Manager 🌱
