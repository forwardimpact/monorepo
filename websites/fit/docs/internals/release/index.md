---
title: Homebrew Cask Conventions
description: How Forward Impact's Homebrew tap and publish-brew workflow stay coherent.
toc: false
---

## Overview

The `forwardimpact/homebrew-tap` repository holds seven Homebrew cask
definitions — one per product and one shared `fit-gear` bundle. The
`publish-brew.yml` workflow in the monorepo builds, signs, and uploads release
assets, then opens a PR against the tap to update the cask's `version` and
`sha256`. Every other field in a cask is human-edited in the tap repo and
survives releases unchanged.

## Sed contract

Each release rewrites exactly two lines in one cask file. The workflow's
"Update cask version and sha256" step runs:

```sh
sed -i \
  -e "s|^  version \".*\"|  version \"${VERSION}\"|" \
  -e "s|^  sha256 \".*\"|  sha256 \"${SHA256}\"|" \
  "tap/Casks/${CASK}.rb"
```

The two-space indent and double-quoted value shape are load-bearing — the `sed`
patterns anchor on `^  version "` and `^  sha256 "`. Cask authors must preserve
this shape or the workflow's substitutions will silently miss.

All other authored fields — `url`, `name`, `desc`, `homepage`, `depends_on`,
`app`, `binary`, `livecheck`, `zap` — are never touched by the workflow.

## Cask topology

Six product casks and one shared bundle. No `depends_on cask:` between them —
each is independently installable.

```mermaid
graph TD
    subgraph Products
        pathway[fit-pathway]
        map[fit-map]
        guide[fit-guide]
        landmark[fit-landmark]
        summit[fit-summit]
        outpost[fit-outpost]
    end
    gear[fit-gear]
```

## Binary stanza mapping

Each cask exposes only the executables bundled in its own `.app`. This table is
the authoritative mapping between casks and the CLIs they place on `PATH`.

| Cask | Executables on PATH | Count |
| --- | --- | --- |
| `fit-pathway` | `fit-pathway` | 1 |
| `fit-map` | `fit-map` | 1 |
| `fit-guide` | `fit-guide` | 1 |
| `fit-landmark` | `fit-landmark` | 1 |
| `fit-summit` | `fit-summit` | 1 |
| `fit-outpost` | `fit-outpost` | 1 |
| `fit-gear` | `fit-svcgraph`, `fit-svcmcp`, `fit-svcpathway`, `fit-svctrace`, `fit-svcvector`, `fit-codegen`, `fit-terrain`, `fit-harness`, `fit-doc`, `fit-rc`, `fit-xmr`, `fit-storage`, `fit-logger`, `fit-svscan`, `fit-trace`, `fit-visualize`, `fit-query`, `fit-subjects`, `fit-process-graphs`, `fit-process-resources`, `fit-process-vectors`, `fit-search`, `fit-unary`, `fit-tiktoken`, `fit-download-bundle`, `fit-wiki` | 26 |

When a library or service CLI is added or removed, update
`build/cli-manifest.json` (the single source of truth for the build set, from
which `build-app-gear` now derives the gear bundle's membership) and the
`binary` stanzas in `Casks/fit-gear.rb` in the tap repo. Mark a long-running
service CLI — one whose `bin` starts a server rather than printing `--help` and
exiting — with `"server": true` so the native build still compiles, checksums,
uploads, and bundles it but its per-binary smoke gate skips execution (running
it would hang).

## Livecheck regex pattern

Each cask uses the `:github_releases` strategy with the cask's own download URL
as the source. A per-cask regex anchors to its tag prefix so that only matching
releases trigger a version bump:

```ruby
livecheck do
  url :url
  strategy :github_releases
  regex(/^pathway@v(\d+(?:\.\d+)+)$/i)
end
```

Each cask substitutes its own tag prefix (`pathway`, `map`, `guide`,
`landmark`, `summit`, `outpost`, `gear`).

The `^...$` anchors are essential — without them, a `map@v2.0.0` release would
also match `landmark@v2.0.0` on the shared monorepo releases page.

## App install path

All casks install their `.app` to a `Forward Impact/` subdirectory under
`/Applications/` rather than the top-level folder:

```ruby
app "fit-pathway.app", target: "Forward Impact/fit-pathway.app"
```

Binary stanzas reference this subdirectory:

```ruby
binary "#{appdir}/Forward Impact/fit-pathway.app/Contents/MacOS/fit-pathway"
```

Grouping keeps seven `.app` bundles visually together in Finder instead of
scattered among unrelated applications.

## Zap and uninstall paths

Each cask declares a `zap trash:` stanza that removes its preferences plist on
`brew zap`:

| Cask | Zap path |
| --- | --- |
| `fit-pathway` | `~/Library/Preferences/team.forwardimpact.pathway.plist` |
| `fit-map` | `~/Library/Preferences/team.forwardimpact.map.plist` |
| `fit-guide` | `~/Library/Preferences/team.forwardimpact.guide.plist` |
| `fit-landmark` | `~/Library/Preferences/team.forwardimpact.landmark.plist` |
| `fit-summit` | `~/Library/Preferences/team.forwardimpact.summit.plist` |
| `fit-outpost` | `~/Library/Preferences/team.forwardimpact.outpost.plist` |
| `fit-gear` | `~/Library/Preferences/team.forwardimpact.gear.plist` |

## Verification commands

Before merging a tap PR that modifies cask structure (not the automated
version/sha256 updates), run:

```sh
brew style Casks/*.rb
brew audit --new-cask Casks/{cask}.rb
```

To dry-run the workflow's sed contract locally against a cask:

```sh
sed -i \
  -e "s|^  version \".*\"|  version \"9.9.9\"|" \
  -e "s|^  sha256 \".*\"|  sha256 \"$(printf 'test' | shasum -a 256 | awk '{print $1}')\"|" \
  "Casks/fit-pathway.rb"
```

On macOS, use `gsed` (GNU sed) instead of the default BSD `sed`, which requires
a backup suffix with `-i`.

## What's next

<div class="grid">

<!-- part:card:../operations -->

<!-- part:card:../kata -->

</div>
