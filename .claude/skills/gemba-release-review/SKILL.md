---
name: gemba-release-review
description: >
  Review the main branch for unreleased changes and cut new versions. Determine
  version bumps, update package.json files, tag releases, push tags, and verify
  publish workflows. Canonical source for the release procedure. Use when
  cutting a release, checking for unreleased changes, or running the scheduled
  weekly release cycle.
---

# Release Review

Assess `main` branch CI status, identify packages with unreleased changes,
determine version bumps, and cut releases.

## When to Use

- Scheduled weekly to cut releases for changed packages
- On-demand when a release is needed outside the regular cadence

## Prerequisites

See [`gemba-gh-cli`](../gemba-gh-cli/SKILL.md) for `gh` installation and the
canonical query shapes used in the steps below.

## Process

### Step 0: Read Memory

Read memory per the agent profile (your summary, the current week's log, and
teammates' summaries). Extract previous release outcomes and any packages that
had publish failures from prior `release-engineer` entries.

## Pre-Flight: Verify Main Branch CI

<read_do_checklist goal="Verify main branch CI before releasing">

- [ ] Ran
      `gh run list --branch main --limit 5 --json name,conclusion,headBranch`.
- [ ] All recent workflows show `conclusion: success`.
- [ ] If any are failing due to trivial issues (formatting, lint, lock file
      drift), repaired via `bun run check:fix` on `main`, committed, and pushed.
- [ ] Waited for CI to confirm green. If failures persist after `check:fix`,
      **stop** — do not release from a broken `main`.

</read_do_checklist>

Worked examples:

```sh
gh run list --branch main --limit 5 --json name,conclusion,headBranch
```

```sh
git checkout main && git pull origin main
bun run check:fix
bun run check            # Must pass
git add <fixed-files> && git commit -m "chore: fix formatting on main"
git push origin main
```

## Tag Prefix Mapping

| Directory          | Tag prefix | Example tag         |
| ------------------ | ---------- | ------------------- |
| `libraries/libfoo` | `libfoo`   | `libfoo@v0.1.5`     |
| `products/pathway` | `pathway`  | `pathway@v0.25.0`   |
| `services/agent`   | `svcagent` | `svcagent@v0.1.110` |

## Version Rules

- **Pre-1.0** (`0.x.y`): bump **patch** for any change
- **Post-1.0**: breaking (`!` suffix) → **major**; `feat` → **minor**; else →
  **patch**

## Process

### Step 1: Enumerate Changed Packages

```sh
latest=$(git tag --sort=-creatordate --list "${prefix}@v*" | head -1)
if [ -z "$latest" ]; then
  git log --oneline -- "${directory}"
else
  git log "${latest}..HEAD" --oneline -- "${directory}"
fi
```

Skip packages with no unreleased commits.

### Step 2: Determine Version Bumps

Read current version from `package.json` and scan commit log since last tag.
Apply version rules above.

### Step 3: Bump, Sync, Verify

```sh
cd <package-directory>
npm version patch --no-git-tag-version   # or minor/major
```

For **major** bumps, update cross-workspace dependents:

```sh
grep -r '"@forwardimpact/<pkg>"' --include=package.json -l
```

Then sync and verify:

```sh
bun install
bun run check:fix && bun run check
```

### Step 4: Commit and Tag

```sh
git add <package>/package.json package-lock.json
git commit -m "chore(<pkg>): bump to <version>"
git tag <prefix>@v<version>
```

For multiple packages: commit all bumps, then tag each.

### Step 5: Push and Verify

Push commit first, then each tag individually:

```sh
git push origin main
git push origin <prefix>@v<version>    # one per package — never --tags
```

Verify publish workflows triggered:

```sh
gh run list --limit 10 --json name,conclusion,headBranch,event
```

If a publish fails, investigate with `gh run view <run-id> --log-failed`.

### Step 6: Summary

```
| Package  | Previous | New    | Tag             | Publish |
| -------- | -------- | ------ | --------------- | ------- |
| libskill | 4.0.3    | 4.0.4  | libskill@v4.0.4 | ✓       |
```

### Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Packages assessed** — Which packages had unreleased changes
- **Releases cut** — Package name, previous version, new version, tag, publish
  status
- **Publish failures** — Package and reason (so the next run can revisit)
- **Main branch CI state** — Green or broken, and what was repaired

## Edge Cases

- **First release**: Skip packages with version `0.0.0` or `"private": true`.
- **Failed publish**: Don't delete the tag. Fix, bump patch, re-tag.
- **Dependency chain**: Release foundational packages before consumers — for
  example, `map` and `libskill` must be released before `pathway` (which depends
  on both). Check `package.json` dependencies before tagging.
