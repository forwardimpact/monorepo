# Plan 2340-a Part 04: Release runbook

CONTRIBUTING.md § Releasing defines four release tiers: the compiled bundle,
the co-versioned `fit-install.sh`, the sibling actions, and this repository's
pins. This runbook numbers its own steps against them. Tiers 1 and 2 map to
CONTRIBUTING's tiers 1 and 2. Tier 3 is CONTRIBUTING's tier 3. Tier 4 is the
acceptance run that follows CONTRIBUTING's tier 4, which
[part 03](plan-a-03.md) carries. Tier 5 has no CONTRIBUTING counterpart,
because it ships in another repository.

Each tier waits for the previous tier's publish workflow to go green.

**Tags come from `Release: Tag`.** CONTRIBUTING.md § Releasing states it, and
it overrides the `git push origin <tag>` form in `kata-release-cut`
`references/procedure.md`. The release-cut environment cannot push tags. The
workflow's `release-tagger` action also moves the `v<major>` alias for action
releases, so no step moves `v1` by hand.

Route tiers 1 to 3 to `release-engineer`. Route tiers 4 and 5 to
`staff-engineer`.

## Tier 1: Cut the gear bundle (after part 01 merges)

Files modified: `products/gear/package.json`,
`libraries/libharness/package.json`, and the lockfile, on `main`.

The `gemba-harness` binary a runner installs comes from the gear release, so
part 01's absent-trace branch reaches a runner only through a new bundle.

1. Run [`kata-release-cut`](../../.claude/skills/kata-release-cut/SKILL.md) on
   `main`. Its sweep names `libharness`, whose directory part 01 changed.
2. **Bump `gear` by hand.** The sweep enumerates with
   `git log <tag>..HEAD -- <directory>`, and `products/gear/` holds only
   `package.json`, which part 01 never touches. So the sweep cannot name
   `gear`, even though the bundle compiles the changed `libharness` source.
   Run `npm version patch --no-git-tag-version` in `products/gear` to take
   `0.3.4` to `0.3.5`. Tagging without this bump would strand `gear@v0.3.5` on
   a commit whose `package.json` still reads `0.3.4`, which blinds every later
   sweep. This gap in the sweep is a defect in the release tooling. Open an
   issue for it; do not widen this plan to fix it.
3. Commit the bumps and push them to `main`.
4. Dispatch `Release: Tag` with `tags: gear@v0.3.5` plus the tags the sweep
   produced. Leave `repo` and `sha` empty.

Verify: `Publish: Binaries` is green on the `gear@v0.3.5` tag, the release
carries the `gemba-harness-*` assets with their `.sha256` sidecars, and
`products/gear/package.json` at the tagged commit reads `0.3.5`.

## Tier 2: Move the installer pin and cut `gemba-bootstrap`

Files modified: `products/gemba/actions/gemba-bootstrap/fit-install.sh`.

Nothing consumes the new bundle until this default moves.

1. On a branch, set the default to the tier-1 tag:

   ```sh
   FIT_GEAR_RELEASE="${FIT_GEAR_RELEASE:-gear@v0.3.5}"
   ```

2. Open the pull request, title it
   `chore(gemba): pin FIT_GEAR_RELEASE to gear@v0.3.5`, and merge it. The scope
   is the workspace package that owns the file, per CONTRIBUTING.md.
   `publish-actions.yml` then mirrors
   `products/gemba/actions/gemba-bootstrap/` to the sibling's `main`.
3. Dispatch `Release: Tag` with `repo: gemba-bootstrap` and `tags: v1.0.21`.
   Leave `sha` empty so it tags the sibling's default-branch tip.
4. Read the sibling's 40-character `v1.0.21` SHA from that tag. Part 02 step 3
   pins it.

Verify: `gh api repos/forwardimpact/gemba-bootstrap/tags` lists `v1.0.21`, and
`action.yml` at that SHA declares `bun-version` with `default: ""` and carries
the `Resolve Bun version` step.

## Tier 3: Cut `kata-agent` (after part 02 merges)

Files modified: none.

1. Confirm `publish-actions.yml` is green on the merge commit and that the
   `kata-agent` leg pushed.
2. Dispatch `Release: Tag` with `repo: kata-agent` and `tags: v1.0.10`. Leave
   `sha` empty.
3. Read the sibling's 40-character `v1.0.10` SHA from that tag. Part 03 steps 1
   and 2 pin it. Take it from the tag, never from part 02's pull request: a
   squash merge leaves the branch's own commits unreachable from `main`.

Verify: `gh api repos/forwardimpact/kata-agent/tags` lists `v1.0.10` at a SHA
whose `action.yml` declares `task-event` (success criterion 11).

## Tier 4: Acceptance run (after part 03 merges)

Files modified: none.

Run `gh workflow run "Kata: Dispatch"` with a `prompt` and a `callback_url` you
control.

Verify: the run summary shows the cost table while
`.github/workflows/kata-dispatch.yml` carries no cost step (success criterion
7), and the endpoint receives exactly one terminal payload. This is
design-a.md § Test strategy's manual acceptance.

## Tier 5: The reference consumer (after tier 3)

Repository: `forwardimpact/bionova-apps-v2`. File modified:
`.github/workflows/agent-dispatch.yml`. Bring the repository into the session
with `add_repo`, then open a pull request against it, per
[references/CLAUDE.md § Keep a reference current](../../references/CLAUDE.md).

Read the file first. Replace its seven steps with one `kata-agent` step, the
same shape as its `agent-shift.yml`, `agent-storyboard.yml`, and
`agent-coaching.yml`. Pin `forwardimpact/kata-agent@<tier-3-sha> # v1.0.10`.

Keep, unchanged, everything spec.md § Excluded leaves in the workflow:

| Element                       | Why it stays                                                      |
| ----------------------------- | ------------------------------------------------------------------- |
| The `on:` block and the `if:` | The trigger surface and its predicate are the consumer's policy.  |
| Its `concurrency` group       | It measured `queue: max`. This change does not reconcile the two. |
| Its job `timeout-minutes`     | A composite action cannot declare it.                             |
| Its Bun version               | Pass it as `bun-version:` on the step, the input part 02 added.   |

Remove its seven steps, its `bun-version` comment, and its 64 KiB redirect
comment. Part 02 step 6 moved that comment's reasoning into `kata-agent`'s own
cost step, so it leaves this file without leaving the tree.

`references/bionova-apps/` in this repository needs no edit. Its record names
`kata-setup` as a hard gate and never restates the workflow body.

Verify: in that repository, `rg 'uses:' .github/workflows/agent-dispatch.yml`
returns one line naming `forwardimpact/kata-agent@` (success criterion 10), and
one dispatched run reaches the facilitator.
