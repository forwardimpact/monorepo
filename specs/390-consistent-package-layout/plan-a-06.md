# Plan A — Part 06: Libraries tier A (published subpath exports)

Migrate the 14 libraries that publish one or more subpath exports. These carry
the highest blast radius because a missed key in the `exports` rewrite breaks
downstream consumers silently at import time. Part 06 is split from Part 07
because the per-library diff is bigger and a reviewer benefits from seeing these
first as a standalone commit.

## Libraries in tier A

| Library            |                                Root source files | Non-conforming root subdirs | Subpath keys |
| ------------------ | -----------------------------------------------: | --------------------------- | -----------: |
| libdoc             |  builder.js, frontmatter.js, index.js, server.js | —                           |            4 |
| libgraph           |                          index.js, serializer.js | index/, processor/          |            3 |
| libmemory          |                              index.js, models.js | index/                      |            2 |
| libprompt          |                              index.js, loader.js | —                           |            2 |
| libresource        | index.js, parser.js, sanitizer.js, skolemizer.js | processor/                  |            4 |
| libskill           |                                   20 `.js` files | policies/                   |           13 |
| libsyntheticgen    |                          index.js, vocabulary.js | dsl/, engine/, tools/       |           11 |
| libsyntheticprose  |                                         index.js | engine/, prompts/           |            3 |
| libsyntheticrender |                                    5 `.js` files | render/, templates/         |            8 |
| libtelemetry       |                                    7 `.js` files | index/                      |            4 |
| libtemplate        |                              index.js, loader.js | —                           |            2 |
| libtool            |                              index.js, schema.js | processor/                  |            2 |
| libui              |                                   12 `.js` files | components/, css/           |           15 |
| libuniverse        |                   index.js, load.js, pipeline.js | —                           |            3 |
| libvector          |                                         index.js | index/, processor/          |            3 |

(libharness tier-A candidate was handled in Part 04.)

**Total: 15 libraries, 79 subpath keys.** Every key's right-hand target is
rewritten from `./foo.js` → `./src/foo.js` or `./<dir>/x.js` →
`./src/<dir>/x.js`.

## Approach

For each library, apply the cross-cutting move recipe from `plan-a.md`:

1. `mkdir -p <pkg>/src`
2. `git mv <pkg>/*.js <pkg>/src/`
3. `git mv <pkg>/<domain-dir>/ <pkg>/src/<domain-dir>/` for each non-conforming
   root subdir.
4. Update `package.json` — rewrite `main`, every `exports` target, and `files`.
5. Rewrite test relative imports (`../foo.js` → `../src/foo.js`).
6. Rewrite bin entry-point imports (`../foo.js` → `../src/foo.js`) if a `bin/`
   directory exists.
7. `bun run node --test <pkg>/test/*.test.js` per library.

Internal relative imports _within_ the moved tree are preserved: files that move
together keep the same relative relationships.

## Per-library specifics

This section is not a line-by-line rewrite — the implementer runs the
cross-cutting recipe and consults the per-library notes below for gotchas and
the pre-move subpath key list (so post-move verification has a checklist).

### libdoc (4 keys)

Current exports:

```jsonc
{
  ".": "./index.js",
  "./builder": "./builder.js",
  "./server": "./server.js",
  "./frontmatter": "./frontmatter.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./builder": "./src/builder.js",
  "./server": "./src/server.js",
  "./frontmatter": "./src/frontmatter.js"
}
```

4 files to move (`builder.js`, `frontmatter.js`, `index.js`, `server.js`) +
`bin/fit-doc.js` stays. Templates directory stays (allowed).

### libgraph (3 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./index/graph.js": "./index/graph.js",
  "./processor/graph.js": "./processor/graph.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./index/graph.js": "./src/index/graph.js",
  "./processor/graph.js": "./src/processor/graph.js"
}
```

The keys include the `.js` suffix — preserve exactly. 2 root `.js` files
(`index.js`, `serializer.js`) + `index/` subdir + `processor/` subdir all move
into `src/`. `bin/` stays.

### libmemory (2 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./index/memory.js": "./index/memory.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./index/memory.js": "./src/index/memory.js"
}
```

2 root files + `index/` subdir + `bin/fit-window.js` (stays).

### libprompt (2 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./loader": "./loader.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./loader": "./src/loader.js"
}
```

2 root files. No subdirs to move.

### libresource (4 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./processor/resource.js": "./processor/resource.js",
  "./parser.js": "./parser.js",
  "./skolemizer.js": "./skolemizer.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./processor/resource.js": "./src/processor/resource.js",
  "./parser.js": "./src/parser.js",
  "./skolemizer.js": "./src/skolemizer.js"
}
```

4 root files (`index.js`, `parser.js`, `sanitizer.js`, `skolemizer.js`) +
`processor/` subdir. `sanitizer.js` is not currently exported but still moves to
`src/` (rule 1: no source at the package root).

### libskill (13 keys) — biggest

Current:

```jsonc
{
  ".": "./index.js",
  "./derivation": "./derivation.js",
  "./modifiers": "./modifiers.js",
  "./agent": "./agent.js",
  "./interview": "./interview.js",
  "./job": "./job.js",
  "./job-cache": "./job-cache.js",
  "./checklist": "./checklist.js",
  "./matching": "./matching.js",
  "./profile": "./profile.js",
  "./progression": "./progression.js",
  "./policies": "./policies/index.js",
  "./toolkit": "./toolkit.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./derivation": "./src/derivation.js",
  "./modifiers": "./src/modifiers.js",
  "./agent": "./src/agent.js",
  "./interview": "./src/interview.js",
  "./job": "./src/job.js",
  "./job-cache": "./src/job-cache.js",
  "./checklist": "./src/checklist.js",
  "./matching": "./src/matching.js",
  "./profile": "./src/profile.js",
  "./progression": "./src/progression.js",
  "./policies": "./src/policies/index.js",
  "./toolkit": "./src/toolkit.js"
}
```

**20 root source files to move** (`agent-stage.js`, `agent-validation.js`,
`agent.js`, `checklist.js`, `derivation-responsibilities.js`,
`derivation-validation.js`, `derivation.js`, `index.js`, `interview-helpers.js`,
`interview-selection.js`, `interview-specialized.js`, `interview.js`,
`job-cache.js`, `job.js`, `matching-development.js`, `matching.js`,
`modifiers.js`, `profile.js`, `progression.js`, `toolkit.js`). Plus `policies/`
subdir (not in the spec's non-conforming table but exists and must move).
`node_modules/` is gitignored and stays.

libskill is a pure-function library (exempt from OO+DI per `CLAUDE.md`). The
move preserves that — no internal style changes. Only files shift.

**Consumer blast radius:** 63 subpath imports across 37 files. Not a single file
edit is required because the specifiers are absorbed by the exports map. Verify
with `bun run test` after the move.

### libsyntheticgen (11 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./dsl": "./dsl/index.js",
  "./engine": "./engine/tier0.js",
  "./engine/entities": "./engine/entities.js",
  "./engine/activity": "./engine/activity.js",
  "./vocabulary": "./vocabulary.js",
  "./vocabulary.js": "./vocabulary.js",
  "./rng": "./engine/rng.js",
  "./tools/faker": "./tools/faker.js",
  "./tools/synthea": "./tools/synthea.js",
  "./tools/sdv": "./tools/sdv.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./dsl": "./src/dsl/index.js",
  "./engine": "./src/engine/tier0.js",
  "./engine/entities": "./src/engine/entities.js",
  "./engine/activity": "./src/engine/activity.js",
  "./vocabulary": "./src/vocabulary.js",
  "./vocabulary.js": "./src/vocabulary.js",
  "./rng": "./src/engine/rng.js",
  "./tools/faker": "./src/tools/faker.js",
  "./tools/synthea": "./src/tools/synthea.js",
  "./tools/sdv": "./src/tools/sdv.js"
}
```

2 root files (`index.js`, `vocabulary.js`) + `dsl/` + `engine/` + `tools/`.
Note: `./vocabulary` and `./vocabulary.js` are two distinct keys pointing at the
same target today — preserve both, same pattern.

### libsyntheticprose (3 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./prose": "./engine/prose.js",
  "./pathway": "./engine/pathway.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./prose": "./src/engine/prose.js",
  "./pathway": "./src/engine/pathway.js"
}
```

1 root file (`index.js`) + `engine/` + `prompts/`.

### libsyntheticrender (8 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./render/html": "./render/html.js",
  "./render/pathway": "./render/pathway.js",
  "./render/raw": "./render/raw.js",
  "./render/markdown": "./render/markdown.js",
  "./render/dataset-renderers": "./render/dataset-renderers.js",
  "./validate": "./validate.js",
  "./format": "./format.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./render/html": "./src/render/html.js",
  "./render/pathway": "./src/render/pathway.js",
  "./render/raw": "./src/render/raw.js",
  "./render/markdown": "./src/render/markdown.js",
  "./render/dataset-renderers": "./src/render/dataset-renderers.js",
  "./validate": "./src/validate.js",
  "./format": "./src/format.js"
}
```

5 root files + `render/` subdir. **`templates/` stays at the root** — it is on
the allowed list. Do not move it into `src/templates/`.

### libtelemetry (4 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./tracer.js": "./tracer.js",
  "./visualizer.js": "./visualizer.js",
  "./index/trace.js": "./index/trace.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./tracer.js": "./src/tracer.js",
  "./visualizer.js": "./src/visualizer.js",
  "./index/trace.js": "./src/index/trace.js"
}
```

7 root files + `index/` subdir. `bin/fit-visualize.js` stays.

### libtemplate (2 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./loader": "./loader.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./loader": "./src/loader.js"
}
```

2 root files, no subdirs.

### libtool (2 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./processor/tool.js": "./processor/tool.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./processor/tool.js": "./src/processor/tool.js"
}
```

2 root files + `processor/`. `bin/fit-process-tools.js` stays.

### libui (15 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./render": "./render.js",
  "./reactive": "./reactive.js",
  "./state": "./state.js",
  "./errors": "./errors.js",
  "./error-boundary": "./error-boundary.js",
  "./router-core": "./router-core.js",
  "./router-pages": "./router-pages.js",
  "./router-slides": "./router-slides.js",
  "./yaml-loader": "./yaml-loader.js",
  "./markdown": "./markdown.js",
  "./utils": "./utils.js",
  "./components": "./components/index.js",
  "./components/*": "./components/*.js",
  "./css/*": "./css/*"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./render": "./src/render.js",
  "./reactive": "./src/reactive.js",
  "./state": "./src/state.js",
  "./errors": "./src/errors.js",
  "./error-boundary": "./src/error-boundary.js",
  "./router-core": "./src/router-core.js",
  "./router-pages": "./src/router-pages.js",
  "./router-slides": "./src/router-slides.js",
  "./yaml-loader": "./src/yaml-loader.js",
  "./markdown": "./src/markdown.js",
  "./utils": "./src/utils.js",
  "./components": "./src/components/index.js",
  "./components/*": "./src/components/*.js",
  "./css/*": "./src/css/*"
}
```

12 root files + `components/` subdir + `css/` subdir. The `./css/*` wildcard
pattern is important — it exposes raw `.css` files, not JS — the rewrite
preserves the wildcard and its suffix. libui is a functional DOM library (exempt
from OO+DI); the move preserves that.

### libuniverse (3 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./pipeline": "./pipeline.js",
  "./load": "./load.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./pipeline": "./src/pipeline.js",
  "./load": "./src/load.js"
}
```

3 root files. `bin/fit-universe.js` stays.

### libvector (3 keys)

Current:

```jsonc
{
  ".": "./index.js",
  "./index/vector.js": "./index/vector.js",
  "./processor/vector.js": "./processor/vector.js"
}
```

Post-move:

```jsonc
{
  ".": "./src/index.js",
  "./index/vector.js": "./src/index/vector.js",
  "./processor/vector.js": "./src/processor/vector.js"
}
```

1 root file + `index/` subdir + `processor/` subdir. `bin/` stays.

## Ordering

Sequence the per-library moves in alphabetical order for a predictable commit
trail. After each library:

1. Update `package.json` (`main`, `exports`, `files`).
2. Move files with `git mv`.
3. Run `bun run node --test <pkg>/test/*.test.js` at the package level.
4. If any test fails because of a stale relative import, fix it and re-run.
5. Do not advance to the next library until tests pass.

After all 15 libraries:

6. `bun run check`
7. `bun run test` (full suite)
8. `bun run layout` — every tier-A library should now show as conformant.
9. Commit the whole tier-A batch.

## Verification

- `git ls-files 'libraries/libdoc/*.js' 'libraries/libgraph/*.js' ... 'libraries/libvector/*.js'`
  returns nothing (no root sources across all 15 tier-A libraries).
- Every `src/index.js` in each tier-A library exists.
- Every subpath key in every tier-A `package.json` has a target that exists on
  disk. Spot-check by running a small script:
  ```js
  for each package.json in tier-A:
    for each ["./foo", "./src/foo.js"] in exports:
      assert statSync("libraries/<pkg>/src/foo.js").isFile()
  ```
  (The actual implementation uses the same walker logic as
  `scripts/check-package-layout.js`.)
- `bun run test` passes, 0 regressions vs. the main-branch baseline.
- `bun run layout` reports zero drift in `libraries/{libdoc,libgraph,…}` — every
  tier-A library.
- Total pre-move subpath key count matches post-move count: 79.

## Risks

1. **`libskill` is the largest single move — 20 root files + 1 subdir + 13
   exports.** Pair it with an extra verification pass: after moving libskill,
   run the pathway and libskill tests explicitly before moving on. If they fail,
   the likely cause is a missed relative import inside a test file, not an
   exports misconfiguration.

2. **`libui/components/*` and `libui/css/*` wildcards.** Wildcard export
   patterns are quirky — the `*` is replaced character-by-character in Node's
   resolver. Preserve the full pattern:
   - `./components/*` → `./src/components/*.js` (keep the `.js`)
   - `./css/*` → `./src/css/*` (no suffix — resolves to whatever the consumer
     imports, including `.css`) Test by
     `grep -r '@forwardimpact/libui/components/' products/pathway/` to find an
     existing consumer and verify its import still resolves.

3. **`libsyntheticgen` has dual keys for vocabulary (`./vocabulary` and
   `./vocabulary.js`).** Both point at the same target. Preserve both — removing
   one breaks a consumer that depends on the `.js` form. The spec does not ask
   for consolidation.

4. **`libresource/sanitizer.js` has no export key.** Moving it into `src/` is
   still required (rule 1). It remains unexported; no exports edit is needed for
   sanitizer.

5. **`libpolicy` is not in tier A.** Even though libskill exports `./policies`,
   the target lives inside libskill's own `policies/` subdirectory, not the
   `libpolicy` library. Do not confuse them.

6. **Test relative imports.** Every library's `test/*.test.js` files import from
   the package under test. Grep for `../` imports in each test file and rewrite
   to `../src/`. This is the single most likely cause of post-move test
   failures. A sample audit command per package:

   ```
   rg '^import .* from ["'\''](\.\./[^s])' libraries/<pkg>/test/
   ```

   (The `[^s]` excludes `../src/...` which is already correct.)

7. **Per-library commit vs. tier commit.** The plan lands the tier as one
   commit. If a single library fails mid-sequence, pause, resolve, and continue
   rather than committing per library — the branch diff should remain
   reviewable. If a library fails in a way that requires more than a mechanical
   fix, commit completed libraries first and open a discussion before
   proceeding.

## Deliverable commit

```
refactor(layout): migrate 15 libraries (tier A) into src/ (part 06/08)

Moves every tier-A library into a src/ subtree and rewrites every
subpath exports target from "./foo" to "./src/foo". Subpath keys are
preserved — consumer import specifiers are unchanged.

Libraries: libdoc, libgraph, libmemory, libprompt, libresource,
libskill, libsyntheticgen, libsyntheticprose, libsyntheticrender,
libtelemetry, libtemplate, libtool, libui, libuniverse, libvector.

libharness was handled in part 04.

Part 06 of 08 for spec 390.
```

— Staff Engineer 🛠️
