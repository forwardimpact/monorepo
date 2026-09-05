# Plan 2340-a Part 04: Release runbook

The tiers of CONTRIBUTING.md § Releasing, in order. Tier 4 is part 03 and has
no step here. Each tier waits for the previous tier's publish workflow to go
green. `Release: Tag` (`.github/workflows/release-tag.yml`) creates every tag,
and its `release-tagger` action moves the `v<major>` alias for action releases,
so no step moves `v1` by hand.

Route tiers 1 to 3 to `release-engineer`. Route tier 5 to `staff-engineer`.

## Tier 1: Cut the gear bundle (after part 01 merges)

Files modified: `products/gear/package.json` and the lockfile, on `main`.

The `gemba-harness` binary that a runner installs comes from the gear release,
not from workspace source. Part 01's absent-trace branch reaches a runner only
through a new bundle.

1. Run [`kata-release-cut`](../../.claude/skills/kata-release-cut/SKILL.md) on
   `main`. Its sweep names every package with unreleased work. `libharness` and
   `gear` are both in that set after part 01.
2. Bump, commit, and push the version commits the sweep produces. `gear` is
   pre-1.0, so it takes a patch bump: `0.3.4` to `0.3.5`.
3. Dispatch `Release: Tag` with `tags: gear@v0.3.5` and the other tags the
   sweep produced. Leave `repo` and `sha` empty.

Verify: `Publish: Binaries` is green on the `gear@v0.3.5` tag, and the release
carries the `gemba-harness-*` assets with their `.sha256` sidecars.

## Tier 2: Move the installer pin and cut `gemba-bootstrap`

Files modified: `products/gemba/actions/gemba-bootstrap/fit-install.sh`.

Nothing consumes the new bundle until this default moves.

1. On a branch, set the default to the tier-1 tag:

   ```sh
   FIT_GEAR_RELEASE="${FIT_GEAR_RELEASE:-gear@v0.3.5}"
   ```

2. Open the pull request, title it `chore(bootstrap): pin FIT_GEAR_RELEASE to
   gear@v0.3.5`, and merge it. `publish-actions.yml` then mirrors
   `products/gemba/actions/gemba-bootstrap/` to the sibling's `main`.
3. Dispatch `Release: Tag` with `repo: gemba-bootstrap` and `tags: v1.0.21`.
   Leave `sha` empty so it tags the sibling's default-branch tip.
4. Record the sibling's 40-character `v1.0.21` SHA. Part 02 step 3 pins it.

Verify: `gh api repos/forwardimpact/gemba-bootstrap/tags` lists `v1.0.21`, and
`action.yml` at that SHA declares `bun-version` with `default: ""` and carries
the `Resolve Bun version` step.

## Tier 3: Cut `kata-agent` (after part 02 merges)

Files modified: none.

1. Confirm `publish-actions.yml` is green on the merge commit, and that the
   `kata-agent` leg pushed.
2. Dispatch `Release: Tag` with `repo: kata-agent` and `tags: v1.0.10`. Leave
   `sha` empty.
3. Record the sibling's 40-character `v1.0.10` SHA. Part 03 steps 1 and 2 pin
   it.

Verify: `gh api repos/forwardimpact/kata-agent/tags` lists `v1.0.10` at a SHA
whose `action.yml` declares `task-event` (success criterion 11).

## Tier 4: The monorepo pins

That is [part 03](plan-a-03.md). It merges after this tier's tag exists.

After it merges, run `gh workflow run "Kata: Dispatch"` with a `prompt` and a
`callback_url` you control. The run summary shows the cost table with no cost
step in the workflow, and the endpoint receives one terminal payload (success
criterion 7, and design-a.md § Test strategy's manual acceptance).

## Tier 5: The reference consumer (after tier 3)

Repository: `forwardimpact/bionova-apps-v2`. File modified:
`.github/workflows/agent-dispatch.yml`. Bring the repository into the session
with `add_repo`, then open a pull request against it, per
[references/CLAUDE.md § Keep a reference current](../../references/CLAUDE.md).

Read the file first. Replace its seven steps with one `kata-agent` step, the
same shape as its `agent-shift.yml`, `agent-storyboard.yml`, and
`agent-coaching.yml`. Pin `forwardimpact/kata-agent@<tier-3-sha> # v1.0.10`.

Keep, unchanged, everything spec.md § Excluded leaves in the workflow:

| Element                          | Why it stays                                                       |
| -------------------------------- | -------------------------------------------------------------------- |
| The `on:` block and the `if:`    | The trigger surface and its predicate are the consumer's policy.   |
| Its `concurrency` group          | It measured `queue: max`. This change does not reconcile the two.  |
| Its job `timeout-minutes`        | A composite action cannot declare it.                              |
| Its Bun version                  | Pass it as `bun-version:` on the step, the input part 02 added.    |

Remove its seven steps, its `bun-version` comment, and its 64 KiB redirect
comment. The redirect it protected now lives once inside `kata-agent`.

`references/bionova-apps/` in this repository needs no edit. Its record names
`kata-setup` as a hard gate and never restates the workflow body.

Verify: in that repository, `rg 'uses:' .github/workflows/agent-dispatch.yml`
returns one line naming `forwardimpact/kata-agent@` (success criterion 10), and
one dispatched run reaches the facilitator.
