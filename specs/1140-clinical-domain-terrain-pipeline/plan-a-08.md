# 1140 Part 08 — Synthea Operationalization

Make the Synthea tool operational so `fit-terrain generate` produces patient
data from the `trial_patients` dataset. Add a `just` recipe for
download/install, a Java availability check, and clinical-aware FHIR
post-processing.

## Goal

`just synthea-install` downloads the Synthea JAR. `fit-terrain generate`
produces patient data filtered to condition-matched patients. The pipeline
gracefully skips when Java or the JAR is unavailable.

## Files

| Action | Path |
|--------|------|
| Modified | `justfile` |
| Modified | `.gitignore` |
| Modified | `libraries/libterrain/src/cli-helpers.js` |
| Modified | `libraries/libsyntheticgen/src/tools/synthea.js` |

## Steps

### Step 1 — Justfile: synthea-install and synthea-status

Add a `Synthea` section after the TEI section:

```just
synthea_version := "3.3.0"
synthea_jar := "vendor/synthea/synthea-with-dependencies.jar"

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

**Verify:** `just synthea-install` downloads the JAR. Second run is a no-op.

### Step 2 — Gitignore

Add `vendor/synthea/` to `.gitignore`.

**Verify:** `git status` does not show `vendor/synthea/` after install.

### Step 3 — Default SYNTHEA_JAR path

In `cli-helpers.js:114-115`:

```javascript
syntheaJar: process.env.SYNTHEA_JAR || "vendor/synthea/synthea-with-dependencies.jar",
```

**Verify:** `just synthea-install && bun run fit-terrain generate` works without
env vars.

### Step 4 — Error message update

In `synthea.js:37-42`, update the error to reference `just synthea-install`:

```javascript
throw new Error(
  `Synthea requires Java and ${this.syntheaJar}. ` +
    "Run 'just synthea-install' to download the JAR, " +
    "or set SYNTHEA_JAR to a custom path.",
);
```

**Verify:** Error message is actionable when JAR is missing.

### Step 5 — filterByConditions post-processing

After Synthea generates FHIR bundles and flattens by resource type
(`synthea.js:93-101`), add filtering that keeps only patients whose FHIR
Condition resources match the clinical condition IDs:

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
    }
  }
}
```

Matches by FHIR `Condition.code` display name normalized to DSL convention
(lowercase, underscored). Unmatched patients kept if no condition resources
exist.

**Verify:** `bun test` in `libsyntheticgen`.

### Step 6 — Tests

- `just synthea-install` — downloads JAR. Second run is no-op.
- `just synthea-status` — reports Java version and JAR presence.
- `checkAvailability` error — references `just synthea-install`.
- `generate` with modules — mock `execFileFn` verifies `-m` flags.
- `filterByConditions` — 5 patients, 3 matching → output has 3.
- No conditions — no filtering, all patients returned.
- Empty FHIR output — returns empty datasets without error.

## Blast Radius

Modified: `justfile`, `.gitignore`, `cli-helpers.js`, `synthea.js`.

## Verification

```sh
just synthea-status
cd libraries/libsyntheticgen && bun test
```
