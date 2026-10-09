# Plan 2370-a Part 03: The release train and this repository's repins

The releases between part 01's library change and a runner that holds it.
CONTRIBUTING.md § Releasing defines the tiers. Tags come from `Release: Tag`,
and its `release-tagger` action moves the `v1` alias. A runner's bare
`gemba-xmr` and `gemba-wiki` are the gear binaries the bootstrap installs, so
this train is what moves a scheduled run onto the new contract.

Depends on: part 02 merged. Route: `release-engineer`.

**Version numbers below are expected values** above `libxmr@v3.0.2`,
`libwiki@v0.3.4`, `gemba@v0.1.7`, `gear@v0.3.10`, `gemba-bootstrap` v1.0.23,
and `kata-agent` v1.0.14 at plan time. Spec 2390's part 02 runs the same chain
and may land first. The tag space is append-only: take the next number above
the highest tag at cut time and carry it into every later tier. `libxmr` is
post-1.0 and this change is breaking, so it takes a major.

The gear release ships linux-x64 assets (`fit-install.sh` line 110); on
macOS the installer takes gear from the Homebrew cask. The two binary probes
below run on a linux-x64 host that carries no prior `gemba-xmr` or
`gemba-wiki` on PATH, because the installer returns early for a name
`command -v` already finds (lines 280-283). The expected gear tag is the
next patch above the highest `gear@v*` tag at cut time (`gear@v0.3.10` at
plan time, so `gear@v0.3.11`); tier 2's title and default follow the real
tag.

## Tier 1: The packages and the gear bundle

Publish the library and the bundle that carries it.

Modified: `libraries/libxmr/package.json` (`4.0.0`),
`libraries/libwiki/package.json` (version and the `@forwardimpact/libxmr`
range to `^4.0.0`), `products/gemba/package.json` (version and the same
range), `products/gear/package.json`, the lockfile, on `main`.

1. Run `kata-release-cut` on `main` through its version sweep and bump edits
   only. The sweep names `libxmr`, `libwiki`, and `gemba`. For `libxmr` run
   `npm version major --no-git-tag-version`. Per the skill's major rule, first
   move the two cross-workspace ranges
   (`rg -n '"@forwardimpact/libxmr"' --glob package.json`) to `^4.0.0`.
2. Set `products/gear/package.json` to the next patch.
3. Run the install, `bun run check`, and `bun run test`. Commit the bumps and
   push them to `main`.
4. Dispatch `Release: Tag` with
   `tags: libxmr@v4.0.0 libwiki@v0.3.5 gemba@v0.1.8 gear@v0.3.11` plus any
   other tag the sweep produced. Leave `repo` and `sha` empty.

Verify: `Publish: Package` is green on the three package tags, and
`npm view @forwardimpact/libwiki@0.3.5 dependencies` shows
`@forwardimpact/libxmr: ^4.0.0`. `Publish: Binaries` is green on the gear tag.
On the probe host, install the release with
`FIT_GEAR_RELEASE=gear@v0.3.11 bash products/gemba/actions/gemba-bootstrap/fit-install.sh --only gemba-xmr gemba-wiki`
(the assets ship as `<name>-<target>`; the installer writes them under their
bare names into its prefix `bin`, which the probe host adds to PATH). Then:

```sh
printf 'date,metric,value,unit,run,note,event_type,host_run\n2026-01-01,m,1,count,,,nightly-review,local\n2026-01-02,m,2,count,,,weekly-audit,local\n' > /tmp/two-slices.csv
gemba-xmr list /tmp/two-slices.csv   # exit 2; names nightly-review and weekly-audit
```

## Tier 2: The installer default and `gemba-bootstrap`

Point the installer at the new bundle.

Modified: `products/gemba/actions/gemba-bootstrap/fit-install.sh`

1. On a branch, set the `FIT_GEAR_RELEASE` default to the gear tag from tier 1.
2. Open the pull request
   `chore(gemba-bootstrap): default the installer to gear@v0.3.11 (#2370)`.
   Merge on green, and wait for `Publish: Actions` to mirror
   `products/gemba/actions/gemba-bootstrap/` to the sibling.
3. Read the sibling's `main` SHA from the mirror run's log. Dispatch
   `Release: Tag` with `repo: gemba-bootstrap`, `tags: v1.0.24`, and that SHA.

Verify: `gh api repos/forwardimpact/gemba-bootstrap/tags --jq '.[0].name'`
prints the new tag, and `fit-install.sh` at that tag reads the tier 1 gear tag.

## Tier 3: `kata-agent` repins the bootstrap

Carry the installer into the action every installation runs.

Modified: `products/kata/actions/kata-agent/action.yml` (the
`forwardimpact/gemba-bootstrap@` line only)

1. On a branch, set the bootstrap `uses:` SHA to the sibling SHA tier 2 step 3
   passed to `Release: Tag` and its comment to the tier 2 tag.
2. Open the pull request
   `chore(kata-agent): repin gemba-bootstrap to v1.0.24 (#2370)`. Merge on
   green, and wait for the mirror.
3. Dispatch `Release: Tag` with `repo: kata-agent`, `tags: v1.0.15`, and the
   sibling's `main` SHA.

Verify: `gh api repos/forwardimpact/kata-agent/tags --jq '.[0].name'` prints
the new tag.

## Tier 4: This repository's agent workflows

Repin this repository's four agent workflows so their refresh renders the new
contract.

Modified: `.github/workflows/kata-shift.yml`,
`.github/workflows/kata-dispatch.yml`, `.github/workflows/kata-storyboard.yml`,
`.github/workflows/kata-coaching.yml` (the `forwardimpact/kata-agent@` line in
each)

1. On a branch, set each `uses:` SHA to the sibling SHA tier 3 step 3 passed to
   `Release: Tag` and its comment to the tier 3 tag. The files keep their old
   names here; part 04 renames them.
2. Open the pull request `chore(ci): repin kata-agent to v1.0.15 (#2370)`.
   Merge on green.

Every other `gemba-bootstrap` pin in `.github/workflows` stays (the `check-*`,
`eval-*`, `publish-*`, `package-*`, `website*`, `curate-wiki`, and
`outpost-determinism-probe` workflows). None of those jobs renders a board,
and Dependabot moves them.

Verify: `grep -h 'kata-agent@' .github/workflows/kata-*.yml | sort -u` prints
one line with the tier 3 SHA. Then prove the runner's binary renders the new
contract without a facilitated session and without touching the live wiki.
The compiled gear binary takes its working directory as the project root, so
a scratch directory that holds a copy of `wiki/` isolates the refresh's claim
sweep, its issue-list renders, and its CSV reads. The probe host is the
Linux host from tier 1 with the installed `gemba-wiki` on PATH and a clone
of this wiki (`git clone git@github.com:forwardimpact/monorepo.wiki.git wiki`
when the host has none). The refresh spawns `gh` for the issue-list blocks;
a failed query and a missing `gh` both degrade to an empty list, so `gh`
and its auth are not prerequisites:

```sh
mkdir -p /tmp/w2370 && cp -R wiki /tmp/w2370/wiki
cd /tmp/w2370
newest="$(ls wiki/storyboard-*.md | sort | tail -1)"
cp "$newest" wiki/storyboard-scratch.md
sed -i 's|\(<!-- xmr:prs_merged:[^ ]*\)|\1 event_type=kata-shift|' wiki/storyboard-scratch.md
gemba-wiki refresh wiki/storyboard-scratch.md
awk '/<!-- xmr:prs_merged:/,/<!-- \/xmr -->/' wiki/storyboard-scratch.md
cd - && rm -rf /tmp/w2370
```

The `awk` prints the one tokenised block: it holds a chart fence (or the
insufficient-data line) and no `XmR block not rendered` line. The board's
other markers carry no token and several sit over multi-slice files, so
their blocks render the P3 notice by design; the check reads only the
`prs_merged` block.

## Hand-off

After tier 4 merges: comment on the tier 4 pull request that part 04 is
unblocked for `staff-engineer`.
