# Plan 2020 — Part 01 (PR 1): Shim, Sweep, Gate, Guard

Converge the 49 `bun:test` importers onto `node:test` + a new `expect` shim,
stand up the required `node --test` gate, and add the re-divergence guard.
Publish stays on `bun run test`. See [plan-a](plan-a.md) for strategy.

Libraries used: libmock (new `./expect` export); no new external dependencies.

## Step 1 — Build the `expect` shim (C1)

Intent: a dependency-free, runner-independent `expect()` covering the full
measured matcher surface.

- Created: `libraries/libmock/src/expect/index.js`
- Modified: `libraries/libmock/package.json` (add
  `"./expect": "./src/expect/index.js"` to `exports`)

`export function expect(actual)` returns a matcher object. Implement **exactly
the D3 measured surface** (12 matchers + `.not`/`.resolves`/`.rejects`), each
throwing `node:assert`'s `AssertionError` on mismatch — no matchers beyond what
the 49 files use (`.not` already covers complements like falsy/less-than):

- Equality/identity: `toBe` (`Object.is`), `toEqual` (deep structural incl.
  `Map`/`Set`/arrays/plain objects), `toMatchObject` (subset deep-equal).
- Truthiness/null: `toBeNull`, `toBeUndefined`, `toBeDefined`, `toBeTruthy`.
- Numeric: `toBeGreaterThan`.
- Collections/strings: `toHaveLength`, `toContain`, `toMatch` (string or
  RegExp).
- Throwing: `toThrow` (no-arg, substring, or RegExp against the thrown message).
- `.not` getter returns a matcher whose every assertion inverts (a passing
  inner check throws).
- `.resolves` / `.rejects` getters return an async matcher: awaits `actual`,
  then applies the chained matcher to the resolved value (`resolves`) or the
  caught rejection (`rejects`); `rejects` throws if the promise did **not**
  reject. These return promises the test must `await`.

Import only from `node:assert` (and `node:util` if needed for deep-equal). No
third-party imports.

Verify: `node -e "import('./libraries/libmock/src/expect/index.js')"` resolves.

## Step 2 — Build the shim's own test with the anti-vacuity property (C2)

Intent: prove every matcher and `.not` assert rather than silently pass, plus
the semantics drift the 49 files rely on.

- Created: `libraries/libmock/test/expect.test.js`

Contents:

- A **table-driven per-matcher property**: for every matcher in the D3 surface,
  one case that must pass and one deliberately-wrong case that must throw
  (assert via `node:assert`'s `throws`). A no-op matcher body fails the throwing
  half.
- An explicit `.not` case: a negated assertion that *should* fail must throw (a
  passthrough `.not` makes it pass — caught here).
- An async negative: `await expect(Promise.resolve(1)).rejects.toThrow()` must
  itself throw (a non-rejecting promise under `rejects` would otherwise pass
  green).
- Semantics-drift cases: `toEqual` on `Map`/`Set`; `toThrow` with a substring
  and with a `RegExp`; async `.rejects` on a genuinely rejecting promise.

Write structural names from `node:test`, `expect` from `../src/expect/index.js`.

Verify: `node --test libraries/libmock/test/expect.test.js` exits 0 **and**
`bun test libraries/libmock/test/expect.test.js` exits 0.

## Step 3 — Sweep the 49 files onto `node:test` + the shim (C9)

Intent: remove every `bun:test` import so `node --test` can run the gate set.

- Modified: the 49 files listed by
  `grep -rlE "from ['\"]bun:test['\"]" libraries products services tests`
  (libbridge 20, ghbridge 10, msbridge 9, libpack 6, libeval/libhttp/pathway 4).

Per file, replace the single `import { … } from "bun:test"` line with two
imports:

- `import { describe, test, beforeEach, afterEach } from "node:test";` — keep
  only the structural names that file actually used.
- `import { expect } from "@forwardimpact/libmock/expect";`

Special case — `products/pathway/test/serve.integration.test.js`: it imports and
calls `afterAll`. Rename the import to `after` and the call site
(`serve.integration.test.js:61` `afterAll(` → `after(`); `node:test` has no
`afterAll`.

Verify (incremental): after the sweep,
`grep -rlE "from ['\"]bun:test['\"]" libraries products services tests` returns
nothing; `node --test` over the swept files exits 0 with **0**
`NotImplementedError: describe()…` and **0** `ERR_UNSUPPORTED_ESM_URL_SCHEME:
protocol 'bun:'`; `bun test` over the same files still exits 0.

## Step 4 — `test:gate` wrapper + committed floor (C3, C4)

Intent: a per-file count-enforcing `node --test` wrapper that fails empty,
shrunk, or zero-file runs.

- Created: `scripts/test-gate.mjs`, `scripts/test-gate.floor.json`
- Modified: `package.json` (add `"test:gate": "node scripts/test-gate.mjs"`; the
  existing `test` script keeps its `find … | xargs bun test` form)

Single-source the gate set so the selector cannot fork (design C3): the
`find … -name '*.test.js' -not -path '*/node_modules/*'` directory list and
predicate live in **one place** the wrapper owns — `test-gate.mjs` runs that
`find` itself, and the `test` script's selector is the *same literal string*.
The verification below asserts the two selectors are identical text, so an edit
to one without the other is caught.

`test-gate.mjs`:

1. Expand the **same selector as `test`** (package.json:34 —
   `find ./tests ./libraries ./products ./services ./.github/workflows/test ./.claude/skills/kata-interview/test -name '*.test.js' -not -path '*/node_modules/*'`)
   to a file list. **Empty list → print error, `process.exit(1)`**
   (zero-files-fail).
2. For each file, spawn `node --test <file>`, capture stdout. Parse the TAP
   summary lines `# tests N`, `# pass N`, `# fail N`. **Absent or unparseable
   `# tests` line → print error, exit 1** (fail loud, never pass an unread run).
3. Per file: fail (exit 1) if the run exited non-zero, `# fail > 0`, or
   `# tests < 1`. Print the offending file.
4. Sum `# tests` across files. Read `floor.json` (`{ "floor": <int> }`). If sum
   `< floor`, print the observed sum and exit 1; the fix is to commit the new
   value. (The sum counts node's per-file synthetic subtest, so the floor is a
   relative shrink-detector, not an exact real-test count — note this in a code
   comment so a later reader does not misread it.)
5. All checks pass → exit 0.

Seed `floor.json` from the observed sum the wrapper prints on a clean
`bun run test:gate` run.

Verify: `bun run test:gate` exits 0 on a clean tree; the `find` selector in
`test-gate.mjs` is byte-identical to the `test` script's selector; temporarily
pointing the selector at zero files exits 1; raising `floor.json` above observed
exits 1; a file whose `describe` body throws so it registers `# tests 0` makes
the gate exit 1 (the per-file ≥1 hole); inverting an assertion in one swept file
makes `bun run test:gate` exit 1 (integration non-vacuity).

## Step 5 — Re-divergence guard (C5)

Intent: fail CI on any new `bun:test` import statement anywhere in the repo.

- Created: `scripts/check-bun-test-imports.mjs`
- Modified: `package.json` (add
  `"context:check-bun-test": "node scripts/check-bun-test-imports.mjs"` for
  local use)

The script walks tracked `*.js`/`*.mjs` files (excluding `node_modules`) and
matches **module-specifier statements** that resolve `bun:test` — static import,
re-export, `require()`, and dynamic `import()`, with arbitrary whitespace before
the quote — **not** comment or string mentions. Use this regex (verified against
all four forms and the real `from "bun:test"` whitespace, and verified **not**
to match a comment mention):

```js
/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["']bun:test["']/
```

> The naive `/(?:from|require\(\s*)['"]bun:test['"]/` is **wrong** — it requires
> the quote to abut `from` and matches **none** of the real `from "bun:test"`
> imports, so the guard would never enforce. Use the form above.

On any match, print every `file:line` and `process.exit(1)`; clean tree exits 0.
Model the structure on `scripts/check-dependabot.mjs` (`fail()` helper,
`process.exit`). Stdlib-only.

Verify: clean tree exits 0; a static `import … from "bun:test"`, a
`require("bun:test")`, an `await import("bun:test")`, and an
`export … from "bun:test"` each make it exit 1 listing the file; a `bun:test`
mention inside a comment does **not** trip it.

## Step 6 — Wire the required `Test / gate` job and the guard step (C6, C7)

Intent: run the node gate and the guard as required PR + `main` checks.

- Modified: `.github/workflows/check-test.yml`

Add a `gate` job (sibling to `test`), same bootstrap as the `test` job
(`actions/checkout`, `forwardimpact/fit-bootstrap`, `bunx fit-terrain build`),
running `bun run test:gate`. Add a step (in `gate` or a small dedicated job)
that **invokes the guard script directly** —
`bun scripts/check-bun-test-imports.mjs`, mirroring how `check-dependabot.mjs`
is run directly in `check-security.yml` (D7/C7) — **not**
`bun run context:check-bun-test` and **not** the `bun run check`/`context`
aggregate. (The `context:check-bun-test` `package.json` alias from Step 5 is for
local runs only.) Leave the existing `test` job (`bun run test`) unchanged and
non-blocking/informational.

Verify: `gate` job appears in the workflow on `pull_request` and `push` to
`main`; an introduced node-only failure or a new `bun:test` import reddens it.
**Two branch-protection actions are repo-admin (out-of-repo) — both must be
called out in the PR body for the human to flip:** (a) mark `Test / gate`
**required**, and (b) ensure `Test / test` (bun) is **not** a required check, so
the spec's "`Test / test` is non-blocking/informational" criterion holds — the
in-repo change cannot demote an already-required check.

## Step 7 — Document the resolved trade (C10)

Intent: record the settled per-surface strategy so it stops re-litigating.

- Modified: `specs/0650-bun-test-runner/spec.md` (superseding note pointing to
  spec 2020), `CONTRIBUTING.md` (short runner-strategy §: `node --test` is the
  blocking gate, `bun test` is the informational local/PR loop, no new
  `bun:test` imports).

Verify: `bun run check` passes after the doc edits; the 0650 note explicitly
names spec 2020 as superseding its runner decision; the `CONTRIBUTING.md` §
states all three rules (node gate blocking / bun local informational / no new
`bun:test` imports), not just lints clean.

## Final verification

`bun run test:gate` exits 0; `bun run context:check-bun-test` exits 0;
`grep -rlE "from ['\"]bun:test['\"]"` over the gate set returns nothing;
`node --test libraries/libmock/test/expect.test.js` and
`bun test libraries/libmock/test/expect.test.js` both exit 0; `bun run check`
passes.

— Staff Engineer 🛠️
