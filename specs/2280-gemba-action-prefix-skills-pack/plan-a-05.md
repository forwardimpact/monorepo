# Plan 2280-a Part 05: Operator Runbook

The sibling repos live outside the monorepo, so an agent cannot execute this
part. An operator with GitHub org admin rights runs it. It brackets the merge
of parts 01 to 04. It follows the rollout sequence in
[design-a.md § Rollout sequence](design-a.md#rollout-sequence).

## Step 1: Before the merge

Files created / modified / deleted: none in the monorepo.

1. Rename the four sibling repos in place, through **Settings → General →
   Repository name** on each:

   | Old | New |
   | --- | --- |
   | `forwardimpact/benchmark` | `forwardimpact/gemba-benchmark` |
   | `forwardimpact/bootstrap` | `forwardimpact/gemba-bootstrap` |
   | `forwardimpact/harness` | `forwardimpact/gemba-harness` |
   | `forwardimpact/wiki` | `forwardimpact/gemba-wiki` |

   A rename keeps the redirect, every tag, and every commit SHA, so existing
   downstream pins keep resolving.

2. Create `forwardimpact/gemba-skills` with an initial commit. The pack action
   runs a plain `git push`, so it needs a branch to land on.

3. Open the publishing App's installation settings. Confirm the repository
   access list covers all five repos under their new names.

Verify: each new URL loads, each old URL redirects to it, and the App
installation lists the five repos.

## Step 2: Merge

Merge the PR that carries parts 01 to 04. Do not merge before step 1 reports
all five repos ready.

Verify: `main` shows the four renamed homes and the `gemba-skills` pack leg.

## Step 3: After the merge

Files created / modified / deleted: none in the monorepo.

The prefix rename changes each split lineage, so every renamed action leg
fails as a non-fast-forward until one re-seed lands. Re-seed each renamed
prefix once, with the same pinned `splitsh-lite` the publish action uses
(`.github/actions/split-and-push/action.yml`):

```sh
git clone --no-single-branch https://github.com/forwardimpact/monorepo.git
cd monorepo
for name in benchmark bootstrap harness wiki; do
  sha=$(splitsh-lite --prefix="products/gemba/actions/gemba-${name}")
  git push --force "https://github.com/forwardimpact/gemba-${name}.git" \
    "${sha}:refs/heads/main"
done
```

This is the only sanctioned force push per renamed sibling. Pre-rename tags
keep the old commits reachable, so existing SHA pins resolve before, during,
and after.

Verify: each renamed sibling's `main` matches its projection, and a manual
`workflow_dispatch` of `publish-actions.yml` succeeds on all seven legs.

## Step 4: Confirm steady state

Files created / modified / deleted: none in the monorepo.

1. Run `publish-skills.yml` on `main`. The `gemba-skills` leg stages the six
   platform skills and tags the pack at the Gemba package version (`0.1.0`).
2. Confirm the next `fit-skills` sync drops the six gemba skills and that its
   README carries the moved-skills note.
3. Confirm `apm install forwardimpact/gemba-skills` installs the six skills.

Later publishes run non-force. The next release cut lays new version tags on
the new lineage and moves only `v1`. The existing version tags stay on the old
lineage as its anchors. Dependabot then carries the new-lineage SHAs to
consumers.

Verify: both publish workflows are green on every leg, and the
`forwardimpact/gemba-skills` repo carries `skills/gemba`, `skills/gemba-benchmark`,
`skills/gemba-harness`, `skills/gemba-trace`, `skills/gemba-wiki`, and
`skills/gemba-xmr`.
