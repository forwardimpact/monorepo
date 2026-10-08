# Plan 2390-a Part 02: The release chain and this repository's repins

The releases between part 01's library change and a runner that holds it, and
the repins that let an installation's regenerated workflows carry it.
CONTRIBUTING.md § Releasing defines the tiers. Tags come from `Release: Tag`,
and its `release-tagger` action moves the `v1` alias.

Depends on: part 01 merged. Route: `release-engineer`.

**Version numbers below are the expected next patch** above `libwiki@v0.3.4`,
`gemba@v0.1.7`, `gear@v0.3.10`, `gemba-bootstrap` v1.0.23, and `kata-agent`
v1.0.14. Pre-1.0 packages bump patch for any change. The tag space is
append-only. If an unrelated release lands first, take the next patch above the
current highest tag, and carry that number into every later tier.

## Tier 1: Publish the packages and cut the gear bundle

The `gemba-wiki` binary a runner installs comes from the gear release, and the
operator's own `gemba-wiki` comes from npm.

Modified: the `version` fields the sweep names (at least
`libraries/libwiki/package.json` and `products/gemba/package.json`),
`products/gear/package.json`, and the lockfile, on `main`.

1. Run `kata-release-cut` on `main` through its version sweep and its bump
   edits only. Its sweep names `libwiki` and `gemba`. Steps 3 and 4 below
   replace the skill's own commit and tag steps.
2. Set the `version` field of `products/gear/package.json` to `0.3.11`.
3. Commit the bumps and push them to `main`.
4. Dispatch `Release: Tag` with `tags: libwiki@v0.3.5 gemba@v0.1.8 gear@v0.3.11`
   plus any other tag the sweep produced. Leave `repo` and `sha` empty.

Verify: `Publish: Package` is green on the `libwiki` and `gemba` tags, and
`npm view @forwardimpact/libwiki@0.3.5 version` prints `0.3.5`.
`Publish: Binaries` is green on `gear@v0.3.11`, and the release carries
`gemba-wiki-*` assets with `.sha256` sidecars. One asset for the runner's
platform, run with `push --help`, lists `--remove`.

## Tier 2: Move the installer default and cut `gemba-bootstrap`

Modified: `products/gemba/actions/gemba-bootstrap/fit-install.sh`

1. On a branch, set the `FIT_GEAR_RELEASE` default to `gear@v0.3.11`.
2. Open the pull request with title
   `chore(gemba-bootstrap): default the installer to gear@v0.3.11 (#2390)`.
   Merge on green, and wait for `Publish: Actions` to mirror
   `products/gemba/actions/gemba-bootstrap/` to the sibling.
3. Read the sibling's `main` SHA from the mirror run's log. Dispatch
   `Release: Tag` with `repo: gemba-bootstrap`, `tags: v1.0.24`, and that SHA.

Verify: `gh api repos/forwardimpact/gemba-bootstrap/tags --jq '.[0].name'`
prints `v1.0.24`, and `fit-install.sh` at that tag reads `gear@v0.3.11`.

## Tier 3: Repin the bootstrap inside `kata-agent` and cut it

Modified: `products/kata/actions/kata-agent/action.yml` (the
`forwardimpact/gemba-bootstrap@` line only)

1. On a branch, set the bootstrap `uses:` SHA to the `v1.0.24` commit and its
   comment to `# v1.0.24`.
2. Open the pull request with title
   `chore(kata-agent): pin gemba-bootstrap v1.0.24 (#2390)`. Merge on green, and
   wait for `Publish: Actions` to mirror `products/kata/actions/kata-agent/`.
3. Read the sibling's `main` SHA from the run log. Dispatch `Release: Tag` with
   `repo: kata-agent`, `tags: v1.0.15`, and that SHA.

Verify: `gh api repos/forwardimpact/kata-agent/tags --jq '.[0].name'` prints
`v1.0.15`, and `action.yml` at that tag pins `gemba-bootstrap` at `v1.0.24`.

## Tier 4: Repin this repository's workflows

The four agent workflows take `kata-agent`, and the daily audit takes the
bootstrap directly.

Modified: `.github/workflows/kata-dispatch.yml`,
`.github/workflows/kata-shift.yml`, `.github/workflows/kata-storyboard.yml`,
`.github/workflows/kata-coaching.yml`, `.github/workflows/curate-wiki.yml`

1. In the four `kata-*` files, set the `forwardimpact/kata-agent@` SHA to the
   `v1.0.15` commit and the comment to `# v1.0.15`.
2. In `curate-wiki.yml`, set the `forwardimpact/gemba-bootstrap@` SHA to the
   `v1.0.24` commit and the comment to `# v1.0.24`.
3. Open the pull request with title
   `chore(workflows): repin kata-agent v1.0.15 and the wiki audit's bootstrap (#2390)`,
   and merge on green.

Verify: `rg -n --hidden 'kata-agent@' .github/workflows` shows one SHA with
`# v1.0.15` in all four files, and
`rg -n 'gemba-bootstrap@' .github/workflows/curate-wiki.yml` shows `# v1.0.24`.
The `gemba-wiki` asset from `gear@v0.3.11`, run as
`gemba-wiki audit --format json --wiki-root <dir>` on a scratch `git init` wiki
that holds a committed `STATUS.tsv`, reports no finding whose path names
`STATUS.tsv`. A green `Curate wiki` run proves nothing here, because
`gemba-wiki curate` exits 0 on a dirty audit.

## Hand-off

After tier 4 merges, post one comment on part 01's merged pull request. It
names the `gear@v0.3.11` tag commit and the tier 4 merge commit, which S19
checks against part 03's merge, and it hands part 03 to `staff-engineer`.

Verify: the comment exists, and both SHAs resolve on `forwardimpact/monorepo`.

— Staff Engineer 🛠️
