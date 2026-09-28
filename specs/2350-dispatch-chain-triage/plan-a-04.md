# Plan 2350-a Part 04: Release chain, repin, and acceptance

The releases between part 01's `libharness` change and a `kata-agent` run that
shows it, the repin of this repository's four workflows, the dispatch workflow's
prose, and the acceptance run. CONTRIBUTING.md § Releasing defines the tiers:
the compiled bundle, the co-versioned `fit-install.sh`, the sibling actions, and
this repository's pins.

Depends on: parts 01 and 02 merged. Route: `release-engineer`.

Tags come from `Release: Tag`, per CONTRIBUTING.md § Releasing; its
`release-tagger` action moves the `v1` alias.

**Version numbers below are the expected next patch** above `gear@v0.3.6`,
`gemba-bootstrap` v1.0.21, and `kata-agent` v1.0.11. The tag space is
append-only. If an unrelated release lands first, take the next patch above the
current highest tag.

## Tier 1: Cut the gear bundle

The `gemba-harness` and `gemba-trace` binaries a runner installs come from the
gear release, so part 01 reaches a runner only through a new bundle.

Modified: the `version` field of each package the sweep names,
`products/gear/package.json`, and the lockfile, on `main`.

1. Run `kata-release-cut` on `main`. Its sweep names `libharness` and any
   package that depends on it, from the directories part 01 changed.
2. Bump `gear` by hand: set the `version` field of `products/gear/package.json`
   to `0.3.7`.
3. Commit the bumps and push them to `main`.
4. Dispatch `Release: Tag` with `tags: gear@v0.3.7` plus the tags the sweep
   produced. Leave `repo` and `sha` empty.

Verify: `Publish: Binaries` is green on `gear@v0.3.7`, the release carries
`gemba-harness-*` and `gemba-trace-*` assets with `.sha256` sidecars, and
`products/gear/package.json` at the tagged commit reads `0.3.7`.

## Tier 2: Move the installer pin and cut `gemba-bootstrap`

Nothing consumes the new bundle until the installer default moves.

Modified: `products/gemba/actions/gemba-bootstrap/fit-install.sh`

1. On a branch, set the `FIT_GEAR_RELEASE` default to `gear@v0.3.7`.
2. Open the pull request, let `kata-release-merge` merge it, and wait for
   `Publish: Actions` to mirror `products/gemba/actions/gemba-bootstrap/` to the
   sibling.
3. Read the sibling's `main` SHA from the mirror run's log. Dispatch
   `Release: Tag` with `repo: gemba-bootstrap`, `tags: v1.0.22`, and that SHA.

Verify: `gh api repos/forwardimpact/gemba-bootstrap/tags` lists `v1.0.22`, and
`fit-install.sh` at that tag reads `gear@v0.3.7`.

## Tier 3: Repin the bootstrap inside `kata-agent` and cut it

Part 02's gate is on `main` already. This tier moves the one pin line and ships
the action.

Modified: `products/kata/actions/kata-agent/action.yml` (the
`forwardimpact/gemba-bootstrap@` line only)

1. On a branch, set the bootstrap `uses:` SHA to the `v1.0.22` commit and its
   comment to `# v1.0.22`.
2. Open the pull request. Part 02's `Check: Kata Agent` workflow runs on it,
   because the path filter matches. Merge on green.
3. Wait for `Publish: Actions` to mirror `products/kata/actions/kata-agent/`.
   Read the sibling's `main` SHA from the run log. Dispatch `Release: Tag` with
   `repo: kata-agent`, `tags: v1.0.12`, and that SHA.

Verify: `gh api repos/forwardimpact/kata-agent/tags` lists `v1.0.12`, and
`action.yml` at that tag declares `dispatch-budget`, declares no `app-slug`
input, and pins `gemba-bootstrap` at `v1.0.22`.

## Tier 4: Repin this repository's workflows and rewrite the dispatch prose

Modified: `.github/workflows/kata-dispatch.yml`,
`.github/workflows/kata-shift.yml`, `.github/workflows/kata-storyboard.yml`,
`.github/workflows/kata-coaching.yml`

1. In all four files, set the `forwardimpact/kata-agent@` SHA to the `v1.0.12`
   commit and the comment to `# v1.0.12`.
2. In `kata-dispatch.yml`, replace the two comments that name a recursion guard,
   and add `gate` after `stamp` in the step comment that lists the lifecycle
   ("killswitch first, token mint and stamp, gate, checkout, …"):

   | Comment                                                                                                                                                                                                                                              | New text                                                                                                                                                                                                                                                                                                       |
   | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | "Coalesce simultaneous events on the same target so the recursion guard sees a stable thread. …"                                                                                                                                                     | "Coalesce simultaneous events on the same target so one facilitator sees a stable thread. …" The rest of the comment is unchanged.                                                                                                                                                                             |
   | "This workflow allows bot-authored content so it can serve as an agent-to-agent coordination channel. The task text contains a recursion guard. The guard stops the facilitator when the latest activity is already a participant agent's response." | "This workflow allows bot-authored content so it can serve as an agent-to-agent coordination channel. kata-agent classifies the actor, stands a self-caused run down before checkout when the repository is over its dispatch budget, and opens the task with the actor's class; its README carries the gate." |

3. Open the pull request and merge on green.

Verify: `rg -n --hidden 'recursion' .github` prints nothing, and all four
workflows pin the same `kata-agent` SHA.

## Acceptance

Two dispatch runs after tier 4 merges, read through the run summary and the
trace.

| Run                                                              | Evidence                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The next self-caused event, such as an agent's own issue comment | Either the run summary carries `stood down:` and no `Run cost` block, or `gemba-trace overview --file <trace-file> --format json` (the raw combined trace, whose first user turn is the lead's task) shows `taskPrompt` that starts with `Caused by: self (@` and a `verdict`. |
| The next human-caused event, such as a human comment             | The same raw combined trace shows `taskPrompt` that starts with `Caused by: human (@` and contains no `stand_down`.                                                                                                                                                            |

Record both run URLs in the weekly log and on the tier-4 pull request.

Verify: both rows hold, and the `Report run cost` block on a run that ran
carries a `Verdict:` line.
