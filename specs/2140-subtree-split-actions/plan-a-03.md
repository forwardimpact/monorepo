# Plan 2140-a-03: Inbound — pull-back replay recipe

Adds the scripted recipe that replays an external sibling PR's commits into its
monorepo prefix, preserving author identity (criterion 5). Its home is the
`justfile`, as the design names.

## Step 1: Add the `action-pullback` recipe

A `justfile` target that takes a sibling clone path, the PR head ref, and the
target prefix, and replays the PR's commits into the prefix with author
preserved.

Files modified: `justfile` (new recipe).

```just
# Replay an external sibling PR into its monorepo prefix, preserving authorship.
# Usage: just action-pullback <sibling-clone> <pr-head> <prefix>
action-pullback clone head prefix:
    git -C {{clone}} format-patch origin/main..{{head}} --stdout --binary \
      | git am -3 --directory={{prefix}}
```

`--directory` rewrites each patched path into the prefix; `git am` preserves the
original author; `format-patch --binary` plus `git am -3` cover binary hunks and
merge fallback. For a fork-based external PR the maintainer first fetches the
fork's `pr-head` into the sibling clone so `origin/main..{{head}}` resolves. On
a conflict the recipe aborts (`git am --abort`) and the maintainer re-applies by
hand — outside the happy path criterion 5 verifies. The result is a normal
monorepo PR under the usual gates; merging it republishes the change on the next
outbound split, closing the sibling PR as "landed via monorepo #NNN."

Verify: replay a synthetic sample PR (a clone with one commit by a distinct
author on a `pr-head` branch); the resulting monorepo commit lands the file
under the prefix and `git log -1 --format='%ae'` equals the sample commit's
author email (criterion 5).

Libraries used: none.
