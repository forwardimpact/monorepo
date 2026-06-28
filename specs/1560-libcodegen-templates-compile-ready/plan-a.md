# Plan 1560 — Compiled `fit-codegen` Runs Codegen to Completion

Spec: [spec.md](spec.md). Design: [design-a.md](design-a.md).

## Approach

Wire `fit-codegen` into spec 1420's existing embedded-asset mechanism. The
`templates/` directory is declared as a compile asset,
`CodegenBase.loadTemplate` branches to the virtual mount when assets are active,
and the codegen instances receive the overlay `fsSync`. Both `runExports`
directory scans are sorted, and the `fit-codegen` build-gate smoke is replaced
with a five-render-path generation invocation.

Libraries used: libcli (`embeddedDir`, `embeddedAssetsActive`,
`withEmbeddedAssets`, `registerAssets`), libmock (`createTestRuntime`, test
only).

## Step 1: Declare the templates asset for `fit-codegen`

Make the compiled `fit-codegen` binary inline the 5 mustache templates.

Files: modified `build/cli-manifest.json`.

Add an `assets` block to the `fit-codegen` CLI entry (sibling of `name` /
`targets` / `bundle`), matching the `fit-terrain` shape:

```json
"assets": [
  {
    "from": "libraries/libcodegen/templates",
    "mount": "libcodegen/templates"
  }
]
```

`gen-embed.mjs` inlines every non-code file under `from` (the 5 `.mustache`
files) and emits `registerAssets("libcodegen/templates", {...})`.

Verify:
`bun build/gen-embed.mjs fit-codegen libraries/libcodegen/bin/fit-codegen.js dist/.embed`
prints a shim path; the generated `dist/.embed/fit-codegen.assets.mjs` contains
5 text imports and one `registerAssets("libcodegen/templates", …)` call.

## Step 2: Branch `loadTemplate` to the embedded mount

Resolve templates from the virtual mount in a compiled binary, on-disk
otherwise.

Files: modified `libraries/libcodegen/src/base.js`.

Add the import at top:

```js
import { embeddedAssetsActive, embeddedDir } from "@forwardimpact/libcli";
```

Replace the directory computation in `loadTemplate` (currently
`fileURLToPath(import.meta.url)` → `join(__dirname, "..", "templates", …)`) so
the base directory is chosen first, then the filename is joined onto it:

```js
loadTemplate(kind) {
  const templatesDir = embeddedAssetsActive()
    ? embeddedDir("libcodegen/templates")
    : this.#path.join(
        this.#path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "templates",
      );
  const templatePath = this.#path.join(templatesDir, `${kind}.js.mustache`);
  if (!this.#fs.existsSync(templatePath)) {
    throw new Error(`Missing ${kind}.js.mustache template`);
  }
  return this.#fs.readFileSync(templatePath, "utf8");
}
```

The `existsSync`/`readFileSync` calls and the throw-on-missing message are
unchanged.

Verify: `cd libraries/libcodegen && bun test` passes (Step 4 adds the branch
coverage).

## Step 3: Inject the embedded-overlay fs into the codegen instances

Make `loadTemplate`'s reads of the virtual mount hit the registry in a compiled
binary, while non-codegen disk reads keep the bare `fs`.

Files: modified `libraries/libcodegen/bin/fit-codegen.js`.

Add `withEmbeddedAssets` to the existing libcli import. In `runCodegen`, build
the codegen fs once and pass it to `createCodegen` in place of the bare `fs`
(the `runtime` argument is `createCodegen`'s pre-existing 7th parameter — only
the 6th, `fs`, changes):

```js
import { createCli, SummaryRenderer, withEmbeddedAssets } from "@forwardimpact/libcli";
// …
const codegenFs = withEmbeddedAssets(runtime).fsSync;
const codegens = createCodegen(
  protoDirs,
  projectRoot,
  path,
  mustache,
  protoLoader,
  codegenFs,
  runtime,
);
```

`withEmbeddedAssets` is a no-op in source/`npx` execution (returns `runtime`
unchanged), so `runtime.fsSync` (the full `node:fs` sync surface) is injected
there; in the compiled binary it overlays `existsSync`/`readFileSync` for the
virtual mount. All other sync methods (`readdirSync`, `statSync`,
`writeFileSync`, `mkdirSync`) are spread through unchanged.

Verify: `just codegen` produces a `generated/` tree identical to a pre-change
run (SC#4, checked in Step 6).

## Step 4: Cover both `loadTemplate` branches

Pin the source branch and the embedded branch with unit assertions.

Files: created `libraries/libcodegen/test/base.test.js`.

Construct a `CodegenBase` via the `discoverProtoDirs`/`createBase` helper
pattern from `test/metadata.test.js` (`createTestRuntime` from libmock). Import
`registerAssets`, `withEmbeddedAssets` from `@forwardimpact/libcli`.

`registerAssets` writes a process-global registry, so the first call flips
`embeddedAssetsActive()` true for the rest of the file (libcli embed.js has no
reset). The two branches must therefore be declared in this order, and the
embedded `describe` must be the file's last:

- **Source branch (declared first)**: `loadTemplate("service")` returns a
  non-empty string containing template markup;
  `loadTemplate("definitions-exports")` and `loadTemplate("services-exports")`
  each return non-empty; an unknown kind throws `Missing <kind>.js.mustache`.
  (These must run before any `registerAssets` call, hence first.)
- **Embedded branch (declared last)**: call
  `registerAssets("libcodegen/templates", { "service.js.mustache": "EMBEDDED" })`,
  build a base with `withEmbeddedAssets(createTestRuntime()).fsSync` as the
  injected `fs`, and assert `loadTemplate("service")` returns `"EMBEDDED"`
  (proves the `embeddedAssetsActive()` branch + `embeddedDir` join resolve
  through the overlay).

`node:test` runs top-level `describe`/`test` in declaration order within a file,
so source-branch-first keeps the global flag false until the embedded block.

Verify: `cd libraries/libcodegen && bun test test/base.test.js` passes; run
twice to confirm order-stability.

## Step 5: Sort the two `runExports` directory scans

Make exports output deterministic across filesystems (spec "Rendered output").

Files: modified `libraries/libcodegen/src/services.js`,
`libraries/libcodegen/src/definitions.js`.

- `services.js:55` — `for (const dir of this.#base.fs.readdirSync(serviceDir))`
  → `for (const dir of this.#base.fs.readdirSync(serviceDir).sort())`.
- `definitions.js:62` —
  `for (const file of this.#base.fs.readdirSync(definitionsDir))` →
  `for (const file of this.#base.fs.readdirSync(definitionsDir).sort())`.

Verify: `just codegen` twice produces byte-identical
`generated/services/exports.js` and `generated/definitions/exports.js`.

## Step 6: Replace the `fit-codegen` build gate

Gate `fit-codegen` on a generation invocation exercising all 5 render paths;
keep `--help` smoke for every other CLI.

Files: modified `.github/workflows/build-binaries.yml`.

In the `Smoke gate` step (runs when `matrix.server != true`), branch on the CLI
name so `fit-codegen` runs a generation invocation instead of `--help`:

```sh
BIN="dist/binaries/${{ matrix.cli }}"
if [ "${{ matrix.cli }}" = "fit-codegen" ]; then
  # Exercises service/client/definition + both exports render paths (all 5
  # mustache kinds) against the same proto set `just codegen` resolved above;
  # skips --type (pbjs subprocess, out of scope). set -e fails on the
  # template-resolution error this spec fixes.
  "$BIN" --service --client --definition
else
  OUT="$("$BIN" --help 2>&1)"
  test -n "$OUT" || { echo "::error::${{ matrix.cli }} produced no output"; exit 1; }
fi
```

The step runs after `Ensure codegen is current` (`just codegen`) so the proto
set is materialized.

Verify: locally build and run the gate (Step 7).

## Step 7: End-to-end verification and negative-path demonstration

Files: none (verification only).

1. **Source parity (SC#4):** at base, `just codegen`; snapshot `generated/`.
   With the change applied, `just codegen` again; assert file-for-file
   identical.
2. **Compiled parity (SC#1, SC#2):**
   `just build-binary fit-codegen bun-linux-x64`; remove `generated/`; run
   `dist/binaries/fit-codegen --service --client --definition` (the same flag
   set the gate uses — avoids the out-of-scope `--type` pbjs path); assert exit
   0 and the resulting `services/` + `definitions/` trees match the source
   snapshot file-for-file.
3. **Negative path (SC#3):** temporarily remove the Step 1 `assets` entry,
   rebuild, run `dist/binaries/fit-codegen --service`; observe non-zero exit
   with `Missing service.js.mustache`. Restore the entry; rebuild; observe
   green. Record the result in the PR.
4. **npm-consumer parity (SC#5):** `cd libraries/libcodegen && npm pack`;
   install the tarball into a throwaway project; import `CodegenServices` and
   invoke a render path (`runExports`) without supplying a template
   path/loader/body; observe rendered output. Confirms the unchanged on-disk
   `import.meta.url` branch + shipped `templates/**` still serve npm consumers.
   If the offline environment cannot `npm pack`/install, inspect the packed file
   list for `templates/**` and confirm `loadTemplate`'s source branch is
   untouched; note the substitution in the PR.

## Risks

- The `bun build --compile` toolchain may be unavailable in the local
  implementation environment; if so, Steps 1–6 are still verifiable via unit
  tests and `gen-embed.mjs` dry-run, and Step 7.2/7.3 fall to the CI build
  matrix. Note any environment skip in the PR.
- `protobufjs-cli` pbjs resolution inside the compiled binary (`--type`) is a
  separate, pre-existing concern; the gate deliberately avoids `--type`, so a
  pbjs-in-binary failure (if one exists) is not masked nor introduced here.

## Execution

Single engineering agent, sequential. Steps 1–5 are code and independently
verifiable; Step 6 is CI config; Step 7 is verification. No parallelism
warranted.

— Staff Engineer 🛠️
