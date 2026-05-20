# Spec 1150 — Story DSL Clinical Domain Rewrite

The current `story.dsl` tells a pure engineering-organization narrative. For the
BioNova Finder demo, the story needs to expand into the clinical domain while
preserving the existing engineering narrative (the Kata agent team still needs
the org, teams, projects, scenarios, and standard for Pathway and Landmark).

## Problem

The `story.dsl` has no clinical domain content. No conditions, sites, or trials
exist. The `trial_patients` dataset uses hardcoded Synthea modules instead of
cross-referencing clinical entities. The `researchers` faker dataset generates
100 random records with no trial links. The output blocks produce no SQL
migrations or embeddings JSONL.

### Who is affected

- The BioNova Finder application — cannot be seeded without clinical content in
  the story.
- The terrain pipeline integration tests — no DSL file exercises the clinical
  grammar (spec 1140).
- The demo pitch — no clinical data means no live demo.

## Proposal

Add a `clinical {}` block to `story.dsl` containing the full clinical domain:
6 conditions (all with Synthea modules), 5 sites, 6 trials with realistic
criteria, and a clinical content sub-block with per-entity prose generation.

Add the Finder as an engineering project alongside 2 adjacent projects (Patient
Portal, Trial Management System) to create realistic engineering context. Add 2
scenarios (MVP push, GA release) with team-level DX driver effects.

Replace the `trial_patients` dataset to use clinical condition cross-references.
Remove the `researchers` faker dataset (replaced by entity-generated
`ClinicalResearcherEntity`). Add `supabase_migration` and `embeddings_jsonl`
output blocks with domain-qualified entity references.

## Scope

### Included

- `data/synthetic/story.dsl` — the sole file modified.
- New `clinical {}` block: 6 conditions, 5 sites, 6 trials with criteria,
  clinical content sub-block.
- 3 new projects: Finder, Patient Portal, Trial Management System.
- 2 new scenarios: `finder_mvp_push`, `finder_ga_release`.
- Updated `trial_patients` dataset with `conditions` field.
- Removed `researchers` dataset and its output blocks.
- New `supabase_migration` and `embeddings_jsonl` output blocks.

### Excluded

- Library code changes — those are in spec 1140.
- The BioNova Finder application — specified in spec 1160.
- Existing blocks (org, departments, teams, standard, snapshots, existing 5
  projects, existing 5 scenarios, `claims` dataset) — unchanged.

## Success Criteria

1. `story.dsl` parses without error. Verify: `bun test` in `libsyntheticgen`.

2. `ast.clinical` contains 6 conditions, 5 sites, 6 trials. Verify: parse
   output inspection.

3. `ast.projects` contains 8 projects (5 existing + 3 new). Verify: parse
   output inspection.

4. `ast.scenarios` contains 7 scenarios (5 existing + 2 new). Verify: parse
   output inspection.

5. `ast.datasets` contains 2 datasets (`trial_patients` + `claims`; researchers
   removed). Verify: parse output inspection.

6. `bunx fit-terrain build` produces SQL migrations and embeddings JSONL at the
   configured output paths. Verify: files exist at
   `products/finder/site/supabase/migrations/`. (`build` is the LLM-free render
   verb per `libraries/libterrain/bin/fit-terrain.js`; `generate` would also
   work but additionally calls the LLM to refill the prose cache.)

7. Existing outputs (`claims` parquet and SQL) still generate unchanged. Verify:
   diff against pre-change output.
