# Plan 2400-a Part 03: Release chain and repin

The releases between part 02's merge and a `kata-agent` run whose binaries carry
`scaffold`, the seeded board, and the bootstrap guard. CONTRIBUTING.md §
Releasing defines the tiers: the compiled bundle, the co-versioned
`fit-install.sh`, the sibling actions, and this repository's pins. Tags come
from `Release: Tag`, whose `release-tagger` action moves the `v1` alias.

Depends on: parts 01 and 02 merged. Route: `release-engineer`.

This part forces no version. `kata-release-cut` decides each bump, and the
`gemba` range follows `libwiki`'s. Every version below is "the version the cut
assigns".

## Tier 1: Cut the libraries, the products, and the gear bundle

Modified: the `version` fields the sweep names, the `@forwardimpact/libutil`
range in `libraries/libwiki/package.json`, `libraries/libpack/package.json`,
`libraries/libinvariant/package.json`, and `libraries/libharness/package.json`,
the `@forwardimpact/libwiki` range in `products/gemba/package.json`, the
`version` field of `products/gear/package.json`, and the lockfile, on `main`.

1. Run `kata-release-cut` on `main`. Its sweep names `libutil`, `libwiki`,
   `libpack`, `libinvariant`, `libharness`, and `gemba` from the directories
   parts 01 and 02 changed. Add `jidoka`, because its binary bundles
   `libinvariant` and the sweep reads directories, not dependents.
2. In the same commit, set each consumer's `libutil` floor to the new `libutil`
   version, and the `gemba` package's `libwiki` range to the new `libwiki`
   version.
3. Bump `gear` by hand to the next patch.
4. Commit, push to `main`, and dispatch `Release: Tag` with the gear tag plus
   the tags the sweep produced.

Verify: `Publish: Binaries` is green on the gear tag, the release carries a
`gemba-wiki-*` asset with its `.sha256` sidecar, and
`npx -y -p @forwardimpact/gemba@latest gemba-wiki scaffold --help` on a clean
machine prints the `scaffold` help.

## Tier 2: Move the installer pin and cut `gemba-bootstrap`

Part 02 already landed the guard in the action. This tier moves the gear pin and
ships both.

Modified: `products/gemba/actions/gemba-bootstrap/fit-install.sh`

1. On a branch, set the `FIT_GEAR_RELEASE` default to tier 1's gear tag.
2. Open the pull request, let `kata-release-merge` merge it, and wait for
   `Publish: Actions` to mirror `products/gemba/actions/gemba-bootstrap/`.
3. Read the sibling's `main` SHA from the mirror run's log. Dispatch
   `Release: Tag` with `repo: gemba-bootstrap`, the next patch tag, and that
   SHA.

Verify: `gh api repos/forwardimpact/gemba-bootstrap/tags` lists the tag, and
`action.yml` at that tag carries the `hashFiles('scripts/bootstrap.sh')`
condition on the `Bootstrap` step.

## Tier 3: Repin the bootstrap inside `kata-agent` and cut it

Modified: `products/kata/actions/kata-agent/action.yml` (the
`forwardimpact/gemba-bootstrap@` line only)

1. On a branch, set the bootstrap `uses:` SHA to tier 2's tag commit and its
   comment to the tag.
2. Open the pull request. `Check: Kata Agent` runs on it. Merge on green.
3. Wait for `Publish: Actions` to mirror `products/kata/actions/kata-agent/`.
   Dispatch `Release: Tag` with `repo: kata-agent`, the next patch tag, and the
   sibling's `main` SHA.

Verify: `gh api repos/forwardimpact/kata-agent/tags` lists the tag, and
`action.yml` at that tag pins `gemba-bootstrap` at tier 2's tag.

## Tier 4: Repin this repository's workflows

Modified: `.github/workflows/kata-dispatch.yml`,
`.github/workflows/kata-shift.yml`, `.github/workflows/kata-storyboard.yml`,
`.github/workflows/kata-coaching.yml`

1. In all four files, set the `forwardimpact/kata-agent@` SHA to tier 3's tag
   commit and the comment to the tag.
2. Open the pull request and merge on green.

Verify: all four workflows pin the same `kata-agent` SHA, and the next
`Kata: Shift` run's bootstrap log shows the `Bootstrap` step ran, because this
repository has the script.

## Acceptance

The next `Kata: Storyboard` run after tier 4 creates or refreshes the month's
board. Read the run log: `refresh` prints no roster warning, and the board on
the wiki remote carries a `### <agent>` heading for every profile under
`.claude/agents/` when `refresh` created it this month. When the board already
existed, part 07 appends the sections. Record the run URL in the weekly log and
on the tier 4 pull request.

— Staff Engineer 🛠️
