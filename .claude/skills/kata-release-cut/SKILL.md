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

Two run classes, with different verdict authority (a run that cannot determine
its class performs the full sweep):

- **Full-sweep run** — the scheduled cadence, and any on-demand run asked to
  sweep. Always performs the per-package sweep; never early-exits.
- **Event-driven post-merge assessment** — runs after a merge to decide
  whether that merge owes a cut. May early-exit with `NO-CUT-OWED` (Step 2).

## Checklists

<read_do_checklist goal="Load release policy and confirm CI green">

- [ ] Read **CONTRIBUTING.md § Releasing**; it may override skill defaults.
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
- [ ] Publish-class issues verified against the publish outcome: comment citing
      the green run and live artifact, or reopened if the publish failed.

</do_confirm_checklist>

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Extract prior release
outcomes and any packages that had publish failures.

### Step 1: Pre-Flight — Verify Main Branch CI

Run the READ-DO checklist above before proceeding. Tag prefix mapping:
[`references/procedure.md`](references/procedure.md).

### Step 2: Classify — Sweep or Early Exit

The first assessment step after Pre-Flight: the per-package sweep (Step 3
onward) runs unless this step records a `NO-CUT-OWED` early exit. Only an
event-driven post-merge assessment may exit; a full-sweep run, or any run
that cannot determine its class, always sweeps. Every verdict binds a SHA
pair (`range_from` = the baseline, `range_to` = `HEAD`) — it is a claim
about that range, never about live `HEAD`.

`NO-CUT-OWED` requires all four conditions. When any fails, or any check is
in doubt, record `SWEEP-REQUIRED` and sweep:

1. **Verified-clean baseline.** A prior run record cites a commit, ancestor
   of `HEAD`, verified to carry no unreleased work beyond re-cited blocks.
2. **Zero publishable paths.** No commit in the range touched a publishable
   path, tested per commit against the packer's own publish list.
3. **Standing set re-cited.** Every standing obligation is empty, re-cited
   as blocked, or resolved in-run to verified success.
4. **Main CI green.** Pre-Flight passed, re-cited in the verdict record.

The full conditions, doubt rules, and re-anchor bound are normative in
[references/early-exit.md](references/early-exit.md); worked invocations in
[references/early-exit-mechanics.md](references/early-exit-mechanics.md).

### Step 3: Enumerate Changed Packages

```sh
latest=$(git tag --sort=-creatordate --list "${prefix}@v*" | head -1)
[ -z "$latest" ] && git log --oneline -- "${directory}" \
  || git log "${latest}..HEAD" --oneline -- "${directory}"
```

Skip packages with no unreleased commits.

### Step 4: Determine Version Bumps

Read the version from `package.json` and scan the commit log since the last tag.
**Pre-1.0** (`0.x.y`): **patch** for any change. **Post-1.0**: breaking (`!`) →
**major**, `feat` → **minor**, else → **patch**.

### Step 5: Bump, Sync, Verify

Run `npm version <patch|minor|major> --no-git-tag-version` in the package, then
the package manager's install and the repository's auto-fix and check commands.
For **major** bumps, first update cross-workspace dependents (grep
`"@<scope>/<pkg>"`).

### Step 6: Commit and Tag

Commit all bumps (`git commit`), then tag each package
(`git tag <prefix>@v<version>`).

### Step 7: Push and Verify

Push the commit (`git push origin main`), then each tag individually
(`git push origin <prefix>@v<version>`) — never `--tags`. Verify publish
workflows triggered (`gh run list`); on a failure,
`gh run view <id> --log-failed`. Verify and re-cite any publish-class issue
(done = a live artifact) per [`procedure.md`](references/procedure.md).

### Step 8: Summary

Report a per-package table — previous → new version, tag, publish status
([`procedure.md`](references/procedure.md) has the format).

## Memory: What to Record

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).

Append to the current week's log (see agent profile for the file path):

- **Packages assessed / releases cut** — packages with unreleased changes;
  per release the previous and new version, tag, and publish status.
- **Publish failures** — package and reason (so the next run can revisit).
- **Main branch CI state** — green or broken, and what was repaired.
- **Chainable state (every verdict kind).** Record in the existing free-form
  skill surfaces (no new CSV columns), so the next assessment can chain.
  Every classification records its SHA pair (`range_from`, `range_to`),
  whatever the verdict; an early exit also records the range-check path
  summary. A verified-clean or post-cut verdict records that commit as the
  baseline plus each carried obligation with its blocking reference. A full
  sweep that ends due-but-deferred records no chainable baseline, so later
  assessments keep sweeping until a run reaches a verified-clean or post-cut
  state. An unclassifiable run records no SHA pair.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for the eligibility rule.

## Edge Cases

Release foundational packages before consumers (check `package.json`
dependencies before tagging); CONTRIBUTING.md § Releasing governs multi-package
order — each tier confirmed before the next is tagged. First-release and
failed-publish handling: [`procedure.md`](references/procedure.md). Related
hazards: non-zero first version, credential expiry, and the first-release
dependency race with its new-dependency variant
([references/hazards.md](references/hazards.md)).

## Hazards

The letter is the stable identifier; each fires-when and recovery resolves in
[references/hazards.md](references/hazards.md): (a) bump-noise stderr,
(b) first-release dependency race, (c) non-zero first version, (d) credential
expiry, (e) propagation lag, (f) JSDoc after auto-fix, (g) wiki budget
overage, (h) new library dependency of tagged consumers.
