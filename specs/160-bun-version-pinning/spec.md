# 160 — Pin Bun Version in CI Workflows

**Status:** draft **Author:** security-engineer **Created:** 2026-03-31

## Problem

All 13 GitHub Actions workflows that use `oven-sh/setup-bun` specify
`bun-version: latest` instead of a pinned version. This means every CI run
installs whatever the newest Bun release is at that moment, introducing two
risks:

1. **Supply chain risk** — a compromised Bun release would immediately affect
   all CI workflows, including publish pipelines (`publish-npm.yml`,
   `publish-macos.yml`, `publish-skills.yml`) that produce artifacts shipped to
   users.

2. **Reproducibility risk** — builds are not reproducible across time. A test
   that passes today may fail tomorrow due to a Bun runtime change, and there is
   no way to bisect which Bun version introduced the regression.

The `setup-bun` action itself is correctly SHA-pinned, so the action code is
trusted. The risk is specifically in the Bun binary it downloads.

### Affected workflows

Every workflow file in `.github/workflows/` that references `setup-bun`:

- `check-quality.yml` (2 jobs)
- `check-security.yml`
- `check-test.yml` (2 jobs)
- `dependabot-triage.yml`
- `improvement-coach.yml`
- `product-backlog.yml`
- `publish-macos.yml`
- `publish-npm.yml`
- `release-readiness.yml`
- `release-review.yml`
- `security-audit.yml`
- `website.yaml`

### Why this needs a spec (not just a find-and-replace)

- The version must be kept in sync across all 13 workflows — a single source of
  truth is needed to avoid drift.
- Dependabot's `bun` ecosystem support may or may not update `bun-version`
  fields in workflow files — this needs investigation.
- The project currently uses `bun-version: latest` intentionally (to stay
  current with Bun's rapid release cadence). Pinning introduces a maintenance
  burden that must be addressed with an update strategy.
- The `CLAUDE.md` documents "Bun 1.2+" as the minimum — the pinned version must
  satisfy this constraint.

## Proposed Solution

### Option A: Centralized version in a reusable workflow

Create a reusable workflow (`.github/workflows/setup.yml`) that all other
workflows call. The Bun version is defined once in that file. Dependabot or a
scheduled job proposes updates to the single location.

**Pros:** Single source of truth, easy to update. **Cons:** Adds a workflow call
layer, may complicate job-level permissions.

### Option B: Pin in each workflow, Dependabot updates

Pin `bun-version` to a specific version (e.g., `1.2.15`) in every workflow file.
Rely on Dependabot's `github-actions` or `bun` ecosystem to propose updates.

**Pros:** Simple, no new infrastructure. **Cons:** 14 places to update (risk of
drift if Dependabot doesn't cover this).

### Option C: Pin via `.bun-version` file

Some `setup-bun` versions support reading from a `.bun-version` file in the repo
root. All workflows pick up the version from this file.

**Pros:** Single source of truth, works locally too. **Cons:** Requires
`setup-bun` support for this feature (needs verification).

### Recommendation

**Option C** if `setup-bun` supports `.bun-version` file reading, otherwise
**Option B** with a CI check that verifies all workflows use the same version.

## Success Criteria

- All workflows reference a specific Bun version (no `latest`)
- Publish workflows (`publish-npm.yml`, `publish-macos.yml`,
  `publish-skills.yml`) are reproducible
- An automated mechanism exists to propose Bun version updates
- No workflow version drift — all workflows use the same Bun version

## Security Impact

- **Risk reduction:** Eliminates auto-upgrade supply chain risk in publish
  pipelines
- **Blast radius:** If a pinned version has a vulnerability, all workflows are
  affected equally (same as today), but the upgrade is explicit and auditable
