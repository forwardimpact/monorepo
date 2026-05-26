# State of Spec 0740 — Complete the Homebrew Distribution Channel

Research date: 2026-05-04

## Executive Summary

Spec 0740 has three goals: (1) seed the tap, (2) consolidate shared bundles into
`fit-gear`, and (3) document the brew install path on product pages. The tap is
now seeded — `forwardimpact/homebrew-tap` contains 7 cask files reflecting the
gear consolidation. But the monorepo side is not yet updated: `publish-brew.yml`
still accepts `services@v*` and `utilities@v*` tags (not `gear@v*`), the
justfile still has separate `build-app-services` / `build-app-utilities`
recipes, and no product overview page documents `brew install`. PR #648 is open
with `hold` label, pending design/plan approval for the remaining monorepo
changes. Two independent bugs (#627, #647) also block end-to-end success.

## Spec 0600 Implementation Status

### Step 1a — `libraries/libmacos` extraction: COMPLETE

All files present and functional:
- `src/posix-spawn.js`, `src/tcc-responsibility.js`, `src/index.js`
- `scripts/build-app.sh`, `scripts/sign-app.sh`
- `templates/entitlements.plist`, `templates/entitlements-gui.plist`,
  `templates/Info.plist.hbs`
- `test/tcc-responsibility.test.js`
- Outpost migrated to consume libmacos

### Step 1b — Root justfile bundle recipes: COMPLETE

All recipes exist under `# ── Bundles` in the root `justfile`:

- `build-binary NAME TARGET` — generic, scans `package.json` bin fields
- `build-product-binaries` — 6 products (outpost, guide, landmark, map,
  pathway, summit)
- `build-service-binaries` — 5 gRPC servers (fit-svc{graph,mcp,pathway,trace,
  vector})
- `build-utility-binaries` — 20 library CLIs
- `build-app-product NAME`, `build-app-services`, `build-app-utilities`
- `build-apps` — fan-out for all 8 bundles

**Note:** The justfile still has separate `build-app-services` and
`build-app-utilities` recipes. Spec 0740 requires consolidating these into a
single gear bundle recipe. This is monorepo-side work that has not happened yet.

Per-bundle metadata exists:
- `products/{guide,landmark,map,pathway,summit}/macos/{Info.plist,
  entitlements.plist}`
- `products/outpost/macos/{Info.plist,Outpost.entitlements}`
- `macos/services/{Info.plist,entitlements.plist}`
- `macos/libraries/{Info.plist,entitlements.plist}`

### Step 2 — Release workflow: COMPLETE (but needs gear update)

`.github/workflows/publish-brew.yml` exists with:
- Tag filter: 8 explicit patterns (`outpost@v*`, `guide@v*`, `landmark@v*`,
  `map@v*`, `pathway@v*`, `summit@v*`, `services@v*`, `utilities@v*`)
- `build` job (macos-14): compile, codesign, cdhash stability gate, ditto zip,
  sha256 sidecar, gh release create/upload
- `tap-pr` job (ubuntu-latest): downloads sha256, checks out
  `forwardimpact/homebrew-tap`, updates `version` and `sha256` via `sed -i`,
  opens PR

**Mismatch:** The workflow accepts `services@v*` and `utilities@v*` tags and
maps them to `fit-services` / `fit-utilities` cask names. But the tap now has
`fit-gear.rb` — not `fit-services.rb` or `fit-utilities.rb`. The workflow does
not yet accept `gear@v*`. This is spec 0740 SC6 work.

The sed contract the casks must satisfy:
```
sed -i \
  -e "s|^  version \".*\"|  version \"${VERSION}\"|" \
  -e "s|^  sha256 \".*\"|  sha256 \"${SHA256}\"|" \
  "tap/Casks/${CASK}.rb"
```

### Step 2b — Outpost TCC verification: NO EVIDENCE

No explicit record of the manual hardware TCC test. The TCC responsibility
chain should be verified against the Outpost bundle identity before the first
`outpost@v*` tag.

### Step 3 — Homebrew tap repository: SEEDED

`forwardimpact/homebrew-tap` was seeded on 2026-05-04 with 7 cask files:

| Cask file          | Type       | CLIs on PATH |
| ------------------ | ---------- | ------------ |
| `fit-pathway.rb`   | product    | 1            |
| `fit-map.rb`       | product    | 1            |
| `fit-guide.rb`     | product    | 1            |
| `fit-landmark.rb`  | product    | 1            |
| `fit-summit.rb`    | product    | 1            |
| `fit-outpost.rb`   | product    | 1            |
| `fit-gear.rb`      | shared     | 25           |

All casks use placeholder version `0.0.0` and zero sha256. The `fit-gear` cask
contains 5 gRPC service binaries and 20 library CLI binaries. No
`depends_on cask:` between casks — all are independently installable.

The commit message: "feat: seed tap with initial casks".

### Step 4 — Product overview documentation: NOT DONE

No product overview page has a brew install section:
- `websites/fit/pathway/index.md` — npm only
- `websites/fit/guide/index.md` — npm only
- `websites/fit/landmark/index.md` — npm only
- `websites/fit/map/index.md` — npm only
- `websites/fit/summit/index.md` — npm only
- `websites/fit/outpost/index.md` — mentions Homebrew only for Claude Code
  prerequisite, not for Outpost itself

No Gatekeeper caveat documented. No codegen internals page update.

The conventions doc location `websites/fit/docs/internals/release/` does not
exist yet.

## Spec 0740 Current State

### PR #648

- Branch: `spec/730-seed-homebrew-tap`
- Status: **OPEN**, label `hold`
- `spec:approved` but merge blocked by hold
- Hold reason: project owner will return with a "new framing of fit-utilities"
  that may reshape the spec's scope

**Update:** The "new framing" has landed — the spec was updated to consolidate
`fit-services` and `fit-utilities` into `fit-gear`. The tap was seeded
externally with the gear-based cask layout. The spec now describes itself as
"Complete the Homebrew Distribution Channel" with three goals: gear
consolidation in the monorepo, tap seeding (done), and documentation.

### What spec 0740 covers (updated)

Seven cask files for the tap repo (already seeded):
1. `fit-pathway.rb` — product cask
2. `fit-map.rb` — product cask
3. `fit-guide.rb` — product cask
4. `fit-landmark.rb` — product cask
5. `fit-summit.rb` — product cask
6. `fit-outpost.rb` — product cask
7. `fit-gear.rb` — shared bundle (5 gRPC servers + 20 library CLIs)

Plus monorepo changes:
- Consolidate `build-app-services` / `build-app-utilities` into gear
- Update `publish-brew.yml` tag filter: add `gear@v*`, remove `services@v*`
  and `utilities@v*`
- Update `macos/` metadata directories for the gear bundle
- Product overview brew install documentation
- Cask conventions document in `websites/fit/docs/internals/release/`

### What spec 0740 does NOT cover

- Runtime `__dirname`/bunfs fix (#627) — separate, parallel work
- VERSION injection for library/service bins (#647) — follow-on to #627
- Tagging `outpost@v3.0.0` (#625 phase 8b)
- npm deprecation of `@forwardimpact/basecamp` (#625 phase 8c)
- TCC re-authorization release notes (#625 phase 8d)
- Tap-side CI (`brew style`, `brew audit`)

## Open Issues

### #645 — Seed forwardimpact/homebrew-tap with initial casks: CLOSED

Resolved by the tap seeding commit. The tap now contains 8 cask files.

### #625 — Outpost rename: Phase 8 cross-repo follow-ups: OPEN

Phases 8b–8d status:
- **8b**: Tag `outpost@v3.0.0`, verify publish-brew + publish-macos — blocked
  by workflow gear consolidation
- **8c**: `npm deprecate @forwardimpact/basecamp` — independent, can proceed
- **8d**: Release notes for outpost v3.0.0 — blocked by 8b

### #627 — Brew publish smoke test fails on bun --compile + readFileSync: OPEN

All product brew publishes have been failing since ~2026-04-28. Compiled
binaries resolve `__dirname` to `/$bunfs/root`, causing
`readFileSync(join(__dirname, "..", "package.json"))` to ENOENT.

Fix: inject VERSION at compile time via `--define`.

- Fix PR: #646 (open, fixes 5 product CLIs — outpost, guide, landmark, map,
  pathway, summit)

### #647 — Apply VERSION-injection pattern to library and service CLI bins: OPEN

Same `__dirname`/bunfs pattern in ~20 library/service CLI bins. Lower priority
since `gear@v*` tags are cut less frequently.

- Fix PR: #650 (open, depends on #646 merging first)

## Open PRs

| PR   | Title                                     | Branch                            | Status        |
| ---- | ----------------------------------------- | --------------------------------- | ------------- |
| #648 | spec(0740): seed homebrew-tap              | `spec/730-seed-homebrew-tap`      | Open, on hold |
| #646 | fix: inject VERSION at compile time       | `fix/brew-bunfs-version-injection`| Open          |
| #650 | fix: VERSION injection for library bins   | `fix/647-version-injection-lib..` | Open          |

PR #607 (plan(0700): git-installable pack repos) has been **merged**.

## Dependency Graph

```
Tap seeding (#645): DONE
  └─ Monorepo gear consolidation (spec 0740 — workflow + justfile + metadata)
       └─ #625 phases 8b–8d (outpost rename cross-repo)

bunfs __dirname (#627)
  └─ PR #646 (product CLIs)
       └─ #647 → PR #650 (library/service CLIs)

Both the gear consolidation and #627 must resolve for end-to-end brew
publish to work. They are independent and can proceed in parallel.

Spec 0600 Step 4 (docs) is independent of both — can start once the
gear consolidation confirms the final cask/tag names.
```

## Executable Surface Cross-Reference

The casks already advertise the executables each bundle produces. The tap-side
casks are authoritative; the monorepo justfile recipes are the source of truth
for which binaries get compiled.

### Product bundles (one CLI each)

| Bundle           | Executable     |
| ---------------- | -------------- |
| fit-outpost.app  | fit-outpost    |
| fit-guide.app    | fit-guide      |
| fit-landmark.app | fit-landmark   |
| fit-map.app      | fit-map        |
| fit-pathway.app  | fit-pathway    |
| fit-summit.app   | fit-summit     |

### fit-gear.app (25 CLIs)

**gRPC services (5):** fit-svcgraph, fit-svcmcp, fit-svcpathway, fit-svctrace,
fit-svcvector

**Library CLIs (20):** fit-codegen, fit-terrain, fit-eval, fit-doc, fit-rc,
fit-xmr, fit-storage, fit-logger, fit-svscan, fit-trace, fit-visualize,
fit-query, fit-subjects, fit-process-graphs, fit-process-resources,
fit-process-vectors, fit-search, fit-unary, fit-tiktoken, fit-download-bundle

## Gaps to Close for Full Spec 0600 + 0740 Completion

### Must-have (blocks end-to-end brew install)

1. ~~**Seed the tap** (spec 0740)~~: **DONE.** 7 cask files landed in
   `forwardimpact/homebrew-tap`.
2. **Consolidate monorepo build to gear** (spec 0740): Update
   `publish-brew.yml` tag filter (`gear@v*` replaces `services@v*` +
   `utilities@v*`), consolidate justfile bundle recipes, update `macos/`
   metadata.
3. **Fix bunfs __dirname** (#627): Merge PR #646 so product binaries resolve
   `--version` without ENOENT.
4. **Fix library/service __dirname** (#647): Merge PR #650 so `gear@v*`
   binaries also work.
5. **Add `HOMEBREW_TAP_PAT` secret** to the monorepo. Must exist before the
   first release tag triggers the workflow.

### Should-have (spec 0600 completeness)

6. **Product overview documentation** (spec 0600 step 4 / spec 0740 SC8): Add
   brew install sections with Gatekeeper caveat to all 6 product overview
   pages.
7. **Cask conventions document** (spec 0740 SC9): Author
   `websites/fit/docs/internals/release/` conventions page.
8. **TCC verification** (spec 0600 step 2b): Perform manual hardware test of
   Outpost bundle's Calendar/Contacts TCC chain before first `outpost@v*` tag.
