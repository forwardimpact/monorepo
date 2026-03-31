---
name: release-review
description: >
  Review the main branch for unreleased changes and cut new versions. Determine
  version bumps, update package.json files, tag releases, push tags, and verify
  publish workflows. Canonical source for the release procedure.
---

# Release Review

Assess the `main` branch CI status, identify packages with unreleased changes,
determine version bumps, and cut releases.

## When to Use

- Scheduled weekly to cut releases for changed packages
- On-demand when a release is needed outside the regular cadence
- After a batch of PRs has been merged and CI is green

## Prerequisites

The `gh` CLI must be installed and authenticated. See the `gh-cli` skill for
installation instructions. Verify with:

```sh
gh auth status
```

## Pre-Flight: Verify Main Branch CI

Before any release work, confirm `main` is green:

```sh
gh run list --branch main --limit 5 --json name,conclusion,headBranch
```

All recent workflow runs (Quality, Test, Security) must show
`conclusion: success`. If any are failing, attempt to repair trivial failures
before giving up — see § Repair Trivial CI Failures on Main below. If failures
persist after the repair attempt, **stop** — do not release from a broken
`main`. Report the remaining failures and exit.

### Repair Trivial CI Failures on Main

When a workflow fails due to formatting, lint, or lock file drift — issues that
`bun run check:fix` can resolve — fix them directly on `main`. The release
engineer is the **only** agent allowed to push directly to `main`, and only for
these mechanical fixes that would otherwise block every PR and release.

```sh
git checkout main
git pull origin main
bun run check:fix
bun run check            # Verify the fix resolves all failures
```

If `bun run check` passes after the fix:

```sh
git add <fixed-files>
git commit -m "chore: fix formatting on main"
git push origin main
```

Wait for CI to re-run and confirm green before proceeding with the release.

If `bun run check` still fails after `check:fix`, the failure is not trivial —
**stop** and report the failures. Do not attempt code-level fixes on `main`.

## Tag Prefix Mapping

Tag prefix matches the directory name, not the npm scope. Services use an `svc`
prefix.

| Directory          | Tag prefix | Example tag         |
| ------------------ | ---------- | ------------------- |
| `libraries/libfoo` | `libfoo`   | `libfoo@v0.1.5`     |
| `products/pathway` | `pathway`  | `pathway@v0.25.0`   |
| `services/agent`   | `svcagent` | `svcagent@v0.1.110` |

## Version Rules

- **Pre-1.0 packages** (`0.x.y`): bump **patch** for any change
- **Post-1.0 packages**: use semantic versioning
  - Breaking changes (`feat!`, `refactor!`, or any `!` suffix) → **major**
  - New features (`feat`) → **minor**
  - Fixes, refactors, chores, docs → **patch**

## Process

### Step 1: Enumerate Changed Packages

For each package in the monorepo, check for unreleased commits:

```sh
# Get the latest tag for this package
latest=$(git tag --sort=-creatordate --list "${prefix}@v*" | head -1)

# If no tag exists, this package has never been released — check if it has
# a package.json with version > 0.0.0, then treat all commits as unreleased
if [ -z "$latest" ]; then
  git log --oneline -- "${directory}"
else
  git log "${latest}..HEAD" --oneline -- "${directory}"
fi
```

Skip packages with no unreleased commits. Collect the list of packages that need
a release along with their commit summaries.

### Step 2: Determine Version Bumps

For each changed package, read the current version from `package.json` and the
commit log since the last tag:

- If the current version is `0.x.y` (pre-1.0): always bump **patch**
- If the current version is `≥ 1.0.0`:
  - Scan commit messages for breaking change indicators (`!` after scope) → bump
    **major**
  - Scan for `feat` commits → bump **minor**
  - Otherwise → bump **patch**

### Step 3: Bump Package Versions

Edit the `version` field in each changed package's `package.json`:

```sh
# Example: bump from 0.1.5 to 0.1.6
cd <package-directory>
npm version patch --no-git-tag-version
```

Or for minor/major:

```sh
npm version minor --no-git-tag-version
npm version major --no-git-tag-version
```

### Step 4: Update Cross-Workspace Dependencies

When bumping a **major** version of a package, check if other packages in the
monorepo depend on it and update their version ranges:

```sh
# Find dependents
grep -r '"@forwardimpact/<pkg>"' --include=package.json -l
```

Update the range (e.g. `^3.0.0` → `^4.0.0`) in each dependent's `package.json`.

### Step 5: Sync Lock File

```sh
bun install
```

### Step 6: Verify Quality

```sh
bun run check:fix    # Auto-fix formatting and lint
bun run check        # Full validation — must pass cleanly
```

If `bun run check` fails, diagnose and fix. Do not release with failing checks.

### Step 7: Commit Version Bumps

For a single package:

```sh
git add <package>/package.json package-lock.json
git commit -m "chore(<pkg>): bump to <version>"
```

For multiple packages in one release:

```sh
git add */package.json package-lock.json
git commit -m "chore: bump versions for release"
```

### Step 8: Tag Each Package

Create one tag per released package, all pointing at the version bump commit:

```sh
git tag <prefix>@v<version>
# Example: git tag libskill@v4.0.4
```

### Step 9: Push

Push the commit first, then push each tag individually:

```sh
git push origin main
```

Then for each tag:

```sh
git push origin <prefix>@v<version>
```

Never use `git push --tags` — push each tag individually to ensure publish
workflows trigger correctly.

### Step 10: Verify Publish Workflows

After pushing tags, confirm the publish workflows were triggered:

```sh
gh run list --limit 10 --json name,conclusion,headBranch,event
```

Each pushed tag should trigger the `Publish Package` workflow. For `basecamp`
tags, the `Publish macOS` workflow should also trigger.

Wait for workflows to complete and verify they succeed. If a publish fails,
investigate the logs:

```sh
gh run view <run-id> --log-failed
```

### Step 11: Summary

Produce a release summary:

```
## Release Summary — YYYY-MM-DD

| Package   | Previous   | New        | Tag              | Publish |
| --------- | ---------- | ---------- | ---------------- | ------- |
| libskill  | 4.0.3      | 4.0.4      | libskill@v4.0.4  | ✓       |
| pathway   | 0.25.5     | 0.25.6     | pathway@v0.25.6  | ✓       |
| svcagent  | 0.1.110    | 0.1.111    | svcagent@v0.1.111| ✓       |

Packages with no changes since last release: (list)
```

## Handling Edge Cases

### First Release

If a package has no existing tags, check its `package.json` version. If the
version is `0.0.0` or the package has `"private": true`, skip it. Otherwise, tag
the current version and push.

### Failed Publish

If a publish workflow fails after tagging:

1. Do **not** delete the tag
2. Investigate the workflow logs
3. Fix the issue (usually a test or audit failure)
4. Push the fix to `main`
5. Create a new patch version bump and tag

### Dependency Chain Releases

When releasing packages with dependencies (see CLAUDE.md § Dependency Chain),
release in dependency order:

1. `map` (data)
2. `libskill` (derivation)
3. `pathway`, `summit` (consumers)

Tag and push in this order to ensure publish workflows can resolve workspace
dependencies.
