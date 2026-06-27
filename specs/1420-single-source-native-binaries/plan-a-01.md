# Plan 1420-a-01 — Compile-readiness fix

Part 1 of [plan 1420-a](plan-a.md). Makes the shared `just build-binary` emit a
working `fit-codegen` binary. Independently executable on a branch off
`origin/main`.

Libraries used: none (uses libcodegen's existing `protobufjs` + `long` deps).

## Bind `util.Long` for `fit-codegen`'s own proto loading

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
side-effect import immediately after the existing
`import protobuf from "protobufjs";` (line 2):

```js
import protobuf from "protobufjs";
import "./long-init.js";
```

Verify: `just build-binary fit-codegen bun-linux-x64`, then run the compiled
binary against the repo's protos — `./dist/binaries/fit-codegen --all` completes
and `./dist/binaries/fit-codegen --version` prints the version and exits 0. The
`--all` run is the load-bearing check: it forces
`base.js#loadProtobufRoot → resolveAll()`, the 64-bit-default resolution that
throws today, so a regressed or absent `Long` binding fails here even if
`--version`/`--help` pass.

## Risks

- The `long-init.js` binding must execute before `base.js`'s `#loadProtobufRoot`
  resolves any type. Placing the import directly under `base.js`'s own
  `protobufjs` import guarantees module-init order; do not move it into
  `bin/fit-codegen.js` (hoisting defeats it — see the design's rejected
  alternative).
