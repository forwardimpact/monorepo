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

Two run classes have different verdict authority. A run that cannot determine
its class performs the full sweep.

- **Full-sweep run** — the scheduled cadence, and any on-demand run asked to
  sweep. It always performs the per-package sweep. It never exits early.
- **Event-driven post-merge assessment** — it runs after a merge to decide
  whether that merge owes a cut. It may exit early with `NO-CUT-OWED`
  (Step 2).

## Checklists

<read_do_checklist goal="Load release policy and confirm CI green">

- [ ] Read **CONTRIBUTING.md § Releasing**. It may override the skill defaults.
- [ ] Run
      `gh run list --branch main --limit 5 --json name,conclusion,headBranch`.
- [ ] Confirm all recent workflows show `conclusion: success`.
- [ ] Repair trivial failures (format, lint, lock file) with the repository's
      auto-fix command on `main`. Commit and push the repairs.
- [ ] Confirm CI is green after the repairs. **Stop if failures persist.**
      Never release from a broken `main`.

</read_do_checklist>

<do_confirm_checklist goal="Verify releases were cut correctly before pushing">

- [ ] Assess each changed package for its version bump type.
- [ ] Confirm the repository's check command passes after all version bumps.
- [ ] Confirm each tag follows the `{prefix}@v{version}` convention.
- [ ] Push the tags one at a time. Never use `git push --tags`.
- [ ] Verify that a publish workflow triggered for each tag.
- [ ] Verify each publish-class issue against the publish outcome. Comment with
      the green run and the live artifact, or reopen the issue if the publish
      failed.

</do_confirm_checklist>

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Extract the prior release outcomes and any packages that had publish
failures.

### Step 1: Pre-Flight — Verify Main Branch CI

Run the READ-DO checklist above before you continue. Tag prefix mapping:
[`references/procedure.md`](references/procedure.md).

### Step 2: Classify — Sweep or Early Exit

This is the first assessment step after Pre-Flight. The per-package sweep
(Step 3 onward) runs unless this step records a `NO-CUT-OWED` early exit. Only
an event-driven post-merge assessment may exit. A full-sweep run always sweeps.
Any run that cannot determine its class also sweeps. Every verdict binds a SHA
pair (`range_from` = the baseline, `range_to` = `HEAD`). The verdict is a
claim about that range. It is never a claim about live `HEAD`.

`NO-CUT-OWED` requires all four conditions. When any fails, or any check is
in doubt, record `SWEEP-REQUIRED` and sweep:

1. **Verified-clean baseline.** A prior run record cites a commit that is an
   ancestor of `HEAD`. A run verified that the commit carries no unreleased
   work beyond re-cited blocks.
2. **Zero publishable paths.** No commit in the range touched a publishable
   path. Test each commit against the packer's own publish list.
3. **Standing set re-cited.** Every standing obligation is empty, re-cited
   as blocked, or resolved in-run to verified success.
4. **Main CI green.** Pre-Flight passed. The verdict record re-cites it.

The full conditions, doubt rules, and re-anchor bound are normative in
[references/early-exit.md](references/early-exit.md). Worked invocations live
in [references/early-exit-mechanics.md](references/early-exit-mechanics.md).

### Step 3: Enumerate Changed Packages

```sh
latest=$(git tag --sort=-creatordate --list "${prefix}@v*" | head -1)
[ -z "$latest" ] && git log --oneline -- "${directory}" \
  || git log "${latest}..HEAD" --oneline -- "${directory}"
```

Skip packages with no unreleased commits.

### Step 4: Determine Version Bumps

Read the version from `package.json`. Scan the commit log since the last tag.
**Pre-1.0** (`0.x.y`): **patch** for any change. **Post-1.0**: breaking (`!`) →
**major**, `feat` → **minor**, else → **patch**.

### Step 5: Bump, Sync, Verify

Run `npm version <patch|minor|major> --no-git-tag-version` in the package. Then
run the package manager's install command. Then run the repository's auto-fix
and check commands. For **major** bumps, first update the cross-workspace
dependents (grep `"@<scope>/<pkg>"`).

### Step 6: Commit and Tag

Commit all the bumps (`git commit`). Then tag each package
(`git tag <prefix>@v<version>`).

### Step 7: Push and Verify

Push the commit (`git push origin main`). Then push each tag one at a time
(`git push origin <prefix>@v<version>`). Never use `--tags`. Verify that the
publish workflows triggered (`gh run list`). On a failure, run
`gh run view <id> --log-failed`. Verify and re-cite any publish-class issue
(done = a live artifact) per [`procedure.md`](references/procedure.md).

### Step 8: Summary

Report a per-package table with the previous version, the new version, the tag,
and the publish status. [`procedure.md`](references/procedure.md) holds the
format.

## Memory: What to Record

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).

Append to the current week's log (see agent profile for the file path):

- **Packages assessed / releases cut** — the packages with unreleased changes.
  For each release record the previous version, the new version, the tag, and
  the publish status.
- **Publish failures** — the package and the reason (so the next run can
  revisit it).
- **Main branch CI state** — green or broken, and what you repaired.
- **Chainable state (every verdict kind).** Record it in the existing free-form
  skill surfaces (no new CSV columns), so the next assessment can chain. Every
  classification records its SHA pair (`range_from`, `range_to`), whatever the
  verdict. An early exit also records the range-check path summary. A
  verified-clean or post-cut verdict records that commit as the baseline. It
  also records each carried obligation with its blocking reference. A full
  sweep that ends due-but-deferred records no chainable baseline. Later
  assessments then sweep until a run reaches a verified-clean or post-cut
  state. An unclassifiable run records no SHA pair.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for the eligibility rule.

## Edge Cases

Release the foundational packages before their consumers. Check the
`package.json` dependencies before you tag. CONTRIBUTING.md § Releasing governs
the multi-package order. Confirm each tier before you tag the next one.
[`procedure.md`](references/procedure.md) covers the first release and the
failed publish. Related hazards are the non-zero first version, the credential
expiry, and the first-release dependency race with its new-dependency variant
([references/hazards.md](references/hazards.md)).

## Hazards

The letter is the stable identifier. Each fires-when and recovery resolves in
[references/hazards.md](references/hazards.md): (a) bump-noise stderr,
(b) first-release dependency race, (c) non-zero first version, (d) credential
expiry, (e) propagation lag, (f) JSDoc after auto-fix, (g) wiki budget
overage, (h) new library dependency of tagged consumers.
