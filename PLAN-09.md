# PLAN-09: Synthea Operationalization

> Make the Synthea tool operational so `fit-terrain generate` produces
> patient data from the `trial_patients` dataset. Add a `just` recipe
> for download/install (following the TEI pattern), a Java availability
> check, and clinical-aware FHIR post-processing that filters output to
> condition-matched patients.

## Dependencies

- **PLAN-06** — Dataset parser supports `conditions` field and resolves
  condition IDs to Synthea modules at generation time.

## Dependency Graph

```
PLAN-06 → PLAN-09 → PLAN-07 (story.dsl exercises the full path)
```

## Files to Modify

| File | Change |
|------|--------|
| `justfile` | New `synthea-install` and `synthea-status` recipes |
| `.gitignore` | Ignore `vendor/synthea/` directory |
| `libraries/libterrain/src/cli-helpers.js` | Default `SYNTHEA_JAR` to `vendor/synthea/synthea-with-dependencies.jar` |
| `libraries/libsyntheticgen/src/tools/synthea.js` | Add `filterByConditions()` post-processing step |

## Steps

### 1. Justfile: synthea-install Recipe

Add a `Synthea` section after the TEI section, following the same
install/start pattern:

```just
# ── Synthea ──────────────────────────────────────────────────────

# Synthea release to download
synthea_version := "3.3.0"
synthea_jar := "vendor/synthea/synthea-with-dependencies.jar"

# Download Synthea JAR (one-time)
synthea-install:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f "{{synthea_jar}}" ]; then
        echo "synthea: already installed at {{synthea_jar}}"
        exit 0
    fi
    mkdir -p vendor/synthea
    echo "Downloading Synthea v{{synthea_version}}..."
    curl -fSL -o "{{synthea_jar}}" \
        "https://github.com/synthetichealth/synthea/releases/download/v{{synthea_version}}/synthea-with-dependencies.jar"
    echo "synthea: installed at {{synthea_jar}}"

# Check Synthea availability
synthea-status:
    #!/usr/bin/env bash
    if [ ! -f "{{synthea_jar}}" ]; then
        echo "synthea: not installed (run 'just synthea-install')"
        exit 1
    fi
    if ! command -v java &>/dev/null; then
        echo "synthea: Java not found (install Java 11+)"
        exit 1
    fi
    java_version=$(java -version 2>&1 | head -1)
    echo "synthea: ok (${java_version})"
```

The `vendor/synthea/` directory follows the convention of vendored
binary dependencies — downloaded on demand, not checked in.

### 2. Gitignore: vendor/synthea/

Add to `.gitignore`:

```
vendor/synthea/
```

### 3. Default SYNTHEA_JAR Path

In `cli-helpers.js:114-115`, update the default path to match the
justfile convention:

```javascript
syntheaJar:
  process.env.SYNTHEA_JAR || "vendor/synthea/synthea-with-dependencies.jar",
```

This means `just synthea-install && bun run fit-terrain generate` works
without setting any environment variables. The `SYNTHEA_JAR` env var
remains as an override for CI or non-standard layouts.

### 4. SyntheaTool: checkAvailability Error Message

Update the error message in `synthea.js:37-42` to reference the new
install path:

```javascript
throw new Error(
  `Synthea requires Java and ${this.syntheaJar}. ` +
    "Run 'just synthea-install' to download the JAR, " +
    "or set SYNTHEA_JAR to a custom path.",
);
```

### 5. SyntheaTool: filterByConditions Post-Processing

After Synthea generates FHIR bundles and flattens them by resource type,
add a filtering step that keeps only patients whose conditions overlap
with the clinical block's condition set.

The `config.modules` array (populated by PLAN-06's resolution step)
tells Synthea which modules to run. Synthea generates patients that
may or may not exhibit the target conditions — the modules bias the
population but don't guarantee every patient has the condition. The
filter ensures the output dataset is clinically relevant.

Add after the `byType` flattening loop (synthea.js:93-101):

```javascript
if (config.conditions?.length) {
  const patientType = byType.get("Patient");
  const conditionType = byType.get("Condition");
  if (patientType && conditionType) {
    const matchedPatientIds = new Set();
    for (const cond of conditionType) {
      if (cond.code?.coding?.some(c =>
        config.conditions.includes(c.code) ||
        config.conditions.includes(c.display?.toLowerCase().replace(/\s+/g, "_"))
      )) {
        const ref = cond.subject?.reference;
        if (ref) matchedPatientIds.add(ref.replace("urn:uuid:", ""));
      }
    }
    if (matchedPatientIds.size > 0) {
      for (const [type, records] of byType) {
        byType.set(type, records.filter(r => {
          const id = r.id || r.subject?.reference?.replace("urn:uuid:", "");
          return !id || matchedPatientIds.has(id);
        }));
      }
      this.logger.info(
        "synthea",
        `Filtered to ${matchedPatientIds.size} patients matching clinical conditions`,
      );
    }
  }
}
```

This filtering is best-effort — it matches on FHIR `Condition.code`
coding values against the condition IDs from the DSL. Synthea's FHIR
output uses SNOMED codes, not ICD-10, so the match is by display name
normalized to the DSL identifier convention (lowercase, underscored).
Unmatched patients are kept if no condition resources exist (graceful
degradation).

### 6. Config Passthrough for conditions

The `generate(config)` method already receives `config.modules` from
PLAN-06's resolution step. Add `config.conditions` passthrough so the
filter in step 5 has access to the original condition IDs.

In PLAN-06's resolution step (nodes.js `generateDatasets()`), keep the
original `conditions` array on the config alongside the resolved
`modules`:

```javascript
if (ds.config.conditions && clinical) {
  ds.config.modules = ds.config.conditions
    .map(condId => clinical.conditions.find(c => c.id === condId)?.synthea_module)
    .filter(Boolean);
  // conditions array already on ds.config — no change needed
}
```

No change needed — `ds.config.conditions` is already present from the
parser (PLAN-06 step 1). The `generate(config)` spread passes it
through.

## Verification

### Justfile Tests

1. **synthea-install** — downloads the JAR to `vendor/synthea/`. Second
   run is a no-op ("already installed").

2. **synthea-status** — reports Java version and JAR presence. Fails
   clearly when either is missing.

### Unit Tests (extend synthea.test.js)

3. **checkAvailability** — error message references `just synthea-install`.

4. **generate with modules** — mock `execFileFn` verifies `-m` flags
   are passed for each module.

5. **filterByConditions** — given mock FHIR bundles with 5 patients
   (3 matching target conditions, 2 not), the output Patient dataset
   contains 3 records. Non-Patient resource types are also filtered
   to matching patients.

6. **No conditions** — when `config.conditions` is absent, no filtering
   occurs. All patients are returned.

7. **Empty FHIR output** — when Synthea produces no bundles (e.g. zero
   population), the tool returns empty datasets without error.

### Integration Smoke Test (after PLAN-07)

```sh
just synthea-install
bun run fit-terrain generate --mode no-prose
ls output/
```

Verify `trial_patients` datasets are generated (not silently skipped).

### CI Consideration

The Synthea JAR is ~40MB. For CI, either:
- Cache `vendor/synthea/` between runs (GitHub Actions cache key on
  `synthea_version`).
- Skip Synthea tests when `SYNTHEA_JAR` is unset (the existing
  `checkAvailability` → skip pattern in `generateDatasets()` handles
  this already).

The pipeline already gracefully skips unavailable tools
(`generateDatasets()` catches `checkAvailability` errors at
nodes.js:260-266), so CI without Java/Synthea still passes — it just
produces no patient data.
