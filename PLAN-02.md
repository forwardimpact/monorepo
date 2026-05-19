# PLAN-02: Clinical Entity Generator

> Produce five new entity types from the `ClinicalBlock` AST node and place
> them under `entities.clinical` — a new domain-scoped namespace in the
> entity graph. Build bidirectional relationships, generate researcher
> entities from PI refs, and interpolate enrollment over snapshots.

## Dependencies

- **PLAN-01** — The parser must produce `ast.clinical: ClinicalBlock` before
  the entity generator can consume it.

## Dependency Graph

```
PLAN-01 → PLAN-02 → PLAN-03 (prose keys)
                  → PLAN-05 (pipeline)
                  → PLAN-08 (clinical HTML templates)
```

## Files to Modify

| File | Change |
|------|--------|
| `libraries/libsyntheticgen/src/engine/tier0.js` | Call `buildClinicalEntities()`, attach `entities.clinical` |
| `libraries/libsyntheticgen/src/engine/entities.js` | Export and call `buildClinicalEntities()` |
| `libraries/libsyntheticgen/src/index.js` | No change needed (entities are internal) |

## Files to Create

| File | Purpose |
|------|---------|
| `libraries/libsyntheticgen/src/engine/clinical-entities.js` | `buildClinicalEntities(ast, people, orgs, domain, rng)` |
| `libraries/libsyntheticgen/test/clinical-entities.test.js` | Tests for clinical entity generation |

## Entity Types

### entities.clinical namespace

```javascript
entities.clinical = {
  conditions: ClinicalConditionEntity[],
  sites: ClinicalSiteEntity[],
  trials: ClinicalTrialEntity[],
  criteria: ClinicalCriterionEntity[],
  researchers: ClinicalResearcherEntity[]
}
```

### ClinicalConditionEntity

Derived from `ClinicalCondition` AST nodes. Add bidirectional trial links
(computed after trials are processed).

```javascript
{
  id, name, icd10, synonyms, synthea_module, severity,
  prose_topic, prose_tone,
  trials: string[],          // back-link: trial IDs referencing this condition
  iri: `https://${domain}/id/clinical/condition/${id}`
}
```

### ClinicalSiteEntity

Derived from `ClinicalSite` AST nodes. Resolve `org_ref` against root orgs.

```javascript
{
  id, name, address, city, state, country,
  org_ref,
  org: { id, name, iri },   // resolved org entity (or null if ref not found)
  capacity, specialties,
  trials: string[],          // back-link: trial IDs at this site
  iri: `https://${domain}/id/clinical/site/${id}`
}
```

### ClinicalTrialEntity

Derived from `ClinicalTrial` AST nodes. Resolve cross-domain references.

```javascript
{
  id, name, protocol_id, phase, therapeutic_area,
  conditions: string[],      // condition IDs (within clinical scope)
  sites: string[],           // site IDs (within clinical scope)
  principal_investigator: { ref, person },  // resolved person entity
  project_ref,
  project: { id, name, iri } | null,       // resolved project entity
  sponsor, status, target_enrollment, current_enrollment,
  start_date, estimated_end_date, arms,
  prose_topic, prose_tone,
  criteria: ClinicalTrialCriteria,
  iri: `https://${domain}/id/clinical/trial/${id}`
}
```

### ClinicalCriterionEntity

Flattened from `ClinicalTrialCriteria` for rendering convenience — one record
per trial, containing both inclusion and exclusion.

```javascript
{
  trial_id,
  inclusion: { age_min, age_max, conditions_required, prior_treatments_allowed, ecog_max, custom },
  exclusion: { conditions_excluded, active_autoimmune, prior_immunotherapy, custom },
  iri: `https://${domain}/id/clinical/criterion/${trial_id}`
}
```

### ClinicalResearcherEntity

Generated from `principal_investigator` @refs on trials, plus additional
researchers distributed from the people pool.

```javascript
{
  id,                        // person ID
  person_ref,                // @ref value from DSL
  name, email,
  role: "principal_investigator" | "co_investigator",
  trial_ids: string[],
  specialty,                 // from person's discipline or team
  iri: `https://${domain}/id/clinical/researcher/${id}`
}
```

## Steps

### 1. Create clinical-entities.js

Export `buildClinicalEntities(clinicalAst, people, orgs, projects, domain, rng)`.

#### Phase 1: Direct mapping

Map AST `conditions[]`, `sites[]`, `trials[]` to entity objects, adding IRIs.
`criteria[]` are extracted from each trial's `criteria` block.

#### Phase 2: Cross-domain reference resolution

- **trial.principal_investigator** — `@ref` resolves against `people[]`. Match
  by manager name lookup (same pattern as `MANAGER_NAMES` in names.js,
  imported by entities.js). If `@thoth` → find person whose name matches the
  manager alias `thoth`. Error if no match found.

- **trial.project_ref** — optional. Resolve against `projects[]` by ID.

- **site.org_ref** — resolve against `orgs[]` by ID.

Reference resolution pattern: iterate refs, find matching entity, attach
resolved object. Throw descriptive error on missing refs with the DSL entity
context (e.g. `"trial 'oncora_phase3' references unknown PI '@thoth'"`)

#### Phase 3: Bidirectional relationships

After all trials are mapped:

```javascript
for (const trial of trials) {
  for (const condId of trial.conditions) {
    const cond = conditionMap.get(condId);
    if (!cond) throw new Error(`Trial '${trial.id}' references unknown condition '${condId}'`);
    cond.trials.push(trial.id);
  }
  for (const siteId of trial.sites) {
    const site = siteMap.get(siteId);
    if (!site) throw new Error(`Trial '${trial.id}' references unknown site '${siteId}'`);
    site.trials.push(trial.id);
  }
}
```

Validate that all referenced condition and site IDs exist within the
`ClinicalBlock` scope before falling back to the terrain root.

#### Phase 4: Researcher generation

1. For each trial, resolve `principal_investigator` against people.
   Create `ClinicalResearcherEntity` with `role: "principal_investigator"`.

2. Collect additional people from clinical-adjacent teams (teams referenced
   by clinical projects, or teams with clinical-related names). Use the
   seeded RNG to pick co-investigators and distribute across trials.

3. Each researcher appears once in the array; `trial_ids` accumulates all
   trials they're associated with.

#### Phase 5: Enrollment interpolation (optional)

If `entities.snapshots` has quarterly dates, interpolate enrollment for each
trial across snapshots. For each snapshot quarter between `start_date` and
the current snapshot:

```javascript
function interpolateEnrollment(trial, snapshotDate, rng) {
  const start = parseQuarter(trial.start_date);
  const end = parseQuarter(trial.estimated_end_date);
  const progress = (snapshotDate - start) / (end - start);
  const base = Math.round(trial.target_enrollment * Math.min(progress, 1));
  const noise = rng.randomInt(-5, 10) / 100;
  return Math.max(0, Math.round(base * (1 + noise)));
}
```

Store as `trial.enrollment_snapshots: { [quarter]: number }`. This is
consumed by the rendering pipeline for historical data but is not required
for the basic entity generation to work.

### 2. Wire into tier0.js

In `EntityGenerator.generate()` (tier0.js:31-54), after `buildEntities()`:

```javascript
generate(ast) {
  const rng = this.rngFactory(ast.seed);
  const { orgs, departments, teams, people, projects } = buildEntities(
    ast, rng, this.logger,
  );
  const activity = generateActivity(ast, rng, people, teams);

  // Clinical entities (if clinical block present)
  const clinical = ast.clinical
    ? buildClinicalEntities(ast.clinical, people, orgs, projects, ast.domain, rng)
    : null;

  return {
    orgs, departments, teams, people, projects,
    scenarios: ast.scenarios,
    snapshots: ast.snapshots,
    standard: { ...ast.standard, seed: ast.seed },
    content: ast.content,
    activity,
    clinical,    // <-- new
    domain: ast.domain,
    industry: ast.industry,
  };
}
```

### 3. Guard existing code

The `entities.clinical` field is `null` when no clinical block exists.
Downstream stages (`prose-keys`, `raw`, `validate`) that iterate entity
types must guard on `entities.clinical` — but they don't need changes in
this plan because they don't yet consume clinical data. This guard pattern
is exercised in PLAN-03 (prose keys) and PLAN-05 (pipeline).

## Verification

### Unit Tests (clinical-entities.test.js)

Build a minimal `ClinicalBlock` AST fixture (2 conditions, 1 site, 1 trial
with criteria), a people array with one manager matching the trial's PI ref,
an orgs array with one org, and a projects array.

1. **Condition entities** — correct IRI, empty `trials[]` back-link before
   relationship resolution.

2. **Site entities** — `org_ref` resolves to the org entity object.

3. **Trial entities** — `principal_investigator.person` is the resolved
   person entity. `conditions` and `sites` are ID arrays.

4. **Bidirectional relationships** — after generation, `condition.trials`
   contains the trial ID. `site.trials` contains the trial ID.

5. **Criteria entities** — one per trial, `trial_id` set correctly.

6. **Researcher entities** — at least one with `role: "principal_investigator"`
   and the correct trial ID.

7. **Error: unknown PI ref** — throws descriptive error when PI @ref doesn't
   match any person.

8. **Error: unknown condition ref** — throws when trial references a
   condition ID not in the clinical block.

9. **Null clinical block** — `buildClinicalEntities` is not called when
   `ast.clinical` is null. Full `story.dsl` still parses and generates
   entities without error.

### Smoke Test

```sh
cd libraries/libsyntheticgen && bun test
```

All existing tests pass. New tests cover the clinical entity generation.
