# Early-exit mechanics

Worked detail for the Step 2 discriminator predicate — the invocations and
examples only; the normative rule lives in SKILL.md § Step 2. Generic
placeholders: substitute the real directory, prefix, and SHAs at run time.

## Per-commit union walk (condition 2)

Condition 2 tests the **union of paths changed by each commit** in the bound
range, not a net diff. Use:

```sh
git log --no-merges --name-only --format='' "${range_from}..${range_to}" \
  | sort -u
```

The union of this output must remain a **superset** of every per-directory log
the sweep would run (`git log "${latest}..HEAD" -- "${directory}"`, Step 3).
Two traversal hazards:

- **Net diff is unsound.** `git diff range_from..range_to` collapses an
  add-then-revert pair inside the range to nothing, so a file that was edited
  and reverted across two commits would escape the test. The per-commit walk
  sees both commits.
- **No `--first-parent`.** `--first-parent` prunes side-branch commits that a
  merge brought in; the per-directory sweep counts those commits, so omitting
  side-branch commits could yield a false `NO-CUT-OWED`. Walk every non-merge
  commit. If any traversal cannot be shown a superset of the sweep's
  path-scoped log, the run is unclassifiable ⇒ full sweep.

The workspace manifest (the publishable-directory set) is read at `range_to`,
never at `range_from`: a manifest change inside the range must not narrow the
set. A brand-new package directory appearing in the range therefore sits under
a publishable directory at `range_to`, reaches the packlist tier, and — absent
from any prior publish list — classifies publishable ⇒ `SWEEP-REQUIRED`.

## Packlist membership (condition 2, tier 2)

Runs **only** on paths that already passed the directory tier, so the modal
zero-surface range (docs, wiki, skills) never invokes it — cost stays seconds
and ~zero tokens. Read the packer's publish list at the frozen `range_to`. Pin
a throwaway worktree so the live checkout is not mutated:

```sh
git worktree add --detach /tmp/rc-pin "${range_to}"
( cd /tmp/rc-pin/"${directory}" && npm pack --dry-run --json --ignore-scripts )
git worktree remove /tmp/rc-pin
```

Parse the JSON `files[].path` array — that is the authoritative publish list.
A path under the directory is **non-publishable iff** the package is
`private: true` or the path is absent from that list. Do not re-implement npm
inclusion semantics; the packer's list is the source of truth.

Route each doubt class to publishable (⇒ `SWEEP-REQUIRED`):

- `npm pack` errored, or its output did not parse as expected.
- An `.npmignore` is present in the package.
- A candidate path is absent at `range_to` (deleted or renamed in range — its
  removal can itself change the artifact).
- The range changed a **pack-manifest-influencing file**: `package.json`,
  `.npmignore`, or `.gitignore` at any level within the package directory. A
  nested ignore file is never packed yet can change the tarball, so the
  invariant a dropped path must satisfy is that it cannot **change** the
  published artifact, not merely that it is not packed.

A package whose `package.json` declares a pack-affecting lifecycle script
(`prepack`, `prepare`, or `prepublishOnly`) is **excluded from the
refinement** — all its paths stay publishable, because a build step is a
genuine missed-cut channel for external consumers.

## What the re-anchor bound guarantees

A wrong baseline record survives at most one re-anchor interval. The next full
sweep re-verifies every tagged package from its tags and every untagged
package from its history, so unreleased **commits** cannot silently accumulate
past it. The guarantee covers the commit-accumulation class only: pending
publish-failure recovery is record-dependent under both the sweep and the early
exit (a tag-based sweep cannot see a failed publish either).

## Baseline resolution (condition 1)

The baseline `B` is a commit SHA cited by a prior run record with an ancestry
assertion against `HEAD`:

```sh
git merge-base --is-ancestor "${B}" HEAD && echo "B is an ancestor"
```

- **Resolved.** `B` is an ancestor of `HEAD` → it is the `range_from`.
- **No record / not an ancestor / ambiguous.** Unclassifiable ⇒ full sweep.
- **Chain age.** If the chain since the last real per-package sweep exceeds the
  re-anchor bound (one scheduled cadence interval, or the cadence-less default
  of 20 early-exits), `B` is stale ⇒ full sweep.

### Shallow-clone worked example

A dispatch checkout is often shallow, so `B` can sit below the fetch boundary:

```sh
git cat-file -e "${B}^{commit}" 2>/dev/null || echo "B not present locally"
```

When `B` is absent, the ancestry check cannot run. Deepen the clone to reach
`B` (`git fetch --deepen=<n>` or `--shallow-since`), then retry the ancestry
check. If `B` still cannot be reached, the baseline is unresolvable ⇒ full
sweep (default). Never treat an unreachable `B` as a satisfied conjunct — that
would silently suppress every future exit.
