# 230 — Pathway Init for npm Installs

`fit-pathway init` crashes when Pathway is installed from npm. The `examples/`
directory was removed from the repository and was never included in the
published package. The init command attempts to copy example framework data from
a path that assumes monorepo layout, fails to find it, and throws. This blocks
the entire getting-started experience for npm users.

## Why

### The init command is the front door for new users

`fit-pathway init` is how engineers bootstrap a framework data directory. It is
the first command a new user runs after installing the package. When it crashes,
there is no workaround short of manually creating YAML files from scratch — a
task that requires knowledge of the schema, entity relationships, and directory
conventions that the init command exists to provide.

### Path resolution assumes monorepo layout

The init command resolves the source data path relative to the monorepo root
rather than relative to the installed package. This works during development but
fails in every npm install scenario — global installs, local installs, and
`bunx`/`npx` execution.

### The examples directory no longer exists

The `examples/` directory was removed from the repository. Even if path
resolution were fixed, there is no source data to copy. The published package's
`files` field in `package.json` does not include any starter data, so the
package ships without the material the init command needs.

### npm is the primary distribution channel

The monorepo is open source and the products are designed for external
consumption. Organizations install Pathway via npm and use coding agents to
drive the CLI. A broken init command means every new installation requires
manual intervention, undermining the self-service model.

## What

Make `fit-pathway init` work when Pathway is installed from npm, so that a
engineer can run `bun install @forwardimpact/pathway && bunx fit-pathway init`
and get a functional framework data directory.

### Requirements

1. **The init command must work from an npm install.** Running
   `bunx fit-pathway init` after installing the package must produce a usable
   framework data directory without errors.

2. **Scaffold a minimal but functional data directory.** The command must create
   `./data/pathway/` (or a user-specified path) containing enough data to run
   other Pathway commands. At minimum:
   - `framework.yaml` — framework metadata
   - `levels.yaml` — level definitions
   - One discipline file in `disciplines/`
   - One capability file in `capabilities/`
   - One behaviour file in `behaviours/`
   - One track file in `tracks/`

3. **Path resolution must be package-relative.** The init command must locate
   its source data relative to the installed package, not relative to a monorepo
   root. This applies to both the starter data and any templates or schemas the
   command references.

4. **The published package must include starter data.** The `files` field in
   `products/pathway/package.json` must include whatever directory or files the
   init command reads from. The starter data must ship with the package.

5. **Scaffolded data must pass validation.** Running `bunx fit-map validate`
   against the scaffolded directory must succeed. The starter data must conform
   to the current schema.

### Design considerations

Three approaches could satisfy these requirements:

- **Option A: Minimal examples directory.** Re-create a minimal `examples/`
  directory inside `products/pathway/` containing starter YAML files. Include it
  in the published package via the `files` field. The init command copies these
  files to the target directory. Straightforward, easy to maintain, easy to
  validate independently.

- **Option B: Embedded templates.** Embed the starter data as JavaScript objects
  or template strings inside the init command itself. No external files to
  manage or ship. Harder to validate independently and mixes data with code.

- **Option C: Programmatic generation.** Generate starter data at init time
  using existing schema definitions and defaults. More flexible but adds
  complexity and may produce data that drifts from what users expect.

### The `files` field in package.json

Whichever approach is chosen, `products/pathway/package.json` must be updated so
that the published package includes all files the init command depends on. Today
the `files` field likely includes only `bin/`, `src/`, and similar directories.
The starter data (whether in `examples/`, `data/`, or another location) must be
added.

## Out of Scope

- **Rich example data.** The scaffolded data should be minimal and functional,
  not a showcase of every feature. Users can extend it after initialization.
- **Interactive prompts.** The init command does not need to ask the user
  questions during scaffolding. A single command with sensible defaults is
  sufficient.
- **Migration from old examples.** There is no need to support upgrading from a
  previously initialized directory.
- **Changes to fit-map or other products.** Only the Pathway init command and
  its package configuration are in scope.
- **Publishing workflow changes.** The npm publish process itself is not
  changed, only the package contents.

## Success Criteria

1. `bun install @forwardimpact/pathway && bunx fit-pathway init` completes
   without errors and creates a `./data/pathway/` directory.

2. `bunx fit-pathway discipline --list` returns at least one discipline after
   running init.

3. `bunx fit-map validate` passes against the scaffolded data directory.

4. The init command contains no monorepo-relative paths — all source data is
   resolved relative to the package installation.

5. The published package (as defined by `files` in `package.json`) includes all
   data the init command needs.

## References

- Issue #148
