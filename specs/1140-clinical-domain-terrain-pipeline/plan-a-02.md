# 1140 Part 02 — Clinical Entity Generator

Produce five new entity types from the `ClinicalBlock` AST node and place them
under `entities.clinical` — a new domain-scoped namespace in the entity graph.

## Goal

`buildClinicalEntities()` takes the parsed `ClinicalBlock`, resolved people,
orgs, and projects, and returns `entities.clinical` with conditions, sites,
trials, criteria, and researchers — all with bidirectional relationships and
cross-domain reference resolution.

## Files

| Action | Path |
|--------|------|
| Modified | `libraries/libsyntheticgen/src/engine/tier0.js` |
| Created | `libraries/libsyntheticgen/src/engine/clinical-entities.js` |
| Created | `libraries/libsyntheticgen/test/clinical-entities.test.js` |

## Steps

### Step 1 — Create clinical-entities.js

Export
`buildClinicalEntities(clinicalAst, people, orgs, projects, domain, rng)`.

**Phase 1 — Direct mapping:** Map AST `conditions[]`, `sites[]`, `trials[]` to
entity objects with IRIs (`https://${domain}/id/clinical/{type}/${id}`). Extract
`criteria[]` from each trial's `criteria` block as `ClinicalCriterionEntity`
with `trial_id`.

**Phase 2 — Cross-domain reference resolution:**

- `trial.principal_investigator` `@ref` → resolve against `people[]` by manager
  alias. Error if no match:
  `"trial 'oncora_phase3' references unknown PI '@thoth'"`.
- `trial.project_ref` → resolve against `projects[]` by ID. Optional (null if
  absent).
- `site.org_ref` → resolve against `orgs[]` by ID.

**Phase 3 — Bidirectional relationships:**

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

**Phase 4 — Researcher generation:** Resolve each trial's
`principal_investigator` against people → `ClinicalResearcherEntity` with
`role: "principal_investigator"`. Select additional co-investigators from
clinical-adjacent teams using the seeded RNG. Each researcher appears once;
`trial_ids` accumulates.

**Phase 5 — Enrollment interpolation (optional):** If `snapshots` exist,
interpolate enrollment between `start_date` and `estimated_end_date` with ±5-10%
noise from seeded RNG. Store as `trial.enrollment_snapshots`.

**Verify:** `bun test` in `libsyntheticgen`.

### Step 2 — Wire into tier0.js

In `EntityGenerator.generate()` (`tier0.js:31-54`), after `buildEntities()`:

```javascript
const clinical = ast.clinical
  ? buildClinicalEntities(ast.clinical, people, orgs, projects, ast.domain, rng)
  : null;

return {
  // ... existing fields ...
  clinical,
};
```

**Verify:** Parse and generate entities from the current `story.dsl` (no
clinical block) — `entities.clinical` is `null`, all existing tests pass.

### Step 3 — Tests

Build a minimal `ClinicalBlock` AST fixture (2 conditions, 1 site, 1 trial with
criteria), a people array with one manager matching the PI ref, an orgs array,
and a projects array.

- Condition entities — correct IRI, empty `trials[]` before relationship
  resolution.
- Site entities — `org_ref` resolves to the org entity.
- Trial entities — `principal_investigator.person` is the resolved person.
  `conditions` and `sites` are ID arrays.
- Bidirectional relationships — `condition.trials` contains the trial ID after
  generation. `site.trials` contains the trial ID.
- Criteria entities — one per trial, `trial_id` set correctly.
- Researcher entities — at least one with `role: "principal_investigator"` and
  correct trial ID.
- Error: unknown PI ref — throws descriptive error.
- Error: unknown condition ref — throws when trial references a condition not in
  the clinical block.
- Null clinical block — `ast.clinical === null` → `entities.clinical === null`.

## Blast Radius

Created: `clinical-entities.js`, `clinical-entities.test.js`. Modified:
`tier0.js`.

## Verification

```sh
cd libraries/libsyntheticgen && bun test
```
