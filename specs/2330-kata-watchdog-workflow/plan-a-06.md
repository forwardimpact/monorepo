# Plan 2330-a Part 06: Operator steps

Two steps no agent can run. Step 1 gates part 03's publish leg and part 05's
engage job. Step 2 gates part 05's two pins.

Depends on: step 1 on nothing, step 2 on part 03 merging to `main`.
Route: an operator with GitHub organization admin rights.

## Step 1: Grant the App permission and seed the sibling repository

Give the brake its credential and its publication target.

Modified: the Kata GitHub App settings, and the `forwardimpact` organization.

1. In the Kata App settings, set **Repository permissions → Variables** to
   **Read & write**. Set **Organization permissions → Variables** to
   **Read-only**. Add no **Secrets** permission, at either scope.
2. Accept the permission change on every installation. GitHub holds the new
   scope until an installation owner approves it.
3. Create the empty public repository `forwardimpact/gemba-watchdog`. Install
   the Kata App on it, so `publish-actions.yml` can mint a token scoped to it.

The brake is inert until step 1.1 lands. No repository surface can make this
grant.

Verify: the App's permission page lists `Variables: Read & write` and no
`Secrets` row, and `forwardimpact/gemba-watchdog` resolves.

## Step 2: Publish the action and cut the gear release

Create the two references part 05 pins.

Modified: `forwardimpact/gemba-watchdog`, and the monorepo's release tags.

1. After part 03 merges to `main`, run `Publish: Actions` by hand, or let the
   push trigger it. The `gemba-watchdog` leg seeds the sibling's `main` with the
   subtree split. This is the lineage's one sanctioned force push. Every later
   run is a non-force fast-forward.
2. Tag the sibling's seeded commit `v1`. Record the commit SHA. Part 05 step 1
   pins it.
3. Cut a `gear@v*` release from a `main` commit that carries part 02's
   `build/cli-manifest.json` entry, through
   [`kata-release-cut`](../../.claude/skills/kata-release-cut/SKILL.md). The
   release must publish `gemba-watchdog-bun-linux-x64`, its `.sha256` sidecar,
   and the `fit-install.sh` asset stamped with that tag.
4. Set the action's `gear-release` default to that tag.

Verify:
`curl -fsSL https://github.com/forwardimpact/monorepo/releases/download/<tag>/fit-install.sh | bash -s -- --only gemba-watchdog`
installs the binary on a clean Linux x64 host, and `gemba-watchdog --version`
prints a semver line.
