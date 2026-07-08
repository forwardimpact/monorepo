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

Read `wiki/MEMORY.md`, then run `fit-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Extract prior release
outcomes and any packages that had publish failures.

### Step 1: Pre-Flight — Verify Main Branch CI

Run the READ-DO checklist above before proceeding. Tag prefix mapping:
[`references/procedure.md`](references/procedure.md).

### Step 2: Classify — Discriminator Predicate

The **first assessment step** after Pre-Flight; the per-package sweep
(Step 3 onward) runs **only** on `SWEEP-REQUIRED` or unclassifiable. The gate is
this step's position, not an ordering hint (mechanics:
[`references/early-exit.md`](references/early-exit.md)). A `NO-CUT-OWED` verdict
is a **four-conjunct** claim; any failure ⇒ `SWEEP-REQUIRED`:

1. **Verified-clean baseline `B`** — a commit cited by a prior run record,
   ancestor of `HEAD`, at which an assessment verified zero unreleased commits
   beyond what it re-cited as blocked. Set by a full sweep reaching that state,
   a post-cut state, or a chained earlier early-exit.
2. **Zero publishable paths over `B..HEAD`** by **per-commit union** (each
   commit's changed paths, not a net diff), in two tiers at the frozen
   `range_to`. *Directory rule:* a path under no publishable-package directory
   (from the workspace manifest) never defeats this. *Packlist membership*
   (in-directory paths only): non-publishable **iff** `private: true` or absent
   from the packer's own publish list. Four invariants:
   **any doubt classifies publishable** — tool error, unparseable output,
   `.npmignore` present, a path absent at `range_to`, or a change to a
   pack-manifest-influencing file (`package.json`/`.npmignore`/`.gitignore` at
   any level in the dir); failure mode is **forgone savings, never a missed
   cut**; a package with `prepack`/`prepare`/`prepublishOnly` is **excluded**
   (paths stay publishable); npm inclusion semantics are **not** re-implemented.
3. **Standing-set re-cite** — every standing obligation (first-release backlog,
   held/deferred cuts, pending publish-failure retries and publish-workflow
   verifications) is empty, re-cited as blocked with its reference, or
   verifiable-in-run and resolved to verified-success. A pending
   publish-workflow verification is **verifiable-in-run**: resolve it before
   exiting (`gh run list`) — success clears it; failure or still-in-progress is
   **due** ⇒ `SWEEP-REQUIRED`. Any due (unblocked) obligation defeats the exit.
4. **Main CI green** — the Pre-Flight checklist passed, re-cited so the verdict
   record stands alone.

Each classification binds the SHA pair (`range_from` = `B`, `range_to` = `HEAD`
here); the verdict is a claim about that pair, never live `HEAD`.

#### Authority boundary

- **Who may exit.** Only an event-driven post-merge assessment; full-sweep runs
  always sweep.
- **Unclassifiable ⇒ sweep.** A run that cannot determine its class or resolve
  an unambiguous valid baseline records the unresolvable state and sweeps. On a
  shallow checkout where `B` is below the fetch boundary the ancestry check is
  unresolvable: deepen to reach `B`, else sweep.
- **Re-anchor bound.** The chain must re-anchor to a real per-package sweep (any
  run class) at least once per scheduled cadence interval; cadence-less
  consumers use a default **maximum chain length of 20 early-exits**. A chain
  past the bound is unresolvable ⇒ full sweep. The bound caps drift to
  commit-accumulation only; publish-failure recovery stays record-dependent (see
  [`references/early-exit.md`](references/early-exit.md)).

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
- **Chainable state (every verdict kind).** Into the existing free-form skill
  surfaces (no new CSV columns), so any consuming repository can chain:
  every classification records its SHA pair (`range_from`, `range_to`),
  `NO-CUT-OWED` and `SWEEP-REQUIRED` alike; an early-exit also records the
  range-check path summary. A verified-clean or post-cut verdict records that
  commit as `B` plus each carry re-cite with its blocking reference. A
  full-sweep ending **due-but-deferred** records **no chainable baseline**;
  later assessments full-sweep until a run reaches a verified-clean/post-cut
  state. An unclassifiable run records no SHA pair.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for the eligibility rule.

## Edge Cases

Release foundational packages before consumers (check `package.json`
dependencies before tagging); CONTRIBUTING.md § Releasing governs multi-package
order — each tier confirmed before the next is tagged. First-release and
failed-publish handling: [`procedure.md`](references/procedure.md). Related
hazards: (c), (d), (b)/(h).

## Hazards

The letter is the stable identifier; each fires-when and recovery resolves in
[references/hazards.md](references/hazards.md): (a) bump-noise stderr,
(b) first-release dependency race, (c) non-zero first version, (d) credential
expiry, (e) propagation lag, (f) JSDoc after auto-fix, (g) wiki budget
overage, (h) new library dependency of tagged consumers.
