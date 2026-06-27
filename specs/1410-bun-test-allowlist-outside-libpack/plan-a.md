# Plan 1410 — `bun:test` Universal-Subset Allowlist Guard

Implements [spec](spec.md) per [design-a](design-a.md).

## Approach

Build the guard triplet — pure acorn-based rules module, thin file-walking
check script, and a `bun test` regression test — then wire the script into the
`invariants` aggregator, amend the one 0650 Non-goals bullet in place, and add
one canonical policy paragraph to CONTRIBUTING.md. The rules module is the only
detection authority; the script and the regression test both consume it. No
test file is migrated; the guard passes on the landing tree.

Libraries used: acorn (parse).

## Step 1 — Rules module

Intent: pure detection of `bun:test` import/export violations from source text.

Files: create `scripts/check-bun-test-imports-rules.mjs`.

- Export
  `ALLOWLIST = new Set(["describe","test","it","expect","beforeAll","beforeEach","afterEach","afterAll"])`.
- Export `SYMBOL_POINTER`, a map from banned-symbol name → replacement pointer
  string: `mock`/`spyOn` → `"use libmock spy()"`; `setSystemTime`/
  `useFakeTimers` → `"bun timer manipulation is banned; see spec 1410 § Out"`.
  Any other off-allowlist symbol → `null` (script falls back to the allowlist
  reference).
- Export `bunTestFindings(text, isTestFile)` returning
  `Array<{line, kind, name, pointer}>` (no `file` — the script attaches it):
  - Parse with
    `acorn.parse(text, { sourceType: "module", ecmaVersion: "latest", locations: true })`.
    Wrap in try/catch; on parse error return a single finding
    `{line: 1, kind: "shape", name: "parse-error", pointer: "file is not a parseable ES module"}`
    so a bad file fails loud, not silent.
  - Every `kind:"shape"` finding below carries `pointer: allowlistRef` (SC1c
    requires a pointer on shape rejections too). Omitted from each row for
    brevity — attach it uniformly.
  - Walk `ast.body`; act only on `ImportDeclaration` / `ExportNamedDeclaration`
    / `ExportAllDeclaration` whose `source?.value === "bun:test"`.
  - `ImportDeclaration`: for each specifier — `ImportDefaultSpecifier` →
    `{kind:"shape", name:"default"}`; `ImportNamespaceSpecifier` →
    `{kind:"shape", name:"namespace"}`; `ImportSpecifier` → let
    `imported = spec.imported.name`; if `isTestFile && ALLOWLIST.has(imported)`
    no finding, else
    `{kind:"symbol", name: imported, pointer: SYMBOL_POINTER.get(imported) ?? allowlistRef}`.
    Zero specifiers → `{kind:"shape", name:"side-effect"}`.
  - `ExportNamedDeclaration` with source: if any specifier
    `local.name === "default"` → `{kind:"shape", name:"re-export-default-as"}`,
    else `{kind:"shape", name:"re-export-named"}`. (Re-export is banned in test
    and source files alike — `isTestFile` is not consulted.)
  - `ExportAllDeclaration` with source →
    `{kind:"shape", name:"re-export-namespace"}`.
  - `line` is the node's `loc.start.line`. `allowlistRef` is a constant string
    referencing spec 1410 § Scope allowlist.

Verify: write the probe to a temp `.mjs` (avoids nested shell-quote fragility) —
`printf 'import { bunTestFindings } from "%s/scripts/check-bun-test-imports-rules.mjs";\nconsole.log(bunTestFindings(`import
{spyOn} from "bun:test"`, true));\n' "$PWD" > /tmp/p.mjs && node /tmp/p.mjs`
prints one `kind:"symbol"` finding `name:"spyOn"` with a non-null `pointer`.

## Step 2 — Check script

Intent: walk the allowlist directory set, classify by filename, emit structured
errors, exit non-zero on any finding.

Files: create `scripts/check-bun-test-imports.mjs`.

- Shebang `#!/usr/bin/env node`. Import `bunTestFindings` from the rules module;
  `readFileSync`, `readdirSync`, `statSync`, `existsSync` from `node:fs`;
  `join`, `resolve`, `relative`, `dirname` from `node:path`; `fileURLToPath`.
- `SCOPE = ["libraries","services","products","tests","websites",".github/workflows/test",".claude/skills/kata-interview/test"]`.
- `SKIP_DIRS = new Set(["node_modules","dist","generated","tmp"])`.
- Recursive `collectFiles(dir)` collecting every `*.js` file, skipping
  `SKIP_DIRS`. Use the recursion shape of `check-ambient-deps.mjs`
  `collectSrcFiles` (readdir → statSync → recurse on dirs, push `.js` leaves)
  but **not** its scoping: that precedent walks only `<pkg>/src` and skips
  `test/`, whereas this guard must walk the full `SCOPE` directories
  including `test/` dirs and `tests/` (it is a test-file guard). The `SCOPE`
  and `SKIP_DIRS` constants above are authoritative.
- For each file: skip the guard's own regression test by basename
  (`check-bun-test-imports-rules.test.js`);
  `isTestFile = file.endsWith(".test.js")`; call
  `bunTestFindings(readFileSync(file,"utf8"), isTestFile)`; print each as a
  structured line carrying all five fields, e.g.
  `error: ${rel} line=${f.line} kind=${f.kind} name=${f.name} pointer=${f.pointer}`.
- Exit 1 if any finding emitted, else 0.

Verify: `node scripts/check-bun-test-imports.mjs; echo $?` prints `0` on the
current tree (no source-side imports, no re-exports — SC4a/4b/4c).

## Step 3 — Regression test

Intent: nine SC5 leaf assertions against the rules module under `bun test`.

Files: create `tests/check-bun-test-imports-rules.test.js`.

- `import { describe, test } from "bun:test"; import assert from "node:assert/strict";`
  and
  `import { bunTestFindings } from "../scripts/check-bun-test-imports-rules.mjs";`.
- One assertion per leaf:
  - (i) `bunTestFindings('import { describe } from "bun:test"', true)` is empty.
  - (ii) `import { test as t } from "bun:test"` (test file) is empty.
  - (iii) `import { spyOn } from "bun:test"` (test file) → one `kind:"symbol"`
    `name:"spyOn"`.
  - (iv) `import { spyOn as track } from "bun:test"` (test file) →
    `kind:"symbol"` `name:"spyOn"` (imported side).
  - (v.a) `import x from "bun:test"` → `kind:"shape" name:"default"`.
  - (v.b) `import * as x from "bun:test"` → `name:"namespace"`.
  - (v.c) `import "bun:test"` → `name:"side-effect"`.
  - (vi.a) `export { test } from "bun:test"` with `isTestFile=true` →
    `re-export-named`.
  - (vi.b) `export { test } from "bun:test"` with `isTestFile=false` →
    `re-export-named`.
- Beyond the nine leaves, assert the two remaining re-export shapes SC1b
  names so all three are covered: `export * from "bun:test"` →
  `re-export-namespace`; `export { default as t } from "bun:test"` →
  `re-export-default-as`. Assert each emitted shape finding carries a
  non-null `pointer` (SC1c).
- Pin the SC2 source-side assertion: an allowlisted named import
  (`import { describe } from "bun:test"`) with `isTestFile=false` is rejected
  (`kind:"symbol"`), proving the source-file ban applies even to allowlisted
  symbols.

Verify: `bun test tests/check-bun-test-imports-rules.test.js` passes; nine leaf
groups plus the two extra re-export shapes and the SC2 source-side assertion
all green. Confirm the file is discovered by the runner: `bun run test 2>&1 |
grep check-bun-test-imports-rules` shows it ran (it sits under `tests/`, a
`bun test` invocation root — SC5 discovery).

## Step 4 — Aggregator wiring

Intent: run the guard in the same aggregator as the other `invariants:check-*`.

Files: modify `package.json`.

- Add
  `"invariants:check-bun-test-imports": "node scripts/check-bun-test-imports.mjs"`.
- Append `&& bun run invariants:check-bun-test-imports` to the `invariants`
  chain value.

Verify: `bun run invariants 2>&1 | grep -q check-bun-test-imports` and the
chain exits 0; `grep -q "bun run invariants" package.json` (the `check` script
already chains `invariants` — no edit needed) and
`grep -q "bun run invariants" .github/workflows/check-quality.yml` both match —
together these confirm SC3's two surfaces (`bun run check` and CI) invoke the
guard via the aggregator.

## Step 5 — 0650 in-place amendment

Intent: replace the one Non-goals bullet + dateless footnote (SC6).

Files: modify `specs/0650-bun-test-runner/spec.md`.

- The target bullet wraps across two source lines (0650 spec.md lines 131–132):
  `- Adding \`bun:test\`-specific features (snapshot testing, etc.) — out of scope;`
  / ` this spec is purely about the runner switch.` Match the wrapped form (or
  edit by line range), not a single-line string. Replace it with the Replacement
  bullet text from spec 1410 § Supersession, followed by
  `*[amended by spec 1410](../1410-bun-test-allowlist-outside-libpack/spec.md)*`
  (no date).
- The replacement bullet links to spec 1410 § Scope (SC7b).

Verify: original bullet text no longer present in 0650 outside the 1410
quotation; footnote link resolves to the 1410 spec.

## Step 6 — Canonical policy paragraph

Intent: one human-facing policy paragraph (SC7a/7c).

Files: modify `CONTRIBUTING.md`.

- Add one paragraph near the testing/quality guidance covering: the named-import
  allowlist for `bun:test` in `*.test.js`; the source/test split (non-test
  source must not import `bun:test`); snapshot serializers out of scope; and a
  link to `specs/1410-bun-test-allowlist-outside-libpack/spec.md`.

Verify: `grep -rlE "bun:test" --include='*.md' --exclude-dir=node_modules .`
enumerates only the canonical doc, the two spec files, and non-policy mentions
(SC7c).

## Final verification

Define the directory set once (matches spec § Problem):
`ROOTS="libraries/ services/ products/ tests/ websites/ .github/workflows/test/ .claude/skills/kata-interview/test/"`.

- `bun run invariants` exits 0;
  `bun test tests/check-bun-test-imports-rules.test.js` passes.
- SC4a:
  `grep -rlE "from ['\"]bun:test['\"]" $ROOTS | grep -v '\.test\.js$' | wc -l` →
  0.
- SC4b: re-export grep from SC4b → 0.
- Full diff against spec success criteria 1–7.

## Risks

- **acorn must parse every walked `.js` file under the scope set.** A generated
  or non-module `.js` would throw; Step 1's try/catch converts that into a loud
  `parse-error` finding rather than a crash. If a legitimately non-module `.js`
  exists under scope and trips this, exclude it via `SKIP_DIRS` or a basename
  guard — do not broaden the catch to swallow real violations.
- **`websites/` size.** The recursive walker must honour `SKIP_DIRS`
  (`node_modules`/`dist`/`generated`) to stay fast; verify the guard completes
  in well under the other invariants' runtime.

## Execution

Single engineering agent, steps in order. Steps 1→2→3 are sequential (2 imports
1; 3 imports 1). Steps 4, 5, 6 are independent of each other and may follow in
any order once 1–3 land.

## Implementation note

The invariants mechanism changed between approval and landing: the repository
moved every `scripts/check-*.mjs` invariant into the discovered
`.coaligned/invariants/*.rules.mjs` host that `bunx coaligned invariants` runs,
and retired the per-script `package.json` chain. The guard landed in that
convention rather than the chain Steps 2 and 4 assumed:

- Steps 1–3 collapse into one rules module,
  `.coaligned/invariants/bun-test-imports.rules.mjs`, exporting the `{ name,
  build, rules }` shape the host discovers. The pure `bunTestFindings` verdict
  is unchanged and still exported; the module reuses the shared `lib/ast.mjs`
  and `lib/walk.mjs` helpers instead of a standalone walker.
- Step 4 needs no `package.json` edit — the guard is wired by membership in the
  discovered set (the new analogue of the aggregator chain).
- The regression test lives at `tests/bun-test-imports.test.js`, modeled on
  `tests/service-url-drift.test.js` so its acorn dependency resolves from the
  repo root. Step 5 (0650 amendment) is unchanged.
- Step 6 changes home: CONTRIBUTING.md is at its L2 word budget
  (`instructions.word-budget`) on `main`, so the canonical policy paragraph
  lives in this spec's § Scope instead — SC7b permits "this spec § Scope" as
  the canonical reference, and the 0650 amendment already defers there. No
  CONTRIBUTING bullet lands, keeping the allowed-mention set `{spec 1410,
  spec 0650}` (SC7c).

— Staff Engineer 🛠️
