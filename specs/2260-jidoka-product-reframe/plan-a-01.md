# Plan 2260-a Part 1: CLI + library axis — the Jidoka package and the invariant library

One part because the `public-cli-set` invariant and the workspace couple the
bin, the launcher set, and the invariant rules: any split leaves a bin
without its package or a scanner without its prefix and fails CI. Sub-steps
are verification units, not commit boundaries.

## Step 1.1 — Scaffold `products/jidoka/package.json`

Create the consumer package: `bin` + `dependencies`, no `main`, no `exports`,
no `src/`, no hand-authored `README.md` (Gear/Gemba precedent).

**Created:** `products/jidoka/package.json`.

```json
{
  "name": "@forwardimpact/jidoka",
  "version": "0.2.0",
  "description": "Build quality into agent instructions — the jidoka CLI and CI action stop the line the moment an instruction layer drifts, a jobs block goes stale, or a repository invariant breaks.",
  "keywords": ["jidoka", "instructions", "jtbd", "invariants", "quality", "agent"],
  "homepage": "https://www.forwardimpact.team",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/forwardimpact/monorepo.git",
    "directory": "products/jidoka"
  },
  "license": "Apache-2.0",
  "author": "D. Olsson <hi@senzilla.io>",
  "jobs": [
    {
      "user": "Teams Using Agents",
      "goal": "Build Quality Into Agent Instructions",
      "trigger": "The team's layered instructions exist, but nothing enforces them — layers drift and restate each other, and stale jobs blocks ship unnoticed until an agent misbehaves.",
      "bigHire": "keep humans and agents on one layered instruction architecture, with checks that stop the line the moment a layer drifts.",
      "littleHire": "check one layer's caps, validate the jobs blocks, or run the repository's invariant rules with a single command before commit.",
      "competesWith": "unenforced conventions; review-time nitpicking; hand-rolled lint scripts; letting drift accumulate until a rewrite",
      "forces": {
        "push": "Instruction sprawl keeps breaking agent behavior with no layer to blame.",
        "pull": "One command family and CI action that stop the line at the first drifted layer.",
        "habit": "Trusting contributors to keep instructions tidy by hand.",
        "anxiety": "Another gate slowing every commit."
      },
      "firedWhen": "the checks block more work than the drift they catch, or the team stops layering its instructions."
    }
  ],
  "type": "module",
  "bin": { "jidoka": "./bin/jidoka.js" },
  "files": ["bin/**/*.js"],
  "dependencies": {
    "@forwardimpact/libinvariant": "^0.2.0",
    "@forwardimpact/libcli": "^0.1.17",
    "@forwardimpact/libpreflight": "^0.1.4",
    "@forwardimpact/libutil": "^0.1.100"
  },
  "engines": { "bun": ">=1.2.0", "node": ">=22.0.0" },
  "publishConfig": { "access": "public" }
}
```

Version `0.2.0` seeds above the renamed pack sibling's retained `v0.1.x` tag
floor (design § Components). Dependency ranges track the workspace at
implementation time; the four packages are exactly what the bin imports. No
`scripts.test` — the moved goldens (Step 1.8) have no runner test.

**Verify:** `bun install` resolves; `bun run context:check-jtbd` passes the
new jobs entry (run `bun run context:fix` first to regenerate `JTBD.md`).

## Step 1.2 — Move and rename the bin

`git mv libraries/libcoaligned/bin/coaligned.js products/jidoka/bin/jidoka.js`,
then edit in place:

- Import `../src/index.js` → `@forwardimpact/libinvariant`; the import list
  drops `INVARIANTS_DIR` (deleted from the library, Step 1.3).
- Add the product-owned discovery constant:
  `const INVARIANTS_DIR = ".jidoka/invariants";` — the caller-supplied
  convention (design § Interfaces).
- Thread it through the three call sites: `findInvariantsRoot(rt,
  INVARIANTS_DIR)`, `loadRuleModules({ root, rulesDir: INVARIANTS_DIR,
  runtime: rt })`, `runRuleModules(modules, { root, runtime: rt, dir })`
  with `dir = resolve(root, INVARIANTS_DIR)`.
- Rename command tokens: definition `name: "jidoka"`, description ("…defined
  in JIDOKA.md…"), examples, pass messages (`jidoka instructions passed`,
  …), the jtbd stale-hint (`` `jidoka jtbd --fix` ``), and the
  `.coaligned/invariants` comment above `invariantsHandler`.
- `packageJsonUrl: new URL("../package.json", import.meta.url)` now resolves
  the jidoka package — correct (`--version` reports the product), leave as
  is.
- Add a `documentation` array to the definition (the docs home is the
  standard plus the standalone site — spec § Included, Website row), the
  same two entries the renamed skills' `## Documentation` lists carry
  (Step 3.3):
  `{ title: "Jidoka Instruction Architecture Standard", url:
  "https://github.com/forwardimpact/monorepo/blob/main/JIDOKA.md" }` and
  `{ title: "Jidoka website", url: "https://www.jidoka.team/" }`.

Subcommand set, options, and dispatch flow unchanged.

**Verify:** `node products/jidoka/bin/jidoka.js --help` exits 0 and lists
`instructions`, `jtbd`, `invariants` (spec SC2); `node
products/jidoka/bin/jidoka.js invariants` passes against the Step 1.4 tree.

## Step 1.3 — Rename and purify the library

`git mv libraries/libcoaligned libraries/libinvariant`, then:

| File | Change |
| --- | --- |
| `package.json` | `name` → `@forwardimpact/libinvariant`; `description` → "Repository invariant checks — instruction-layer length caps, JTBD block validation, and a declarative rule-module runner over a caller-supplied rules directory."; `keywords` swap `coaligned` → `invariants` family tokens; `repository.directory` → `libraries/libinvariant`; delete the `bin` field and the `./bin/coaligned.js` export (root export `.` → `./src/index.js` stays); drop `bin/**/*.js` from `files`. The `jobs` entry keeps its goal; name tokens only. |
| `src/index.js` | Drop the `INVARIANTS_DIR` re-export; other exports unchanged. |
| `src/invariants.js` | Delete `export const INVARIANTS_DIR`; `findInvariantsRoot(runtime)` → `findInvariantsRoot(runtime, rulesDir)` (required — the one signature change); `loadRuleModules` and `checkInvariants` lose the `rulesDir` default (required option); `runRuleModules` loses the `dir` default (required option); `Bun.plugin` name `coaligned-rule-deps` → `invariant-rule-deps`; JSDoc/comments naming `.coaligned/invariants` → "the caller-supplied rules directory". |
| `src/instructions.js`, `src/enum-drift.js` | Name tokens in comments/strings only (`rg -n -i coaligned` the two files); behavior untouched. |
| `README.md` | Rename wholesale: import-only library, no CLI; point "run the checks" readers at the Jidoka product (`npx @forwardimpact/jidoka` or the installed binary). |
| `test/invariants.test.js`, `test/invariant-kit.test.js` | Pass the now-required `rulesDir`/`dir` explicitly with brand-free fixture paths (e.g. `rules/invariants`); assert `findInvariantsRoot` against the passed directory. Handler and component tests otherwise stay put. |

**Verify:** `test ! -d libraries/libcoaligned`; `rg -n '"bin"'
libraries/libinvariant/package.json` returns nothing;
`rg -n 'INVARIANTS_DIR' libraries/libinvariant/src` returns nothing;
`bun test libraries/libinvariant` green (spec SC3).

## Step 1.4 — Move the config directory and self-edit the rule modules

`git mv .coaligned .jidoka` (18 rule modules + 8 data files). Then rename
self-referential tokens inside them — inventory of the non-mechanical edits:

| File | Change |
| --- | --- |
| `public-cli-set.rules.mjs` | `PUBLISHED_NON_FIT_CLIS` → `[]` — the launcher retires with no successor (spec SC11); keep the escape hatch with a comment describing when a non-`fit`/`gemba` public CLI would be named. Header and L51-56 comments drop the `coaligned` example. |
| `skill-genericity.rules.mjs` | npx pattern → `"\\bnpx (fit-|gemba-|jidoka|kata-)"`; website pattern → `"websites/(fit|kata|jidoka|monorepo)\\b"`; out-of-scope comment `coaligned-*` → `jidoka-*`; hint paths → `.jidoka/invariants/…`. |
| `skill-template.rules.mjs` | `PACK_SKILL` → `(kata\|jidoka\|monorepo)`; both `coaligned-*` globs → `jidoka-*`; `NPX_PATTERNS` becomes two patterns — `"\\bnpx (fit-\|kata-)"` (unchanged reason) and `"\\b(npx\|bunx) jidoka\\b"` with reason "resolves the squatted third-party jidoka package — invoke the installed binary bare, or npx @forwardimpact/jidoka"; drop the `!**/check-workflows.md` exclusion and its header paragraph (the CI templates switch to the scoped form, Step 3.3, which matches neither pattern). |
| `enumeration-drift.topics.yml`, `ambient-deps.{rules.mjs,allow.yml,deny.yml}`, `shared-workspace-staging.rules.mjs`, `subprocess-in-tests.rules.mjs`, `temporal.rules.mjs`, `model-defaults.rules.mjs`, `enumeration-drift.rules.mjs`, `skill-template.rules.mjs` hints | Mechanical: `.coaligned/invariants/…` paths (incl. `temporal.rules.mjs`/`model-defaults.rules.mjs` self-exclude globs and the `model-defaults` `paths` array entry `".coaligned"` → `".jidoka"`), `bunx coaligned invariants --seed …` → `bunx jidoka invariants --seed …`, `libcoaligned` prose → `libinvariant`. |

Update the config-dir consumers that execute or link these paths in the same
commit: `scripts/audit-service-urls.mjs` (the
`service-url-drift.url.mjs` import and `REGISTRY` constant),
`products/CLAUDE.md` L98, `libraries/libmock/README.md` L104,
`libraries/libutil/src/{calendar,models}.js`, `libraries/libutil/src/findings.js`
(`libcoaligned` prose), `libraries/libxmr/src/routes.js`,
`products/outpost/src/scheduler.js` (comments), `CONTRIBUTING.md` L29/223/251.

**Verify:** `bunx jidoka invariants` green from the repo root (the bin finds
`.jidoka/invariants` via the finder); `node scripts/audit-service-urls.mjs`
imports cleanly; `rg -n --hidden --no-ignore '\.coaligned' --glob '!.git/**'
--glob '!node_modules/**' --glob '!specs/**' --glob '!wiki/**'` returns
nothing yet-unowned (Part 3 owns skills/docs/standard; the migration note
does not exist yet).

## Step 1.5 — Retire the launcher

**Deleted:** `launchers/coaligned/` (both files). **Modified:**
`launchers/README.md` — the L11-15 exception paragraph now describes
`PUBLISHED_NON_FIT_CLIS` as an empty escape hatch (what it is for, not who
uses it); the L33 enforcement path → `.jidoka/invariants/…`. No
`launchers/jidoka/` is created — `jidoka` never enters the invariant's
invoked-name set (`INVOKE_RE` matches only `fit-`/`gemba-` names and the
scoped `npx @forwardimpact/jidoka` form does not match), so the computed set
is unchanged.

**Verify:** `bun run invariants` green; `ls launchers/` shows no `coaligned`
and no `jidoka` dir (spec SC11).

## Step 1.6 — Distribution wiring

| File | Change |
| --- | --- |
| `build/cli-manifest.json` | Entry `"name": "coaligned"` → `"jidoka"`; `targets` and `bundle: "gear"` unchanged (spec SC12). `build-binary.sh` resolves the name against the new `products/jidoka/package.json` bin at build time. |
| `products/gemba/actions/bootstrap/fit-install.sh` | `DEFAULT_TOOLS` member `coaligned` → `jidoka` (L61); `is_gear_binary` case pattern → `fit-*\|gemba-*\|jidoka` (L127); comment mentions at L11, L42, L57, L64-66, L92, L124-125, L249, L580. `FIT_GEAR_RELEASE` default is **not** bumped here — Step 4.2 owns it; the script only executes via the pinned sibling until then. |
| `.github/workflows/publish-npm.yml` | Inline check step: import → `@forwardimpact/libcoaligned` becomes `@forwardimpact/libinvariant`; rules-module path and `dir` → `.jidoka/invariants` (L56/58/62). |

**Verify:** `jq -r '.clis[].name' build/cli-manifest.json` lists `jidoka`
and no `coaligned`; `bash -n products/gemba/actions/bootstrap/fit-install.sh`.

## Step 1.7 — Root scripts and tool prose

| File | Change |
| --- | --- |
| `package.json` (root) | `"invariants"`, `"context:check-instructions"`, `"context:check-jtbd"`, `"context:fix"` — `bunx coaligned …` → `bunx jidoka …` (workspace-resolved; spec SC5). |
| `justfile` | `check-instructions` recipe → `bunx jidoka instructions` (L212). |
| `.rumdl.toml` | Comment prose at L8-9, L36: `coaligned` → `jidoka`. |
| `MONOREPO.md` | L81 required-tools list member `coaligned` → `jidoka`; L177 `.coaligned/invariants/` + `coaligned invariants` → jidoka forms. (Standard-document links at L12/109/121/127 are Part 3.) |

**Verify:** `bun run invariants`, `bun run context` green.

## Step 1.8 — Golden fixtures

`git mv libraries/libcoaligned/test/golden/coaligned
products/jidoka/test/golden/jidoka` (moves with the Step 1.3 `git mv`;
relocate from the renamed library), then regenerate all five cases from
actual output:

```sh
node scripts/capture-cli-golden.mjs --bin jidoka \
  --exec products/jidoka/bin/jidoka.js \
  --golden-dir products/jidoka/test/golden/jidoka
```

`cases.json` args are name-independent and stay as captured (help, version,
three subcommand helps — 10 snapshot files). The capture script itself names
no CLI and needs no edit.

**Verify:** `git diff --stat products/jidoka/test/golden/jidoka` shows every
`.txt` regenerated; no `coaligned` token remains in the snapshots
(`rg -n coaligned products/jidoka/test`); re-running the capture command
produces no further diff.

## Step 1.9 — Part gate

Blanket-check the part's three families across the tree, excluding the
surfaces later parts own:

```sh
rg -n -i --hidden --no-ignore 'libcoaligned|\.coaligned' \
  --glob '!.git/**' --glob '!node_modules/**' --glob '!specs/**' \
  --glob '!wiki/**' --glob '!**/CHANGELOG.md' --glob '!bun.lock' \
  --glob '!.claude/skills/**' --glob '!benchmarks/**' --glob '!websites/**' \
  --glob '!references/**' --glob '!COALIGNED.md'
```

Inspect every returned line — the expected result is empty
(`CONTRIBUTING.md` and `MONOREPO.md` path references were updated in Steps
1.4/1.7; the excluded globs are Part 2/3 surfaces — skills, benchmarks,
websites, living templates, and the standard). Then `bun install`
(regenerates `bun.lock`), `bun run context:fix`, `bun run check`, `bun run
test` green.
