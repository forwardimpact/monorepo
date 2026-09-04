# Plan 2330-a Part 06: Operator steps

Four steps no agent can run, at three points in the sequence. Step 1 gates part
03's publish leg and part 05's engage job. Steps 2 and 3 gate part 03's
`gear-release` and `installer-sha256` defaults. Step 4 gates part 05's action
pin.

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

## Step 2: Publish the npm packages

Make `npx gemba-watchdog` resolve for the readers the new guide instructs.

Depends on: part 02 merged to `main`. Must precede part 03.

Modified: the monorepo's release tags.

`.github/workflows/publish-npm.yml` fires on `*@v*` tags only, so nothing
publishes without one. Part 02 makes `libwatchdog` a runtime dependency of the
published `@forwardimpact/gemba` package and ships a launcher whose whole
purpose is the `npx gemba-watchdog` the guide teaches.

1. Cut `@forwardimpact/libwatchdog` through
   [`kata-release-cut`](../../.claude/skills/kata-release-cut/SKILL.md),
   producer before consumer.
2. Cut `@forwardimpact/gemba`, which carries the new bin and the dependency.
3. Confirm the registry serves both, and that the bare `gemba-watchdog` launcher
   published at the same version.

Verify: `npx gemba-watchdog --version` prints a semver line on a clean host with
no repository checkout.

## Step 3: Cut the gear release that carries the binary

Create the tag and digest part 03 writes into the action as real defaults.

Depends on: step 2. Must precede part 03.

Modified: the monorepo's release tags.

1. Cut a `gear@v*` release from a `main` commit that carries part 02's
   `build/cli-manifest.json` entry, through `kata-release-cut`.
2. Confirm the release publishes `gemba-watchdog-bun-linux-x64`, its `.sha256`
   sidecar, and the `fit-install.sh` asset stamped with that tag.
3. Record the tag and `sha256sum` the released `fit-install.sh` asset. Part 03
   step 1 writes both into the action as the `gear-release` and
   `installer-sha256` input defaults, so the workflow passes neither.

Verify:
`curl -fsSL https://github.com/forwardimpact/monorepo/releases/download/<tag>/fit-install.sh | bash -s -- --only gemba-watchdog`
installs the binary on a clean Linux x64 host, prints no `(npm)` marker, and
`gemba-watchdog --version` prints a semver line.

## Step 4: Publish and tag the sibling action

Create the SHA part 05 pins.

Depends on: part 03 merged to `main`. Must precede part 05.

Modified: `forwardimpact/gemba-watchdog`.

1. Run `Publish: Actions` by hand, or let the merge push trigger it. The
   `gemba-watchdog` leg seeds the sibling's `main` with the subtree split.
   `.github/actions/split-and-push/action.yml` pushes a plain refspec with no
   force flag, and seeding an empty repository is a fast-forward, so this needs
   no exception.
2. Tag the seeded commit `v1`.
3. Record the commit SHA. Part 05 step 1 pins it on both `uses:` lines.

Nothing edits the action after this tag. The `gear-release` and
`installer-sha256` defaults are already real, so no follow-up push advances the
sibling head past the pinned SHA.

Verify: `forwardimpact/gemba-watchdog` holds the action at `v1`, its
`action.yml` `gear-release` default is the tag from step 3, and the recorded SHA
resolves on that repository.
