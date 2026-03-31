# Spec 250 — Migrate Basecamp from Deno to Bun

## Problem

Basecamp is the only product in the monorepo that depends on Deno. Every other
product and library runs on Bun. This creates unnecessary friction:

- **CI complexity.** The `publish-macos.yml` workflow installs both Deno 2.2.8
  and Bun. No other workflow needs Deno.
- **Developer setup.** Contributors working on Basecamp must install a second
  JavaScript runtime that nothing else in the repo uses.
- **Dual configuration.** Basecamp maintains both `deno.json` (tasks,
  compilerOptions) and `package.json` (scripts, npm metadata) for the same entry
  point.
- **Cognitive overhead.** The justfile, build script, and package.json all
  reference `deno run --allow-all` or `deno compile` while the rest of the
  monorepo uses `bun`.

Bun now supports `bun build --compile` for producing standalone binaries and
`bun:ffi` for native library calls — the two Deno-specific capabilities Basecamp
relies on. Eliminating Deno simplifies the toolchain to a single runtime.

## Scope

### In scope

1. **Binary compilation.** Replace `deno compile --allow-all --no-check` with
   `bun build --compile` for producing the `fit-basecamp` standalone binary.

2. **FFI migration.** Rewrite `src/posix-spawn.js` from `Deno.dlopen` /
   `Deno.UnsafePointer` to `bun:ffi` (`dlopen`, `ptr`, `toArrayBuffer`). The
   file uses these Deno APIs:
   - `Deno.dlopen()` — open `libquarantine.dylib` and `libSystem.B.dylib`
   - `Deno.UnsafePointer.of()` / `Deno.UnsafePointer.value()` — pointer
     arithmetic for C string arrays, pipe fd buffers, spawn attr structs
   - `Deno.open()` — async fd read via `/dev/fd/N`
   - `Deno.env.toObject()` — environment snapshot for child process

3. **Build script.** Migrate `pkg/build.js` from
   `#!/usr/bin/env -S deno run --allow-all` to run under Bun. Replace
   `Deno?.args` with `process.argv.slice(2)` (already partially done as
   fallback). The script otherwise uses only `node:fs`, `node:path`, and
   `node:child_process` — no other Deno APIs.

4. **Justfile recipes.** Update all recipes that reference
   `deno run --allow-all` or `deno compile` to use `bun` / `bun build --compile`
   equivalents.

5. **Package configuration.** Remove `deno.json` entirely. Update `package.json`
   build scripts from `deno run --allow-all pkg/build.js` to `bun pkg/build.js`.

6. **CI workflow.** Remove the `Install Deno` step from
   `.github/workflows/publish-macos.yml`. The workflow already installs Bun.

### Out of scope

- The Swift launcher (`macos/Basecamp/`) — no changes needed.
- Shell scripts (`pkg/macos/build-app.sh`, `build-pkg.sh`, `uninstall.sh`) —
  they do not reference Deno.
- npm publishing workflow (`publish-npm.yml`) — ships source JS, not compiled
  binary; already uses Bun.
- Runtime behaviour changes — the scheduler's features, config, and knowledge
  base management are unchanged.

## Affected files

| File                                   | Change                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `products/basecamp/src/posix-spawn.js` | Rewrite FFI from Deno to `bun:ffi`                                                          |
| `products/basecamp/pkg/build.js`       | Shebang → `#!/usr/bin/env bun`, `deno compile` → `bun build --compile`, remove `Deno?.args` |
| `products/basecamp/justfile`           | All `deno` commands → `bun` equivalents                                                     |
| `products/basecamp/package.json`       | Build scripts → `bun pkg/build.js`                                                          |
| `products/basecamp/deno.json`          | Delete                                                                                      |
| `.github/workflows/publish-macos.yml`  | Remove `Install Deno` step                                                                  |

## Success criteria

1. `bun pkg/build.js` produces a working `dist/fit-basecamp` standalone binary.
2. `just build` completes without Deno installed.
3. `just pkg` produces a `.pkg` installer with the Bun-compiled binary.
4. The compiled binary correctly spawns child processes via posix_spawn with TCC
   responsibility disclaimer (verify by running inside Basecamp.app with
   Calendar access).
5. `publish-macos.yml` no longer references Deno in any step.
6. `deno.json` no longer exists in `products/basecamp/`.
7. `grep -r 'Deno\.' products/basecamp/` returns zero matches.
