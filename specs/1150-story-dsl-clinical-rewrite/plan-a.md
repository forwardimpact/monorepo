# 1150 — Story DSL Clinical Domain Rewrite: Plan

## Approach

Write the concrete `story.dsl` changes — the `clinical {}` block, new projects,
new scenarios, updated datasets, and new outputs — in a single file
modification. This plan produces no library code; it exercises all library
changes from spec 1140. All 8 parts of the 1140 plan should be implemented
before executing this one, because this file exercises the full grammar, entity
generation, prose key collection, rendering, and pipeline.

Libraries used: none (DSL content only).

## Files

| Action | Path |
|--------|------|
| Modified | `data/synthetic/story.dsl` |

## Step 1 — Add `clinical {}` block

Insert after the last `content` block (line 772) and before the datasets
section (line 774). The entire `clinical { … }` block, including the
clinical content sub-block defined below, lives **inside** the `clinical {}`
braces — not at top-level alongside the existing `guide_html` /
`outpost_markdown` content blocks. This matches spec 1140 § Proposal which
scopes clinical content as a sub-block of `clinical`.

**String-quoting note.** `phase` and `status` are STRING-typed per the
parser. Write them quoted in the DSL: `phase "Phase 3"`, `status "recruiting"`,
`status "active_not_recruiting"`. Bare identifiers (e.g. `phase Phase 3`)
will fail the parse at `parseStringValue`. The illustrative tables below
show the *values*; the DSL emission must wrap each in double quotes.

### 6 conditions

| id | name | synthea_module | therapeutic_area |
|----|------|----------------|------------------|
| `lung_cancer` | Non-Small Cell Lung Cancer | `lung_cancer` | oncology |
| `diabetes_t2` | Type 2 Diabetes Mellitus | `diabetes` | endocrinology |
| `cardiovascular` | Cardiovascular Disease | `cardiovascular_disease` | cardiology |
| `breast_cancer` | HER2-Positive Breast Cancer | `breast_cancer` | oncology |
| `hypertension` | Hypertension | `hypertension` | cardiology |
| `copd` | Chronic Obstructive Pulmonary Disease | `copd` | pulmonology |

Each with `icd10`, `synonyms`, `severity`, `prose_topic`, `prose_tone`.

### 5 sites

Cambridge main (500 cap), Boston clinical (200), New York satellite (300),
Chicago research (250), San Francisco trials (150). Each with address, city,
state, country, `org headquarters`, specialties.

### 6 trials

| id | phase | status | conditions | PI |
|----|-------|--------|------------|-----|
| `oncora_phase3` | Phase 3 | recruiting | lung_cancer | @thoth |
| `oncora_phase1` | Phase 1 | completed | lung_cancer | @thoth |
| `cardio_outcomes` | Phase 3 | recruiting | cardiovascular, hypertension | @chronos |
| `diabetes_prevention` | Phase 2 | active_not_recruiting | diabetes_t2 | @hygieia |
| `her2_combo` | Phase 2 | recruiting | breast_cancer | @asclepius |
| `copd_inhaler` | Phase 1 | not_yet_recruiting | copd | @apollo |

Each with full `criteria {}` blocks (inclusion: age range, conditions_required,
prior_treatments, ecog_max, custom strings; exclusion: conditions_excluded,
autoimmune/immunotherapy booleans, custom strings), 2-3 arms, and prose context.

### Clinical content

```dsl
content {
  condition_explainers per_condition
  therapy_descriptions 6
  therapy_topics [mab_therapy, immunotherapy, targeted_therapy,
                  chemotherapy, radiation, clinical_trials_101]
  trial_faqs per_trial
  consent_summaries per_trial
  site_descriptions per_site
  patient_stories 10
  patient_story_conditions [lung_cancer, diabetes_t2,
                            cardiovascular, breast_cancer]
}
```

**Verify:** `bun test` in `libsyntheticgen` — parse the rewritten file.

## Step 2 — Add 3 new projects

Insert after the existing `project cross_func_initiative` block.

```dsl
project finder { ... }          — Clinical Research Finder
project patient_portal { ... }  — BioNova Patient Portal
project trial_management { ... } — BioNova Trial Management System
```

Each with `teams`, `timeline_start/end`, `milestones`, `risks`,
`technical_choices`. Verify that team IDs (`platform_engineering`,
`developer_experience`, `clinical_development`, `enterprise_applications`,
`security_compliance`, `data_science_ai`) exist in the DSL's department/team
hierarchy.

**Verify:** `ast.projects.length === 8` (5 existing + 3 new).

## Step 3 — Add 2 new scenarios

Insert after the existing `scenario one_bionova` block.

- `scenario finder_mvp_push` — affects `platform_engineering`,
  `developer_experience`, `clinical_development`. Timerange 2025-06 to 2025-09.
- `scenario finder_ga_release` — affects `platform_engineering`,
  `developer_experience`. Timerange 2025-10 to 2026-03.

Each with `affect` blocks containing `github_commits`, `github_prs`,
`dx_drivers`, `evidence_skills`, `evidence_floor`.

**Verify:** `ast.scenarios.length === 7` (5 existing + 2 new).

## Step 4 — Update dataset block

Replace the `trial_patients` block (lines 776-780):

```dsl
dataset trial_patients {
  tool synthea
  population 200
  conditions [lung_cancer, diabetes_t2, cardiovascular,
              breast_cancer, hypertension, copd]
}
```

**Verify:** `ast.datasets` contains `trial_patients` with `config.conditions`.

## Step 5 — Remove researchers dataset

Delete the `dataset researchers { ... }` block (lines 791-802) and its output
blocks (`researchers yaml` at line 811, `researchers markdown` at line 812).

**Downstream-consumer check (panel-verified at plan time):** A monorepo-wide
grep for readers of `output/researchers.{yaml,md}` returned zero code or
product consumers — only the `data/synthetic/story.dsl` producer (being
removed) and a historical reference in `specs/0063-synthetic-generalize/`
documentation. Deletion is safe with no further consumer search needed.

**Verify:** `ast.datasets.length === 2` (trial_patients + claims).

## Step 6 — Add new output blocks

After the existing output blocks (keeping `claims_claims` outputs):

```dsl
output finder_seed supabase_migration {
  path "products/finder/site/supabase/migrations/"
  prefix "seed"
  entities [clinical.conditions, clinical.sites,
            clinical.researchers, clinical.trials, clinical.criteria]
  include_embeddings true
}

output finder_embeddings embeddings_jsonl {
  path "products/finder/site/supabase/migrations/seed_embeddings.jsonl"
  entities [clinical.conditions, clinical.trials]
  text_fields {
    clinical.conditions [name, synonyms, prose_explainer]
    clinical.trials [name, arms, prose_description]
  }
}
```

**Entity-derivation note.** `clinical.researchers` is **entity-generated** per
spec 1140 — the renderer derives a researcher record from each trial's
`principal_investigator @ref` (see `render-sql.js` TABLE_SPEC `researchers`
key). Do **not** author a separate `researcher { … }` block inside
`clinical {}`; the implementer should reference `clinical.researchers` in
the `entities [...]` list and rely on derivation.

**Field-correctness note.** `clinical.trials` embedding `text_fields` lists
`[name, arms, prose_description]`. The previous draft included
`therapeutic_area`, which spec 1140 places on conditions, not trials —
removed to keep the embedding payload consistent with the entity shape.

**Verify:** `ast.outputs` contains `finder_seed` and `finder_embeddings` with
correct formats.

## Step 7 — Keep unchanged

All existing blocks (org, departments, teams, standard, snapshots, 5 existing
projects, 5 existing scenarios, `claims` dataset, `claims_claims` outputs,
`trial_patients_patient json` / `csv` / `trial_patients_condition json`
outputs at L806-808) remain untouched. Step 4 redefines the `trial_patients`
dataset *body* (replacing `modules` with `conditions`) but its three output
blocks at L806-808 keep their existing form so downstream readers of
`output/trial_patients.{json,csv}` and `output/trial_conditions.json` continue
to receive the same files.

## Risks

- **PI @refs and team IDs — verified at plan time.** All five PI @refs
  (`@thoth` L23, `@chronos` L30, `@apollo` L37, `@hygieia` L44,
  `@asclepius` L146) and all six team IDs (`clinical_development` L27,
  `platform_engineering` L61, `data_science_ai` L68, `security_compliance`
  L82, `enterprise_applications` L89, `developer_experience` L96) were
  confirmed present in the current `data/synthetic/story.dsl` during the
  panel-of-3 review. No mitigation step required at implementation time;
  the implementer can reference these symbols directly.

- **`writeFiles` second-segment `rm -rf` hazard (out-of-scope; flagged for
  1160 design).** `sinks.js:217` cleans the second path segment of every
  emitted relative path before writing — so the new `path
  "products/finder/site/supabase/migrations/"` causes `rm -rf
  products/finder` on each build. For spec 1150 this is harmless because
  no other files exist at `products/finder/` yet, but the 1160 BioNova
  Finder application will populate that directory with `site/`, `cli/`,
  `handlers/`. **The 1160 design must address write isolation** — either by
  routing terrain outputs into a scoped sub-path (e.g.
  `products/finder/seed/supabase/migrations/`), narrowing the sinks rm to
  the leaf directory only, or by emitting through a separate sink that
  doesn't follow the "rm second segment" rule. Out of scope for 1150
  implementation; logged here so 1160 doesn't lose the constraint.

- **Migration filename convention.** `render-sql.js` emits `seed_001_*.sql`,
  `seed_002_*.sql`, etc. Supabase's documented convention is
  `YYYYMMDDHHMMSS_*.sql` so migrations sort chronologically across teams;
  numeric-prefix files sort lexicographically and `supabase db push` accepts
  both — so the smoke test passes either way. If 1160 wants timestamp-based
  filenames, that's a renderer change (libsyntheticrender / spec 1160's
  call), not a 1150 plan concern.

## Verification

### Parse test

```sh
cd libraries/libsyntheticgen && bun test
```

### Parse output inspection

Run from `libraries/libsyntheticgen/`:

```sh
bun -e "
  const { tokenize } = await import('./src/dsl/tokenizer.js');
  const { parse } = await import('./src/dsl/parser.js');
  const { readFileSync } = await import('fs');
  const src = readFileSync('../../data/synthetic/story.dsl', 'utf-8');
  const ast = parse(tokenize(src));
  console.log('clinical:', ast.clinical !== null);
  console.log('conditions:', ast.clinical.conditions.length);
  console.log('sites:', ast.clinical.sites.length);
  console.log('trials:', ast.clinical.trials.length);
  console.log('projects:', ast.projects.length);
  console.log('scenarios:', ast.scenarios.length);
  console.log('datasets:', ast.datasets.length);
"
```

`bun -e` accepts dynamic `await import()` without an `--input-type=module`
toggle and handles the project's ESM convention natively. `node -e` with
static `import` throws SyntaxError; if the implementer prefers Node, run it
as a `.mjs` script instead.

Expected: clinical: true, conditions: 6, sites: 5, trials: 6, projects: 8,
scenarios: 7, datasets: 2.

### Full pipeline smoke test

**Cache-fill prerequisite.** This step introduces ~39 net-new prose keys
(condition_explainers × 6 + therapy_descriptions × 6 + trial_faqs × 6 +
consent_summaries × 6 + site_descriptions × 5 + patient_stories × 10), none
of which exist in `data/synthetic/prose-cache.json` before this plan runs.
`bunx fit-terrain build` is the cached-mode render verb and will hit
cache-miss for every new key on a cold cache. The implementer must therefore
follow a two-step workflow:

```sh
# Step A — fill cache (one-time LLM call, incurs cost):
bunx fit-terrain generate

# Commit the populated cache so CI sees a warm cache:
git add data/synthetic/prose-cache.json
git commit -m "chore(1150): refresh prose-cache for new clinical entities"

# Step B — verify SC #6 (LLM-free, repeatable in CI):
bunx fit-terrain build
ls -la products/finder/site/supabase/migrations/
```

`build` is the cached-mode render verb (no LLM calls) per
`libraries/libterrain/bin/fit-terrain.js:81-98`. The DSL `path` field is honored
literally by `render-sql.js` + `sinks.js` — no `output/` prefix is prepended, so
files land under monorepo-root `products/finder/site/supabase/migrations/`.

Note: Step A's `generate` already runs `build` as its second phase ("Fill
the prose cache via LLM, then build" — `fit-terrain.js:101-102`), so Step
A's invocation also writes the output files. Step B's `build` is a
deliberate re-run that proves SC #6 holds **from a warm cache only** — i.e.
that CI can verify the smoke test without any LLM call. If you skip Step B
the outputs are correct but SC #6's LLM-free guarantee is unverified.

Verify SQL migrations and embeddings JSONL are generated. Existing outputs
(claims, trial_patients_*) still generate.

### Existing outputs unchanged (spec SC #7 + Step 7 commitments)

Spec SC #7 calls out claims; Step 7 of this plan additionally commits that
the three `trial_patients_*` output blocks (L806-808) remain byte-identical
in their existing form. Snapshot both sets before Step 1 and verify after
Step B of the smoke test.

**Baseline-generation prerequisite.** `output/` is gitignored (no
pre-existing baseline in the working tree). Materialize a baseline by
running the build on the unmodified DSL **before** taking the snapshot:

```sh
# Baseline — produce output/ from the unmodified story.dsl:
bunx fit-terrain build
```

Then take the snapshot:

```sh
# Pre-change (before editing story.dsl):
shasum output/claims.sql \
       output/trial_patients.json \
       output/trial_patients.csv \
       output/trial_conditions.json \
       > /tmp/outputs-pre.sha

# Parquet handled separately (see determinism note below):
duckdb -c "SELECT COUNT(*) AS rows FROM 'output/claims.parquet'" \
       > /tmp/claims-parquet-pre-rows.txt

# Post-change (after Step B `bunx fit-terrain build`):
shasum -c /tmp/outputs-pre.sha
duckdb -c "SELECT COUNT(*) AS rows FROM 'output/claims.parquet'" \
       > /tmp/claims-parquet-post-rows.txt
diff /tmp/claims-parquet-pre-rows.txt /tmp/claims-parquet-post-rows.txt
```

**Determinism note.** `writeFiles` (`libraries/libterrain/src/sinks.js:209-218`)
`rm -rf`'s top-level subdirs then rewrites, so every output is regenerated.
Byte-equality holds for SQL/JSON/CSV (the renderers are pure functions over
deterministic AST input — no timestamps, no UUIDs). It does **not** hold for
parquet: parquet file headers carry library-version and creation-timestamp
metadata that drift across runs even when the row data is identical. For
parquet, verify equality at the row-count + schema level via `duckdb` (or
`parquet-tools` if duckdb isn't on PATH). If neither tool is available, fall
back to `ls -la output/claims.parquet` byte-size comparison — the SDV row
generator is seeded deterministically, so file size should match.
