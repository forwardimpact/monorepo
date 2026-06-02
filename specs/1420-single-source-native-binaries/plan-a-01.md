# Plan 1420-a-01 — Compile-readiness fix

Part 1 of [plan 1420-a](plan-a.md). Makes the shared `just build-binary` emit a
working, versioned binary for `fit-codegen`, the one CLI still blocked from the
build. Independently executable on a branch off `origin/main`.

> **Two of this part's original three steps are already done.** A precursor
> change centralized CLI version resolution in libcli (`resolveVersion` reading
> a single injected `LIBCLI_VERSION` literal, with `createCli` auto-filling from
> each bin's `packageJsonUrl`). That landed the `fit-wiki` (was: ENOENT, no env
> branch) and `fit-outpost` defect-2 (was: `OUTPOST_VERSION` ≠
> `FIT_OUTPOST_VERSION`) version fixes, and removed the now-dead version
> `--define` from `pkg/build.js`. Only Step 1 below — the `fit-codegen`
> `util.Long` binding — remains. `fit-outpost` defect 1 (no-op `src/outpost.js`
> entry) is addressed in [Parts 02/03](plan-a.md), not here.

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

## Steps 2 & 3 — `fit-wiki` and `fit-outpost` version reads (resolved by precursor)

Originally this part also gave `fit-wiki` an env-injected version read and
renamed `fit-outpost`'s `OUTPOST_VERSION` read to `FIT_OUTPOST_VERSION`. The
libcli version-centralization precursor supersedes both: `createCli` now
resolves the version from each bin's `packageJsonUrl` via `resolveVersion`,
which reads the single injected `LIBCLI_VERSION` literal with a `package.json`
fallback. `fit-wiki` and `fit-outpost` both route through that path, so neither
per-bin env read exists any more, and the dead `OUTPOST_VERSION` `--define` is
already gone from `pkg/build.js`.

Already verified by the precursor (re-confirm on the integrated branch):

- `just build-binary fit-wiki bun-linux-x64 && ./dist/binaries/fit-wiki --version` — prints the version and exits 0 (previously ENOENT).
- `just build-binary fit-outpost bun-linux-x64 && ./dist/binaries/fit-outpost --version` — prints the version (defect 2 fixed). Note: `--help` listing the commands still depends on compiling the **bin** entry rather than `src/outpost.js` — that entry fix (defect 1) lands in [Parts 02/03](plan-a.md).

## Risks

- The `long-init.js` binding must execute before `base.js`'s `#loadProtobufRoot`
  resolves any type. Placing the import directly under `base.js`'s own
  `protobufjs` import guarantees module-init order; do not move it into
  `bin/fit-codegen.js` (hoisting defeats it — see the design's rejected
  alternative).
