---
name: kata-release-cut
description: >
  Cut new versions of packages with unreleased changes on main. Determine
  version bumps, update package.json files, tag releases, push tags, and verify
  publish workflows. Canonical source for the release procedure.
---

# Release Cut

Assess `main` branch CI status, identify packages with unreleased changes,
determine version bumps, and cut releases.

## When to Use

- Scheduled weekly to cut releases for changed packages
- On-demand when a release is needed outside the regular cadence

## Checklists

<read_do_checklist goal="Confirm CI is green before cutting releases">

- [ ] Ran
      `gh run list --branch main --limit 5 --json name,conclusion,headBranch`.
- [ ] All recent workflows show `conclusion: success`.
- [ ] Trivial failures (format, lint, lock file) repaired via the
      repository's auto-fix command on `main`, committed, and pushed.
- [ ] CI confirmed green after repairs. **Stop if failures persist** — never
      release from a broken `main`.

</read_do_checklist>

<do_confirm_checklist goal="Verify releases were cut correctly before pushing">

- [ ] Each changed package assessed for version bump type.
- [ ] The repository's check command passes after all version bumps.
- [ ] Each tag follows `{prefix}@v{version}` convention.
- [ ] Tags pushed individually — never `git push --tags`.
- [ ] Publish workflows verified as triggered for each tag.
- [ ] Publish-class issues closed by the released changes verified against the
      publish outcome: verification comment posted citing the green publish run
      and the live artifact — issue reopened if the publish failed.

</do_confirm_checklist>

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot --agent <self>` (per [Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#on-boot-read-set)). The boot digest's `owned_priorities`, `claims`, and (when this skill reads Tier-2 surfaces) `storyboard_items` seed the rest of this skill's Process. Extract previous release outcomes and any packages that
had publish failures from prior entries.

### Step 1: Pre-Flight — Verify Main Branch CI

Run the READ-DO checklist above before proceeding. Worked examples:

```sh
gh run list --branch main --limit 5 --json name,conclusion,headBranch
```

```sh
git checkout main && git pull origin main
# Run the repository's auto-fix command, then its check command (must pass)
git add <fixed-files> && git commit -m "chore: fix formatting on main"
git push origin main
```

### Tag Prefix Mapping

| Directory          | Tag prefix | Example tag       |
| ------------------ | ---------- | ----------------- |
| `libraries/libfoo` | `libfoo`   | `libfoo@v0.1.5`   |
| `products/foo`     | `foo`      | `foo@v0.25.0`     |
| `services/bar`     | `svcbar`   | `svcbar@v0.1.110` |

### Version Rules

- **Pre-1.0** (`0.x.y`) — bump **patch** for any change
- **Post-1.0** — breaking (`!` suffix) → **major**; `feat` → **minor**; else →
  **patch**

### Step 2: Enumerate Changed Packages

```sh
latest=$(git tag --sort=-creatordate --list "${prefix}@v*" | head -1)
if [ -z "$latest" ]; then
  git log --oneline -- "${directory}"
else
  git log "${latest}..HEAD" --oneline -- "${directory}"
fi
```

Skip packages with no unreleased commits.

### Step 3: Determine Version Bumps

Read current version from `package.json` and scan commit log since last tag.
Apply version rules above.

### Step 4: Bump, Sync, Verify

```sh
cd <package-directory>
npm version patch --no-git-tag-version   # or minor/major
```

For **major** bumps, update cross-workspace dependents:

```sh
grep -r '"@<scope>/<pkg>"' --include=package.json -l
```

Then re-run the package manager's install and the repository's auto-fix and
check commands.

### Step 5: Commit and Tag

```sh
git add <package>/package.json <lockfile>
git commit -m "chore(<pkg>): bump to <version>"
git tag <prefix>@v<version>
```

For multiple packages: commit all bumps, then tag each.

### Step 6: Push and Verify

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

A publish-class issue — one whose definition of done is a live artifact, not a
merged fix — auto-closes when its fix PR merges, before the publish outcome
exists. After verifying the publish, post a verification comment on each such
issue citing the green publish run and the live artifact; it stays closed only
with that comment. If the publish failed, reopen the issue.

### Step 7: Summary

```
| Package  | Previous | New    | Tag             | Publish |
| -------- | -------- | ------ | --------------- | ------- |
| libskill | 4.0.3    | 4.0.4  | libskill@v4.0.4 | ✓       |
```

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Packages assessed** — Which packages had unreleased changes
- **Releases cut** — Package name, previous version, new version, tag, publish
  status
- **Publish failures** — Package and reason (so the next run can revisit)
- **Main branch CI state** — Green or broken, and what was repaired
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Edge Cases

- **First release**: Skip packages with version `0.0.0` or `"private": true`.
- **Failed publish**: Don't delete the tag. Fix, bump patch, re-tag.
- **Dependency chain**: Release foundational packages before consumers —
  check `package.json` dependencies before tagging.
