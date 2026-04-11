# Plan A Part 04 — CI guard against `Key Exports` drift

Part 4 of 4 of [plan-a](plan-a.md) for [spec 400](spec.md). Depends on Part 02.

Adds a new script, `scripts/check-skill-exports.js`, that enforces the core
invariant from spec 400 Move 4: **every name in a `Key Exports` cell of any
`libs-*/SKILL.md` must resolve to a public export of the corresponding
library.** The script runs as part of `bun run check` and the `check-quality`
GitHub Actions workflow. The check is strict-positive only: advertised names
must exist; unadvertised library exports are fine.

## Scope

- Create `scripts/check-skill-exports.js` (new file).
- Add `check:skill-exports` to `package.json` scripts.
- Wire `check:skill-exports` into `bun run check` so local checks fail on drift.
- **Add a `check-skill-exports` job to `.github/workflows/check-quality.yml`**
  mirroring the existing `check-exports` job. This is required, not optional —
  the current workflow runs `bun run check:exports` as a standalone job
  (`.github/workflows/check-quality.yml:33–39`) and does **not** invoke
  `bun run check` wholesale, so chaining the new script behind `bun run check`
  only affects local runs. Without the workflow edit, spec 400 success criterion
  6 ("verifiable … in the `check-quality` CI workflow") cannot be met.
- Deliberately out of scope: reverse direction check ("every public export must
  be advertised"), cross-library duplication check, any language server
  integration.

## Files touched

Three files, one new:

1. `scripts/check-skill-exports.js` (new) — ~150 lines.
2. `package.json` (edit) — add one script entry, extend the `check` chain.
3. `.github/workflows/check-quality.yml` (edit) — add one new job,
   `check-skill-exports`, mirroring the existing `check-exports` job at lines
   33–39.

## Ordering

1. **Draft the script.** See § Script design below.
2. **Wire into `package.json`.** Add
   `"check:skill-exports": "node scripts/check-skill-exports.js"` to `scripts`,
   and extend the `check` chain from
   `"bun run format && bun run lint && bun run layout && bun run check:exports"`
   to
   `"bun run format && bun run lint && bun run layout && bun run check:exports && bun run check:skill-exports"`.
3. **Add the CI job.** Edit `.github/workflows/check-quality.yml` to add a new
   job `check-skill-exports` mirroring the existing `check-exports` job. See §
   Workflow edit below for the exact diff.
4. **Run locally.** Expected result: all rows resolve, the script prints
   `All libs-* Key Exports resolve.` and exits 0.
5. **Verify drift detection.** Manually rename one exported symbol in a library
   (e.g., rename `Cli` to `TempCli` in `libraries/libcli/src/cli.js` and remove
   it from `src/index.js`) and re-run the script. Expected: exit code 1, error
   message names the SKILL.md file and the missing export. Revert the rename
   before committing.
6. **Commit.**

## Script design

The script lives at `scripts/check-skill-exports.js` and follows the structure
of the existing `scripts/check-exports-resolve.js` (spec 390).

### Algorithm

```
1. Enumerate SKILL.md files:
     .claude/skills/libs-*/SKILL.md  (glob)

2. For each SKILL.md:
     a. Read the file.
     b. Locate the `## Libraries` table (first markdown table after an H2
        heading "Libraries" — tolerate H2 "Libraries" or "## Libraries").
     c. Parse the header row. Require exact headers:
          | Library | Capabilities | Key Exports |
        Fail with a clear error if the headers differ.
     d. Parse each data row. For each row:
          - library name  (column 1, stripped)
          - key exports   (column 3, split by comma, names trimmed,
                           backticks stripped)

3. For each (library, keyExports) pair:
     a. Load libraries/<library>/package.json.
     b. Collect every target file referenced by the package's `main`,
        `bin`, and `exports` map. Walk nested exports objects; skip
        wildcard patterns (e.g., "./components/*"); skip subpaths whose
        value is not a .js file (e.g., "./css/*": "./src/css/*" is not a
        module, skip).
     c. For each target file, parse it as ES module source to collect
        export names. Read the whole file as a string and apply the
        regex set in § Parsing constraints. Cases handled:
          - `export function X(…)` / `export async function X(…)` → add "X"
          - `export class X { … }`                                 → add "X"
          - `export const X = …` (also let, var)                   → add "X"
          - `export { X, Y, Z }` (possibly multi-line)             → add each
          - `export { X, Y } from "…"` (possibly multi-line)       → add each
                                                                     and recurse
                                                                     into "…"
          - `export * from "…"`                                    → recurse into "…"
          - `export default …`                                     → add "default"
        Use a regex-based scan, not a full parser — the library sources
        are all ES module syntax and the regex set is small. The
        existing `check-exports-resolve.js` is pure regex-free (it only
        resolves file paths) so this is a new parsing responsibility;
        keep it tight and inline. Multi-line blocks and package-name
        re-exports are handled; see § Parsing constraints and
        § Recursive resolution for the concrete rules.

     d. De-dupe the collected names into a Set.

     e. For each key-export name in the SKILL.md row, assert it is in
        the Set. If not, print:
          `.claude/skills/<skill>/SKILL.md: <library>.<name> is not a
           public export`
        and increment failure count.

4. If failures > 0:
     print summary and exit 1.
   Else:
     print `Checked N libs-* skill files, M library rows, K key exports.
            All resolve.` and exit 0.
```

### Parsing constraints

- **Markdown table parsing.** The `libs-*/SKILL.md` files all use GFM pipe
  tables. Header is one row starting with `|`, the next row is the separator
  `| --- |`, data rows follow until a blank line or a non-pipe line. The parser
  must handle leading/trailing pipes and pad columns robustly. Do **not** import
  a third-party markdown parser — the pattern is regular enough to parse inline
  in ~30 lines.
- **ES module export scan.** Read each target file as a single string and run
  these regexes over the full contents (not line-by-line), because
  `export { … }` and `export { … } from` blocks span multiple lines in real
  libraries (e.g., `libraries/libuniverse/src/index.js:1–27` has three 6–10 line
  blocks).
  - Functions: `/export\s+(?:async\s+)?function\s+(\w+)/g` → group 1
  - Classes: `/export\s+class\s+(\w+)/g` → group 1
  - Variables: `/export\s+(?:const|let|var)\s+(\w+)/g` → group 1
  - Named export blocks:
    `/export\s+\{([\s\S]*?)\}(?:\s*from\s+["']([^"']+)["'])?/g` → parse group 1
    as a comma-separated list; for each entry, strip whitespace and newlines,
    handle `X as Y` (add the aliased name `Y`, which is what's publicly
    visible), add to the collected set. If group 2 is present (re-export form),
    also enqueue group 2's resolved file for recursive scanning — see §
    Recursive resolution below.
  - Wildcard re-exports: `/export\s+\*\s+from\s+["']([^"']+)["']/g` → enqueue
    the referenced file for recursive scanning.
  - Default: `/export\s+default\b/` → add the literal `"default"`.

  The `[\s\S]*?` class is deliberate — `.` does not cross newlines by default,
  and `[\s\S]` does. Use the `g` flag with no `m` anchor so blocks matching
  across newlines work. Do not attempt to handle
  `import { X }; export { X as Y }` chained across statements — none of the
  current libraries use that pattern. If one appears, add a regex for it.

- **Recursive resolution of re-exports.** The scanner must resolve the source
  path inside `export { … } from "…"` and `export * from "…"` in two cases:
  1. **Relative path** (e.g., `./generated/types/types.js`, as in
     `libraries/libtype/src/index.js`): resolve relative to the current file's
     directory and recurse.
  2. **Package specifier** (e.g., `@forwardimpact/libsyntheticgen`, as in
     `libraries/libuniverse/src/index.js`): map the package name to
     `libraries/<libname>/src/index.js` by stripping the `@forwardimpact/`
     prefix. Recurse into that file's export scan. This is the only
     package-specifier form the scanner must handle; no other registries or
     aliases are used in `libraries/`.

  Both cases share a visited set keyed by absolute file path to guard against
  cycles.

- **Circular re-exports.** libuniverse re-exports from libsyntheticgen,
  libsyntheticprose, libsyntheticrender via `@forwardimpact/libX` package
  specifiers (see `libraries/libuniverse/src/index.js:1–27`). The recursive
  resolution above handles this; the visited set prevents infinite loops if any
  library re-exports back into libuniverse (none do today).

- **Backticks in Key Exports cells.** The SKILL.md tables may write exports as
  `` `Cli` `` to render as inline code. Strip backticks before matching.

### CLI ergonomics

- `node scripts/check-skill-exports.js` — default, runs the check.
- `node scripts/check-skill-exports.js --verbose` — prints the resolved export
  set for each library, useful for debugging. Optional flag; the implementer may
  skip it if complexity isn't worth it.
- Exit code: 0 on success, 1 on any failure. Matches `check-exports-resolve.js`.

### Example error output

```
.claude/skills/libs-grpc-services/SKILL.md: librpc.RpcServer is not a public export
  available exports: Server, Client, createClient, createTracer, createGrpc,
                     createAuth, Rpc, Interceptor, HmacAuth, healthDefinition,
                     createHealthHandlers, ServingStatus
Checked 6 libs-* skill files, 33 library rows, 142 key exports.
3 missing.
```

## package.json changes

```diff
 "scripts": {
   "prestart": "bunx fit-pathway build",
   "start": "bunx serve public",
   "dev": "bunx fit-pathway dev",
-  "check": "bun run format && bun run lint && bun run layout && bun run check:exports",
+  "check": "bun run format && bun run lint && bun run layout && bun run check:exports && bun run check:skill-exports",
   "check:fix": "bun run format:fix && bun run lint:fix",
   "layout": "node scripts/check-package-layout.js",
   "check:exports": "node scripts/check-exports-resolve.js",
+  "check:skill-exports": "node scripts/check-skill-exports.js",
   "lint": "eslint .",
```

## Workflow edit

`.github/workflows/check-quality.yml` runs the existing checks as separate jobs:
`lint`, `format`, `layout`, `check-exports`. The new check needs a matching job.
Append after the existing `check-exports` block:

```diff
   check-exports:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
       - uses: ./.github/actions/bootstrap
       - run: bun run check:exports
+
+  check-skill-exports:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
+      - uses: ./.github/actions/bootstrap
+      - run: bun run check:skill-exports
```

The new job uses the same bootstrap action and runs the new `package.json`
script. Pin the checkout action to the exact SHA already used by the file. Do
not introduce a new checkout version.

## Verification

Run at the package root:

1. **Script runs clean on the Part 02 output.**

   ```sh
   node scripts/check-skill-exports.js
   ```

   Expected: exit 0, summary line prints the total counts and "All resolve."

2. **Script catches a synthetic drift.**

   Introduce a deliberate misspelling in
   `.claude/skills/libs-cli-and-tooling/SKILL.md` — change `Cli` to `CliXYZ` in
   one Key Exports cell — and re-run:

   ```sh
   node scripts/check-skill-exports.js; echo "exit=$?"
   ```

   Expected: exit 1, error message identifies
   `libs-cli-and-tooling/SKILL.md: libcli.CliXYZ is not a public export`. Revert
   the edit before continuing.

3. **`bun run check` chains the new script.**

   ```sh
   bun run check
   ```

   Expected: runs format, lint, layout, check:exports, check:skill-exports in
   that order, and exits 0. Intentionally break one Key Exports cell to confirm
   the chain halts; revert.

4. **CI workflow sanity.**

   ```sh
   rg -n 'check-skill-exports|check:skill-exports' .github/workflows/
   ```

   Expected: at least one hit showing the new `check-skill-exports` job and its
   `run:` line. If missing, the workflow edit from § Workflow edit was not
   applied — fix before committing.

5. **No false positives from libtelemetry subpath exports.** `libtelemetry`
   publishes `./tracer.js` as a subpath. Any Key Exports row listing `Tracer`
   (defined in `libraries/libtelemetry/src/tracer.js`) must resolve under the
   script. Confirm by running the check on the final Part 02 output.

6. **No false positives from libuniverse re-exports.**
   `libraries/libuniverse/src/index.js` contains
   `export { DslParser, … } from "@forwardimpact/libsyntheticgen"`. If Part 02
   lists `DslParser` under the libuniverse row (it shouldn't — the plan says
   leave re-exports out of libuniverse's row), the check still resolves because
   re-exports count as the importing file's public surface. The check should
   pass either way; the stylistic decision is Part 02's.

## Risks

1. **Regex-based ES module parsing is fragile.** A library using
   `export {\n  foo,\n  bar,\n} from "./x.js"` across multiple lines may break a
   line-by-line regex. Mitigation: the script reads each file as a whole string
   and runs the export-block regex with the `m` flag and multiline-friendly
   bracket matching. If any library uses unusual export syntax, the check fails
   loudly on that library — easy to diagnose.

2. **`export * from` cycles.** libuniverse re-exports from three other
   libraries. If one of those re-exports back (they don't today), the scan would
   infinite-loop. Mitigation: visited-set guard keyed by absolute file path.

3. **Subpath wildcards.** libui has `"./components/*": "./src/components/*.js"`.
   The script must **skip** wildcard subpaths when collecting target files —
   they are consumer-specific and can't be enumerated without a concrete import
   path. This matches the behaviour of `scripts/check-exports-resolve.js:46–48`
   which also skips wildcards.

4. **`./css/*` non-JS subpaths.** libui also has `"./css/*": "./src/css/*"`
   pointing at CSS files. The script must skip any subpath target whose file
   extension is not `.js`/`.mjs`. Matches consumer expectation: you don't
   "export" a symbol from a CSS file.

5. **libtype re-exports from generated code.** `libtype/src/index.js` does
   `export * from "./generated/types/types.js"`. The generated file is
   ~thousands of lines. Parsing it is slow but not unacceptable (~100ms). If the
   check becomes a CI bottleneck, add a cache keyed by file mtime. Not worth
   doing in Part 04 unless measurement shows a problem.

6. **New failure mode in CI.** After Part 04 merges, any library refactor that
   removes a public export without updating the corresponding `libs-*/SKILL.md`
   row fails CI. This is intentional and is the success criterion. Document in
   the script's error output how to fix: "Update the Key Exports cell in
   <SKILL.md> to match, or restore the export."

## Commit

One commit:

```
feat(ci): add check:skill-exports script (spec 400 part 4/4)

New script scripts/check-skill-exports.js asserts every name in a
`Key Exports` cell of a libs-*/SKILL.md resolves to a public export of
the corresponding library package. Wired into `bun run check` for
local runs, and added as a new `check-skill-exports` job in
.github/workflows/check-quality.yml so drift fails in CI too.

Structurally equivalent to scripts/check-exports-resolve.js (spec 390):
strict-positive resolution only (the reverse direction is intentionally
not checked).
```

— Staff Engineer 🛠️
