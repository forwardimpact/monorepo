# Spec 0740 — Seed `forwardimpact/homebrew-tap` with initial casks

## Problem

The `forwardimpact/homebrew-tap` repository exists (created 2026-04-23) but
holds **zero casks**: empty default branch, no `Casks/` directory, no
conventions doc. Every brew publish run in `.github/workflows/publish-brew.yml`
fails downstream of this gap:

- The `tap-pr` job at lines 210–213 runs `sed -i` against `tap/Casks/${CASK}.rb`
  to rewrite the `version` and `sha256` fields. No file exists at that path, so
  the sed step targets a missing file and the job errors.
- The workflow's tag filter on lines 9–16 covers seven bundles — `outpost`,
  `guide`, `landmark`, `map`, `pathway`, `summit`, `gear` — all of which require
  a corresponding `Casks/{cask}.rb` to be updateable on release.
- Issue #627 documents 20+ consecutive brew-publish failures (earliest visible:
  2026-04-28; most recent: 2026-04-30 21:35Z) for all five product publishes
  attempted to date. The runtime `__dirname`/bunfs failure that #627 names is
  one cause; the empty tap is a second, independent cause that #627 did not
  surface because the smoke test fails first.

The first cask authored sets the precedent the next six inherit. The livecheck
regex shape against the `<bundle>@v<semver>` tag scheme and the binary stanzas
that surface every CLI on PATH are cross-cutting first-mover decisions.
Authoring them once, in concert, is qualitatively different from copy-pasting an
existing template — there is no template yet.

## Why

Two distribution promises are unmet until the tap is seeded:

1. **Spec 0600 SC11.** After the documented `brew install` command for any
   product cask runs on a clean macOS arm64 machine, every `fit-*` CLI surfaced
   by that product is on the user's `PATH` and answers `--help`. The shared
   `fit-gear` bundle is independently installable for users who also want the
   service and library CLIs. Today no `brew install` command resolves at all —
   the tap has no casks to install.
2. **Issue #625 8b–8d.** The Outpost rename's cross-repo follow-ups (tag, npm
   deprecate, release notes) are blocked behind this spec's tap seeding.

Seeding the tap also retires a class of confusion. The publish-brew workflow's
existing comment ("the rest of the cask body — depends_on graph, binary stanzas,
livecheck regex — lives in the tap repo and is edited there by humans when
bundle contents change") presumes a tap whose casks already encode those
decisions. Until the tap is seeded, that comment describes a contract no party
can fulfill.

## Scope

### In scope

- Authoring seven casks in `forwardimpact/homebrew-tap`, written in concert so
  the livecheck strategy, binary stanzas, zap/uninstall paths, and the
  publish-brew sed contract are consistent across all of them.
- A cask conventions document inside the monorepo, under
  `websites/fit/docs/internals/release/`. The tap repo's README links to it but
  does not duplicate it. Rationale: the conventions describe an artifact whose
  bytes are written by `.github/workflows/publish-brew.yml` living in this repo;
  the conventions decay together with the workflow when either changes, and
  review of a workflow PR co-locates with review of the conventions PR. Exact
  filename and any further sub-pathing are plan-level decisions.

### Out of scope

- The runtime `__dirname`/bunfs fix tracked in #627. That is a substantive
  change to product `bin/*.js` and `libcli`. This spec and #627 are independent:
  both are required for end-to-end brew publish to work, but they touch disjoint
  artifacts (tap repo state vs. monorepo runtime code) and can proceed in
  parallel. Neither blocks the other's design or implementation.
- Tagging `outpost@v3.0.0` (#625 phase 8b) and the npm deprecation (#625 phase
  8c). Those depend on this spec landing but are not its work product.
- The TCC re-authorization release notes (#625 phase 8d). Released-notes
  copywriting is downstream of the cask landing.
- Linux or Intel-Mac casks. Spec 0600 fixed the channel as macOS arm64 only;
  this spec inherits that constraint without revisiting it.
- Multi-version installation (`brew install fit-pathway@<old>`). Each cask
  serves the latest released version per the sed-in-place workflow. Multi-tag
  archival is a follow-up if needed.
- Tap-side CI for the casks themselves (`brew style`, `brew audit`). The
  conventions doc names the commands a human reviewer should run; automating
  them in the tap repo is a follow-up.

### Affected products

All seven bundles whose tags `publish-brew.yml` accepts:

| Tag prefix    | Cask name      | Bundle           | App on disk      |
| ------------- | -------------- | ---------------- | ---------------- |
| `pathway@v*`  | `fit-pathway`  | product          | `fit-pathway.app`|
| `map@v*`      | `fit-map`      | product          | `fit-map.app`    |
| `guide@v*`    | `fit-guide`    | product          | `fit-guide.app`  |
| `landmark@v*` | `fit-landmark` | product          | `fit-landmark.app`|
| `summit@v*`   | `fit-summit`   | product          | `fit-summit.app` |
| `outpost@v*`  | `fit-outpost`  | product          | `fit-outpost.app`|
| `gear@v*`     | `fit-gear`     | shared           | `fit-gear.app`   |

## Success criteria

Each criterion below is verifiable from the seeded state of the tap repo and the
in-monorepo conventions doc, without requiring any product to be tagged or any
unrelated runtime fix to land first.

| Claim                                                                                                                                                                                                                            | Verifiable by                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every bundle that `publish-brew.yml` accepts has a corresponding cask in the tap.                                                                                                                                                 | `gh api repos/forwardimpact/homebrew-tap/contents/Casks` returns seven entries matching the table above.                                                                                                                                                                                                                                                  |
| The `tap-pr` job's sed step (lines 210–213 of `publish-brew.yml`) succeeds against every live cask without manual edits.                                                                                                         | A dry-run of the workflow's sed substitutions executed against each live cask file modifies exactly one occurrence per field; the resulting cask still parses under `brew style`.                                                                                                                                                                         |
| Each live cask passes Homebrew's authoring checks.                                                                                                                                                                               | `brew style Casks/*.rb` exits 0 against the seeded tap and `brew audit --new-cask Casks/{cask}.rb` exits 0 for each live cask.                                                                                                                                                                                                                            |
| For each cask, the executable names it advertises match the executable names produced by that cask's source bundle.                                                                                                               | A static cross-check between each cask file and the corresponding product or gear bundle's declared executables (e.g. `package.json` `bin` entries or the `just build-binary` invocations) shows the cask advertises exactly those names with no extras. Performed at seed time, before any tag is pushed.                                                |
| The conventions doc covers every cross-cutting decision named in the In-scope section.                                                                                                                                           | A document under `websites/fit/docs/internals/release/` exists, is linked from the release-internals index and the tap repo's `README.md`, and addresses each cross-cutting decision the In-scope section names. The document's structure is a plan-level decision; the contract is coverage, not heading shape.                                          |

## Notes

- Bundle naming is fixed by `publish-brew.yml` lines 33–37 (the per-tag `case`
  selecting `BUNDLE` and `CASK`); asset naming is fixed at line 120
  (`{cask}-{version}-darwin-arm64.zip`). Each cask's release-asset URL template
  must resolve to that filename on the GitHub release for the corresponding tag.
- The publish-brew workflow rewrites only the version and the sha256 fields in
  each cask. Every other authored field is human-edited in the tap repo and
  survives releases unchanged. Casks must be authored with that asymmetry in
  mind.
- This spec lives in the monorepo because the design and plan that follow
  describe how monorepo conventions and tap conventions stay coherent. The
  resulting cask files land in `forwardimpact/homebrew-tap`, which is outside
  the spec/design/plan/implement chain's normal merge path. The plan must
  account for that boundary.

## References

- Issue #645 — this work item, with the four open questions this spec answers.
- Issue #625 — Outpost rename Phase 8 (8a/8b/8c/8d blocked behind this spec).
- Issue #627 — runtime `__dirname`/bunfs failure (independent, parallel).
- Spec 0600 — Native binary distribution (parent; SC11 is the install-surface
  contract this spec realizes). Spec 0600 deferred "Tap repository location";
  the choice — separate `forwardimpact/homebrew-tap` repo — was made when the
  publish-brew workflow was authored against that path. This spec inherits that
  choice rather than revisiting it.
- `.github/workflows/publish-brew.yml` — workflow whose sed contract every cask
  must satisfy.

— Product Manager 🌱
