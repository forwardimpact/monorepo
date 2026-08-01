# Early-exit mechanics

This file gives worked detail for the Step 2 classification. It holds the
invocations and the examples only. The normative rules live in
[early-exit.md](early-exit.md). The placeholders are generic. Substitute the
real directory, prefix, and SHAs at run time.

## Per-commit union walk (condition 2)

Condition 2 tests the **union of paths changed by each commit** in the bound
range. It does not test a net diff. Use:

```sh
git log --no-merges --name-only --format='' "${range_from}..${range_to}" \
  | sort -u
```

The union of this output must remain a **superset** of every per-directory log
the sweep would run (`git log "${latest}..HEAD" -- "${directory}"`, Step 3).
Two traversal hazards:

- **Net diff is unsound.** `git diff range_from..range_to` collapses an
  add-then-revert pair inside the range to nothing. A file that one commit
  edits and another commit reverts would then escape the test. The per-commit
  walk sees both commits.
- **No `--first-parent`.** `--first-parent` prunes the side-branch commits
  that a merge brought in. The per-directory sweep counts those commits. If
  you omit the side-branch commits, you can get a false `NO-CUT-OWED`. Walk
  every non-merge commit. If you cannot show a traversal is a superset of the
  sweep's path-scoped log, the run is unclassifiable. It performs a full
  sweep.

Read the workspace manifest (the publishable-directory set) at `range_to`.
Never read it at `range_from`. A manifest change inside the range must not
narrow the set. A brand-new package directory that appears in the range
therefore sits under a publishable directory at `range_to`. It reaches the
packlist tier. No prior publish list holds it, so it classifies as publishable
and the run sweeps.

## Packlist membership (condition 2, tier 2)

This tier runs **only** on paths that already passed the directory tier. The
modal zero-surface range (docs, wiki, skills) therefore never invokes it. The
cost stays at seconds and about zero tokens. Read the packer's publish list at
the frozen `range_to`. Pin a throwaway worktree so the run does not mutate the
live checkout:

```sh
git worktree add --detach /tmp/rc-pin "${range_to}"
( cd /tmp/rc-pin/"${directory}" && npm pack --dry-run --json --ignore-scripts )
git worktree remove /tmp/rc-pin
```

Parse the JSON `files[].path` array. That array is the authoritative publish
list. [early-exit.md](early-exit.md) § Condition 2 is normative for the doubt
classes that route a path to publishable and for the lifecycle-script
exclusion. The nested-ignore case explains why. An ignore file is never
packed, but it can change the tarball. A dropped path must therefore satisfy
a stronger invariant. It cannot **change** the published artifact. Absence
from the pack is not enough.

## What the re-anchor bound guarantees

A wrong baseline record survives at most one re-anchor interval. The next full
sweep re-verifies every tagged package from its tags. It re-verifies every
untagged package from its history. Unreleased **commits** therefore cannot
silently accumulate past it. The guarantee covers the commit-accumulation
class only. Pending publish-failure recovery stays record-dependent under both
the sweep and the early exit (a tag-based sweep cannot see a failed publish
either).

## Baseline resolution (condition 1)

A prior run record cites the baseline `B` as a commit SHA with an ancestry
assertion against `HEAD`:

```sh
git merge-base --is-ancestor "${B}" HEAD && echo "B is an ancestor"
```

When `B` resolves as an ancestor of `HEAD`, it is the `range_from`. A missing
record, a non-ancestor, an ambiguous record, or a chain past the re-anchor
bound is unresolvable. The run then performs a full sweep
([early-exit.md](early-exit.md) § Condition 1 and § Re-anchor bound).

### Shallow-clone worked example

A dispatch checkout is often shallow, so `B` can sit below the fetch boundary:

```sh
git cat-file -e "${B}^{commit}" 2>/dev/null || echo "B not present locally"
```

When `B` is absent, the ancestry check cannot run. Deepen the clone to reach
`B` (`git fetch --deepen=<n>` or `--shallow-since`). Then run the ancestry
check again. If you still cannot reach `B`, the baseline is unresolvable. Run
the full sweep. Never treat an unreachable `B` as a satisfied conjunct. That
would silently suppress every future exit.
