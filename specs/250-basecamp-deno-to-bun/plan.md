# Plan 250 — Migrate Basecamp from Deno to Bun

## Approach

Migrate bottom-up: FFI layer first (the only non-trivial change), then build
script, then justfile/config/CI. Each step is independently testable before
moving to the next.

The FFI migration is the critical path. Deno and Bun use similar `dlopen` APIs
but differ in pointer handling — Bun uses `ptr()` from `bun:ffi` instead of
`Deno.UnsafePointer.of()`, and returns raw `number` pointers rather than opaque
`Deno.UnsafePointer` objects. The rest of the migration is mechanical
find-and-replace.

## Step 1 — Rewrite `posix-spawn.js` to `bun:ffi`

**File:** `products/basecamp/src/posix-spawn.js`

Replace Deno FFI primitives with Bun equivalents:

| Deno API                      | Bun equivalent                                                                               | Notes                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `Deno.dlopen(path, symbols)`  | `import { dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi"` then `dlopen(path, symbols)` | Bun's `dlopen` returns `{ symbols }` identically    |
| `Deno.UnsafePointer.of(buf)`  | `ptr(buf)`                                                                                   | Returns a `number` (not BigInt)                     |
| `Deno.UnsafePointer.value(p)` | Direct use — `ptr()` already returns a number                                                | Deno wraps pointers in objects; Bun doesn't         |
| `Deno.open("/dev/fd/N")`      | `Bun.file("/dev/fd/N").stream()`                                                             | For async pipe reads in `readAll()`                 |
| `Deno.env.toObject()`         | `process.env` (spread to plain object)                                                       | `{ ...process.env }` gives `Record<string, string>` |

Specific changes:

1. Remove `/// <reference lib="deno.ns" />` and the Deno comment header.
2. Add `import { dlopen, ptr } from "bun:ffi"` at the top.
3. Replace both `Deno.dlopen()` calls with `dlopen()` from `bun:ffi`. The symbol
   definition format is identical — both use
   `{ parameters: [...], result: "..." }`. Both runtimes support the `"buffer"`
   parameter type for accepting TypedArrays (used by `posix_spawn` and
   `posix_spawn_file_actions_addchdir_np`), so no type changes are needed.
   Verify `"buffer"` works by loading the library: if Bun doesn't recognize the
   type, `dlopen()` throws immediately.
4. In `buildStringArray()`: replace
   `Deno.UnsafePointer.value(Deno.UnsafePointer.of(buffers[i]))` with
   `BigInt(ptr(buffers[i]))`. The `BigInt64Array` needs BigInt values, and Bun's
   `ptr()` returns a number.
5. In `createPipe()`: replace `Deno.UnsafePointer.of(fds)` with `ptr(fds)`.
6. In `readAll()`: replace `Deno.open("/dev/fd/N")` with
   `Bun.file("/dev/fd/N").stream()`, then collect the stream to text. The
   `Response(readable).text()` pattern works with Bun streams too.
7. In `spawn()`: replace all `Deno.UnsafePointer.of(...)` calls with `ptr(...)`.
   Replace `Deno.env.toObject()` with `{ ...process.env }`.
8. In `waitForExit()`: replace `Deno.UnsafePointer.of(status)` with
   `ptr(status)`.

**Verify:** `bun products/basecamp/src/posix-spawn.js` should load without
errors (module parses and FFI symbols resolve on macOS).

## Step 2 — Migrate `pkg/build.js`

**File:** `products/basecamp/pkg/build.js`

1. Change shebang from `#!/usr/bin/env -S deno run --allow-all` to
   `#!/usr/bin/env bun`.
2. In `compileScheduler()`: replace the `deno compile` command array with
   `bun build --compile --outfile "${outputPath}" src/basecamp.js`.
3. At the CLI section (line 152): replace `Deno?.args || process.argv.slice(2)`
   with `process.argv.slice(2)`.
4. Update comments: "Compile Deno scheduler" → "Compile scheduler", remove the
   Deno references in the usage header.

**Verify:** `bun pkg/build.js --help` (or just the parse) runs without errors.
Full build verification happens after justfile updates.

## Step 3 — Update justfile recipes

**File:** `products/basecamp/justfile`

| Recipe            | Current                                                            | New                                                 |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| `build-scheduler` | `deno compile --allow-all --no-check --output ... src/basecamp.js` | `bun build --compile --outfile ... src/basecamp.js` |
| `run`             | `deno run --allow-all src/basecamp.js`                             | `bun src/basecamp.js`                               |
| `daemon`          | `deno run --allow-all src/basecamp.js --daemon`                    | `bun src/basecamp.js --daemon`                      |
| `run-task`        | `deno run --allow-all src/basecamp.js --run "{{ task }}"`          | `bun src/basecamp.js --run "{{ task }}"`            |
| `status`          | `deno run --allow-all src/basecamp.js --status`                    | `bun src/basecamp.js --status`                      |
| `init`            | `deno run --allow-all src/basecamp.js --init "{{ path }}"`         | `bun src/basecamp.js --init "{{ path }}"`           |

Update the `build-scheduler` comment from "Compile standalone Deno scheduler
binary" to "Compile standalone scheduler binary".

**Verify:** `just run` and `just status` work without Deno installed.

## Step 4 — Update `package.json` and delete `deno.json`

**File:** `products/basecamp/package.json`

Update the three build scripts:

```
"build":     "bun pkg/build.js"
"build:app": "bun pkg/build.js --app"
"build:pkg": "bun pkg/build.js --pkg"
```

Remove the `compilerOptions` field if present (that's in `deno.json`, but verify
`package.json` doesn't also carry Deno-specific config).

**File:** `products/basecamp/deno.json` — delete entirely.

**Verify:** `deno.json` no longer exists. `bun run build` invokes the correct
build script.

## Step 5 — Remove Deno from CI workflow

**File:** `.github/workflows/publish-macos.yml`

Delete lines 25–28 (the `Install Deno` step):

```yaml
      - name: Install Deno
        uses: denoland/setup-deno@667a34cdef165d8d2b2e98dde39547c9daac7282 # v2
        with:
          deno-version: "2.2.8"
```

**Verify:** The workflow YAML is valid and contains no remaining Deno
references.

## Step 6 — Final verification

Run the success criteria from the spec:

1. `cd products/basecamp && bun pkg/build.js` — produces `dist/fit-basecamp`.
2. `just build` — completes without Deno installed.
3. `just pkg` — produces `.pkg` installer.
4. Run compiled binary to verify posix_spawn works (requires Basecamp.app
   context with Calendar TCC access for full validation).
5. `grep -r 'Deno\.' products/basecamp/` — zero matches.
6. `grep -ri 'deno' .github/workflows/publish-macos.yml` — zero matches.
7. Confirm `products/basecamp/deno.json` does not exist.

## Ordering rationale

Steps 1–2 must come before 3–5 because the justfile `build-scheduler` recipe
calls the build script, which compiles source that includes the FFI module. If
the FFI module still references `Deno.*` when we switch to
`bun build --compile`, compilation will fail. The CI step (5) is last because
it's independent and lowest risk.

## Risks

- **`bun:ffi` pointer stability.** Bun's `ptr()` returns a JavaScript `number`,
  which is a 64-bit float. On macOS arm64, user-space pointers fit within
  Number.MAX_SAFE_INTEGER, so precision loss is not a concern. The
  `BigInt64Array` in `buildStringArray` needs `BigInt(ptr(...))` conversion.
- **`bun build --compile` binary size.** Bun standalone binaries are typically
  larger than Deno's. This affects the `.pkg` installer size but not
  functionality. No action needed — just awareness.
- **`readAll` async I/O.** Deno's `Deno.open()` returns an async file handle
  backed by Tokio. Bun's `Bun.file().stream()` provides equivalent async
  reading. The `new Response(readable).text()` pattern works in both runtimes.
