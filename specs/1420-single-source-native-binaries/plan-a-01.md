# Plan 1420-a-01 — Compile-readiness fixes

Part 1 of [plan 1420-a](plan-a.md). Makes the shared `just build-binary` emit a
working, versioned binary for the three CLIs that cannot join the build today.
Independently executable on a branch off `origin/main`.

Libraries used: none (uses libcodegen's existing `protobufjs` + `long` deps).

## Step 1 — Bind `util.Long` for `fit-codegen`'s own proto loading

Add a side-effecting module that binds protobufjs's `util.Long` to the `long`
implementation, and import it at the top of the runtime proto-loading module so
the binding runs before any 64-bit field default is resolved.

- Created: `libraries/libcodegen/src/long-init.js`
- Modified: `libraries/libcodegen/src/base.js`

`libraries/libcodegen/src/long-init.js`:

```js
// protobufjs populates `util.Long` through a dynamic `inquire("long")` that
// `bun build --compile` cannot resolve, leaving it undefined when a 64-bit
// field default is computed — crashing the compiled fit-codegen binary at
// startup. Bind it explicitly. Imported for its side effect by the proto-
// loading module (base.js), not by the bin shim, because ES imports are
// hoisted above shim-body statements and would bind too late.
import protobuf from "protobufjs";
import Long from "long";

protobuf.util.Long = Long;
protobuf.configure();
```

The `protobuf.util.Long = Long; protobuf.configure();` pair is the exact binding
`libcodegen/src/types.js` (lines 62–69) already injects into *generated*
downstream code; this module applies the same proven, idempotent pattern to
`fit-codegen`'s **own** binary. In `libraries/libcodegen/src/base.js`, add the
side-effect import immediately after the existing `import protobuf from "protobufjs";`
(line 2):

```js
import protobuf from "protobufjs";
import "./long-init.js";
```

Verify: `just build-binary fit-codegen bun-linux-x64`, then run the compiled
binary against the repo's protos — `./dist/binaries/fit-codegen --all` completes
and `./dist/binaries/fit-codegen --version` prints the version and exits 0. The
`--all` run is the load-bearing check: it forces `base.js#loadProtobufRoot →
resolveAll()`, the 64-bit-default resolution that throws today, so a regressed or
absent `Long` binding fails here even if `--version`/`--help` pass.

## Step 2 — Read `FIT_WIKI_VERSION` in the `fit-wiki` bin

Give `fit-wiki` the env-injected version read with a source-execution
`readFileSync` fallback, matching the `fit-codegen` pattern, so the compiled
binary stops ENOENT-ing on its own `package.json`.

- Modified: `libraries/libwiki/bin/fit-wiki.js`

Replace the version resolution in `main()` (lines 19–24):

```js
  const version =
    runtime.proc.env.FIT_WIKI_VERSION ||
    JSON.parse(
      runtime.fsSync.readFileSync(
        new URL("../package.json", import.meta.url),
        "utf8",
      ),
    ).version;
```

(`just build-binary` upper-cases the bin name to `FIT_WIKI_VERSION` and injects
it via `--define`, so the `readFileSync` branch tree-shakes away in the binary.)

Verify: `just build-binary fit-wiki bun-linux-x64 && ./dist/binaries/fit-wiki --version` prints the version and exits 0 (today it exits ENOENT).

## Step 3 — Rename `fit-outpost`'s build-time version read

Rename the bin entry's version env read from `OUTPOST_VERSION` to
`FIT_OUTPOST_VERSION` — the name `just build-binary fit-outpost` injects (bin
name upper-cased, `-`→`_`) — so a shared build of `fit-outpost` carries its
version.

- Modified: `products/outpost/bin/fit-outpost.js`

Change the version read (lines 19–22):

```js
const VERSION =
  process.env.FIT_OUTPOST_VERSION ||
  JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"))
    .version;
```

The comment above it referencing `bun build --define` stays accurate. `pkg/build.js`'s
own scheduler compile (which injects `OUTPOST_VERSION` against `src/outpost.js`)
is retired in [Part 03](plan-a-03.md) together with the `publish-macos.yml`
rewire; leaving it until then keeps `just pkg` runnable on `main` between merges.

Verify: `just build-binary fit-outpost bun-linux-x64 && ./dist/binaries/fit-outpost --version && ./dist/binaries/fit-outpost --help` — version prints, help lists the commands (today the installer's `src/outpost.js` binary prints nothing; this builds the real bin entry instead).

## Risks

- The `long-init.js` binding must execute before `base.js`'s `#loadProtobufRoot`
  resolves any type. Placing the import directly under `base.js`'s own
  `protobufjs` import guarantees module-init order; do not move it into
  `bin/fit-codegen.js` (hoisting defeats it — see the design's rejected
  alternative).
