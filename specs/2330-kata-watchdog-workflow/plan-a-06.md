# Plan 2330-a Part 06: Operator steps

Three steps no agent can run, at three points in the sequence. Step 1 gates part
03's publish leg and part 05's engage job. Step 2 gates part 03's
`gear-release` default. Step 3 gates part 05's action pin.

Route: an operator with GitHub organization admin rights. Each step is
independently executable at its own slot. The plan-a.md § Parts index lists each
one at the slot it occupies.

## Step 1: Grant the App permissions and seed the sibling repository

Give the brake its credential and its publication target.

Depends on: nothing. Must precede part 03.

Modified: the Kata GitHub App settings, and the `forwardimpact` organization.

1. In the Kata App settings, set **Repository permissions → Variables** to
   **Read & write**. Set **Organization permissions → Variables** to
   **Read-only**. Add no **Secrets** permission, at either scope.
2. Accept the permission change on every installation. GitHub holds the new
   scope until an installation owner approves it.
3. Create the empty public repository `forwardimpact/gemba-watchdog`. Install
   the Kata App on it, so `publish-actions.yml` can mint a token scoped to it.

The brake is inert until 1.1 lands. No repository surface can make this grant.
Without 1.2, the latch read 403s at organization scope and every engage run
exits 1 without writing. Without 1.3, part 03's publish leg fails on merge.

Verify: the App's permission page lists `Variables: Read & write` at repository
scope, `Variables: Read-only` at organization scope, and no `Secrets` row at
either; and `forwardimpact/gemba-watchdog` resolves.

## Step 2: Cut the gear release that carries the binary

Create the tag part 03 writes into the action as a real default.

Depends on: part 02 merged to `main`. Must precede part 03.

Modified: the monorepo's release tags.

1. Cut a `gear@v*` release from a `main` commit that carries part 02's
   `build/cli-manifest.json` entry, through
   [`kata-release-cut`](../../.claude/skills/kata-release-cut/SKILL.md).
2. Confirm the release publishes `gemba-watchdog-bun-linux-x64`, its `.sha256`
   sidecar, and the `fit-install.sh` asset stamped with that tag.
3. Record the tag. Part 03 step 1 sets it as the action's `gear-release`
   default.

Cutting the release before the action lands is what lets the action ship a real
tag. The subtree split publishes that file to external consumers, so a
placeholder default would 404 for anyone who omits the input.

Verify:
`curl -fsSL https://github.com/forwardimpact/monorepo/releases/download/<tag>/fit-install.sh | bash -s -- --only gemba-watchdog`
installs the binary on a clean Linux x64 host, prints no `(npm)` marker, and
`gemba-watchdog --version` prints a semver line.

## Step 3: Publish and tag the sibling action

Create the SHA part 05 pins.

Depends on: part 03 merged to `main`. Must precede part 05.

Modified: `forwardimpact/gemba-watchdog`.

1. Run `Publish: Actions` by hand, or let the merge push trigger it. The
   `gemba-watchdog` leg seeds the sibling's `main` with the subtree split. This
   is the lineage's one sanctioned force push. Every later run is a non-force
   fast-forward.
2. Tag the seeded commit `v1`.
3. Record the commit SHA. Part 05 step 1 pins it on both `uses:` lines.

Nothing edits the action after this tag. The `gear-release` default is already
real, so no follow-up push advances the sibling head past the pinned SHA.

Verify: `forwardimpact/gemba-watchdog` holds the action at `v1`, its
`action.yml` `gear-release` default is the tag from step 2, and the recorded SHA
resolves on that repository.
