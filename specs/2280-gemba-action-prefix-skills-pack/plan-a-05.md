# Plan 2280-a Part 05: Operator Runbook

The sibling repos live outside the monorepo, so an agent cannot execute this
part. An operator with GitHub org admin rights runs it. It follows the rollout
sequence in [design-a.md § Rollout sequence](design-a.md#rollout-sequence).

**Step 1 runs before any implementation lands on the branch**, not before the
merge. The monorepo's `on: pull_request` checks (`check-quality.yml`,
`check-test.yml`, `check-context.yml`, `check-data.yml`, `check-security.yml`)
pin the bootstrap action. Once part 02 repoints them, the branch's own CI
cannot resolve `forwardimpact/gemba-bootstrap` until the rename has happened.
The rename keeps the old names resolving through redirects, so doing it first
breaks nothing that runs today.

## Step 1: Before implementation starts

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

**Expect one transient failure here.** Between this step and the merge, a push
to `main` that touches the old action paths mints App tokens for repo names
that no longer exist, so those `publish-actions.yml` legs fail at the mint.
`fail-fast: false` scopes the failure to the affected legs. Consumers keep
resolving their pinned refs throughout. This is the window design-a.md:91-97
documents. It is not a botched rename.

## Step 2: Merge

Merge the PR that carries parts 01 to 04. Do not merge before step 1 reports
all five repos ready.

Verify: `main` shows the four renamed homes and the `gemba-skills` pack leg.

**Expect the second transient failure here.** Between the merge and step 3, the
split of each renamed prefix produces a new lineage, so those legs fail as
non-fast-forward. Step 3 clears it.

## Step 3: After the merge, re-seed each renamed lineage

Files created / modified / deleted: none in the monorepo.

The prefix rename changes each split lineage, so every renamed action leg fails
as a non-fast-forward until one re-seed lands.

Use the **same pinned, SHA-verified `splitsh-lite`** the publish action installs
(`.github/actions/split-and-push/action.yml:36-44`). A different build emits
different SHAs, which diverges the new lineage permanently and no later publish
can fast-forward. The action's own comment states this requirement.

```sh
SPLITSH_VERSION="1.0.1"
SPLITSH_SHA256="2539301ce5e21d0ca44b689d0dd2c1b20d9f9e996c1fe6c462afb8af4e7141cc"
curl -sSfL -o splitsh.tar.gz \
  "https://github.com/splitsh/lite/releases/download/v${SPLITSH_VERSION}/lite_linux_amd64.tar.gz"
echo "${SPLITSH_SHA256}  splitsh.tar.gz" | sha256sum -c -
tar -xzf splitsh.tar.gz

git clone --no-single-branch \
  "https://x-access-token:${TOKEN}@github.com/forwardimpact/monorepo.git"
cd monorepo
for name in benchmark bootstrap harness wiki; do
  sha=$(../splitsh-lite --prefix="products/gemba/actions/gemba-${name}")
  git push --force \
    "https://x-access-token:${TOKEN}@github.com/forwardimpact/gemba-${name}.git" \
    "${sha}:refs/heads/main"
done
```

`TOKEN` is an App installation token scoped to the five repos. The monorepo is
internal-only, so the clone needs it too.

This is the only sanctioned force push per renamed sibling. Pre-rename tags
keep the old commits reachable, so existing SHA pins resolve before, during,
and after.

Verify: each renamed sibling's `main` matches its projection, and a manual
`workflow_dispatch` of `publish-actions.yml` succeeds on all seven legs.

## Step 4: Confirm steady state

Files created / modified / deleted: none in the monorepo.

1. Run `publish-skills.yml` on `main`. The `gemba-skills` leg stages the six
   platform skills and tags the pack at the Gemba package version (`0.1.0`).
2. Confirm the next `fit-skills` sync drops the six gemba skills from the
   repo's **default branch**, and that its README carries the moved-skills
   note. The **tag** does not move: the fit leg versions by
   `products/gear/package.json`, nothing in this change bumps Gear, and the
   pack action skips a tag that already exists upstream. A consumer pinned to
   the current `fit-skills` tag keeps the six gemba skills until the next Gear
   release cut retags the pack. Cut a Gear patch release if the drop needs to
   reach tag-pinned consumers sooner.
3. Confirm `apm install forwardimpact/gemba-skills` installs the six skills.

Later publishes run non-force. The next release cut lays new version tags on
the new lineage and moves only `v1`. The existing version tags stay on the old
lineage as its anchors. Dependabot then carries the new-lineage SHAs to
consumers.

Verify: both publish workflows are green on every leg, and the
`forwardimpact/gemba-skills` repo carries `.apm/skills/gemba`,
`.apm/skills/gemba-benchmark`, `.apm/skills/gemba-harness`,
`.apm/skills/gemba-trace`, `.apm/skills/gemba-wiki`, and
`.apm/skills/gemba-xmr`. The publisher stages under `.apm/skills/`
(`libraries/libpack/src/layout.js:16`) and deletes any root-level `skills/`
tree, so a root `skills/` path is the wrong thing to check.
