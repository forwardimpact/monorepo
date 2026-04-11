# 390 — Consistent Package Layout Across the Monorepo

Standardise the on-disk layout of every product, service, and library in the
monorepo so contributors and agents can predict where any file lives without
having to read the tree.

## Why

### The tree looks different in every package

The monorepo contains 47 packages (4 products, 9 services, 34 libraries). They
were written at different times, by different authors, under different implicit
conventions. Today there is no single layout an agent or contributor can rely
on:

- **Libraries** dump source files straight at the package root — `index.js` sits
  next to `base.js`, `client.js`, `server.js`, `loader.js`, and so on.
  `libskill` has 20 `.js` files at its root; `libtelemetry` has 7; `librpc`,
  `libsupervise`, `libui`, `libutil`, and `libstorage` all follow the same
  pattern. No library uses `src/` (with the sole exception of `libeval`, which
  has both a root `index.js` and a `src/commands/` tree).
- **Products** are each laid out differently. `products/basecamp` has `src/` +
  `macos/` + a per-package `justfile` at the root. `products/guide` has no
  `src/` at all — it keeps a shared helper in `lib/status.js` at the root.
  `products/map` sprawls across `src/`, `activity/`, `schema/`, `supabase/`,
  `templates/`, `starter/`, plus a `bin/lib/commands/` tree. Only
  `products/pathway` resembles the intended shape of `src/` + `bin/` +
  `templates/` + `test/`. Each of these directories is reasonable in isolation —
  the problem is not that they exist, but that they are not documented as an
  allowed shape so new ones keep appearing.
- **Services** are actually uniform — `index.js` and `server.js` at the root,
  plus `proto/` and `test/`. The one outlier is `services/pathway`, which has
  grown a lone `src/serialize.js`.

Because each package is a little different, every task that touches a new
package begins with "where does the code live here?" Agents reason in the wrong
place, grep finds unexpected matches, and cross-package changes require studying
each layout from scratch.

### CLI entry points are mixed with their implementation

The rule "`bin/` is for entry-point scripts" is only partially held. In
`products/map`, `bin/` contains:

```
bin/fit-map.js
bin/lib/
  client.js
  package-root.js
  supabase-cli.js
  commands/
    activity.js
    getdx.js
    init.js
    people.js
```

So the Map product keeps its CLI subcommand handlers and shared helpers beneath
`bin/lib/`, while the Pathway product keeps identical-purpose code beneath
`src/commands/`. Both are CLIs. Both solve the same problem. An agent reading
one product cannot transfer what it learns to the other.

### Domain folders at the root erode the contract

Several packages have grown top-level domain folders that are not in any
documented allowed-list:

| Package                                                                 | Non-conforming root subdirs                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `products/guide`                                                        | `lib/` (as a root dir, not under `src/`)                    |
| `products/map`                                                          | `activity/`                                                 |
| `libraries/libui`                                                       | `components/`, `css/` (alongside 12 root-level `.js` files) |
| `libraries/libsyntheticgen`                                             | `dsl/`, `engine/`, `tools/`                                 |
| `libraries/libsyntheticprose`                                           | `engine/`, `prompts/`                                       |
| `libraries/libsyntheticrender`                                          | `render/`                                                   |
| `libraries/libharness`                                                  | `fixture/`, `mock/`, `packages/`                            |
| `libraries/libgraph`, `libmemory`, `libtelemetry`, `libvector`          | `index/`                                                    |
| `libraries/libagent`, `libgraph`, `libresource`, `libtool`, `libvector` | `processor/`                                                |

Some of these are reasonable domain groupings, some are just code that leaked
out of `src/` because `src/` never existed. Without an allowed-list contract at
the package root, each new folder feels equally valid and the layout keeps
drifting.

Separately, a few packages carry top-level directories that are not code but
that do earn their place at the package root:

- `products/map/schema/` — published JSON Schema and SHACL files consumers read
  via subpath exports.
- `products/map/supabase/` — the Supabase edge project (config, migrations, and
  edge-function sources treated as one unit by `supabase` tooling).
- `products/basecamp/macos/` — the packaged macOS app bundle.
- `products/basecamp/config/` — the only package with checked-in runtime config
  today (`scheduler.json`).
- `products/basecamp/pkg/` — the only package with build / packaging artifacts
  today (`build.js` and `macos/` staging for the app bundle).
- `test/` — directory used by 45 of the 47 packages for test files.

None of these are code that leaked out of `src/`. The spec keeps them and adds
them to the allowed-list rather than relocating them (see "Allowed root subdirs"
below).

### Downstream consequences

The inconsistency is paid for every day:

- Agents writing code in an unfamiliar package have to audit the layout first,
  burning context on structural discovery rather than the task.
- Grep results include unrelated files — searching inside `src/` is useless in
  33 of 34 libraries because there is no `src/`.
- `CLAUDE.md` already tries to describe the structure, but it can only describe
  a _target_; it cannot describe what is actually on disk because no two
  packages agree.
- Product skills and library skills repeat "code lives at `foo/bar.js`" for
  every library, because the location genuinely differs.
- External users install via npm. Deep exports like
  `@forwardimpact/map/activity/queries/org` and
  `@forwardimpact/libskill/derivation` reference real on-disk paths, so the
  current layout is encoded into every downstream consumer.

## What

Adopt a single package layout, document it as the contract in `CLAUDE.md`, and
bring every product, service, and library into conformance in one pass.

### Standard package layout

Every package in `products/`, `services/`, and `libraries/` uses the same
on-disk shape:

```
<package>/
  package.json            Required
  justfile                Per-package task runner (optional)
  src/                    All source files live here
    index.js              Package entry point (except services — see below)
    commands/             CLI subcommand handlers (if the package has a CLI)
    lib/                  Package-internal helpers, if needed
  bin/                    CLI entry-point scripts, one file per binary
  config/                 Checked-in configuration files (optional)
  macos/                  Packaged macOS app bundle, if the package ships one (optional)
  pkg/                    Packaging / distribution artifacts, non-source (optional)
  proto/                  Protobuf source files (optional)
  schema/                 Published schemas (JSON Schema, SHACL, etc.) (optional)
  starter/                Starter data that installs to a consumer's data dir (optional)
  supabase/               Supabase edge project — config, migrations, edge functions (optional)
  templates/              Template files consumed at runtime (optional)
  test/                   Test files
```

Any further subdirectories under `src/` are free-form — a package may add domain
subdirs (`commands/`, `formatters/`, `activity/`, `components/`, etc.) as its
codebase requires.

**Rules:**

1. **Source lives in `src/`.** No `.js`/`.ts` source files at the package root.
   The package's public entry point is `src/index.js`. Non-source root files
   (`package.json`, `README.md`, `.gitignore`, `justfile`, and similar metadata)
   are unaffected.

2. **Services are the one exception.** A service has `index.js` and `server.js`
   at the package root, because the runtime supervisor and the service harness
   load those two files by fixed path. All other service source files live under
   `src/`. Services do not have a `bin/` directory and do not have
   `src/index.js` — the two fixed-path files are the only entry points. `proto/`
   and `test/` stay at the service root like every other package.

3. **Allowed root subdirs are `bin/`, `config/`, `macos/`, `pkg/`, `proto/`,
   `schema/`, `src/`, `starter/`, `supabase/`, `templates/`, `test/`.** No other
   directories may appear at the package root. Anything that does not fit
   becomes a subdirectory of `src/`.

4. **`bin/` contains only entry-point scripts.** One file per CLI binary
   declared in `package.json`. No subdirectories. No shared helpers. Entry
   points should be thin — parse argv, hand off to code in `src/`.

5. **CLI subcommand handlers live under `src/commands/`.** One file per
   subcommand is the default. A package with only one command does not need a
   `commands/` directory.

6. **Package-internal libraries live under `src/lib/`.** Use `src/lib/` when a
   file is a general helper used across the package's other `src/` files. Do not
   create `src/lib/` for a single file — put it where it is used.

7. **Per-package `justfile` files are allowed.** A package may have its own
   `justfile` at the root when it has meaningful package-local task targets (for
   example `products/basecamp/justfile`). The top-level `justfile` remains the
   primary entry point; per-package `justfile` files complement it, they do not
   replace it.

### Services — exact shape

```
services/<name>/
  index.js                Service definition / exports (fixed path)
  server.js               Entry point for the service process (fixed path)
  proto/                  Protobuf source for this service
  src/                    Any additional source files used by index.js/server.js
  test/
  package.json
```

`index.js` and `server.js` may import from `src/`. They do not themselves
contain business logic beyond wiring.

### Additional structural improvements

While we are touching every package, also resolve these drifts:

1. **Move generated code out of the package root.** Any `generated/` or
   equivalent code-generation output directory inside a package (for example
   `libraries/librpc/generated/`) moves to `src/generated/` or is regenerated
   into `src/` by `fit-codegen`. Generated code is source code for the package
   that contains it.

2. **Fold `products/map/activity/` into `src/activity/`.** `activity/` contains
   queries, validation, and the shared people parser — this is source code that
   slipped out of `src/`. It moves wholesale, keeping the internal directory
   shape.

3. **Move `products/guide/lib/` into `src/lib/`.** Add a `src/index.js` so Guide
   matches every other package that is not a service.

4. **Remove `products/map/bin/lib/`.** `client.js`, `package-root.js`, and
   `supabase-cli.js` move to `src/lib/`. The `commands/` subtree moves to
   `src/commands/`. `bin/fit-map.js` imports from `src/` like every other binary
   in the monorepo.

5. **Fix `libraries/libharness`.** libharness is the outlier in every library
   audit — it has `index.js`, `fixture/`, `mock/`, and a stale `packages/` tree
   at the root, plus an orphan zero-byte file at
   `packages/libharness/mock/config.js`. Bring it into line with every other
   library:
   - Create `src/` and move the current root `index.js` to `src/index.js`.
   - Move `fixture/` to `src/fixture/` and `mock/` to `src/mock/`.
   - Delete the `packages/` tree. It contains a single zero-byte file with no
     importers anywhere in the repo and is residue from an aborted workspace
     experiment.
   - Rename the package description to match reality — it now provides shared
     test harness and mock infrastructure for the whole monorepo, not only
     Guide.
   - Update the `main`, `exports`, and `files` fields in `package.json` so they
     point at the new `src/` paths, and update every call site across the
     monorepo (services, libraries, tests) to import from the updated subpaths.

6. **Fix `services/pathway/`.** The pathway service is the one outlier in the
   services tier — it has already grown a lone `src/serialize.js` alongside the
   usual `index.js` and `server.js`. Under the new rules that is correct shape,
   but the service's `index.js` and `server.js` still reference code at the
   service root rather than at `src/`. Make the service match the services
   template exactly: root files load from `./src/...` and any stray source file
   at the service root moves into `src/`.

7. **Keep `products/pathway/src/formatters/` as the canonical home for
   formatters.** Pathway already has `src/commands/` and `src/formatters/`. Both
   are legitimate under the new rules. No change required, but document
   `src/formatters/` as the canonical place for output formatters that multiple
   commands share.

8. **Reconsider domain subdirs inside libraries.** The `dsl/`, `engine/`,
   `processor/`, `index/`, `render/`, `prompts/`, `components/`, `css/`,
   `tools/` directories that currently live at library roots all move to
   `src/<name>/` as-is. They keep their current name, just shift one level down.

9. **Keep the exceptions called out in `CLAUDE.md` as exceptions.** `libskill`
   remains a pure-function library, `libui` remains a functional DOM library,
   `libsecret` remains stateless crypto, `libtype` remains generated code. The
   layout rules apply to all four — `src/index.js`, no root-level sources — but
   their _internal_ style (no classes, no OO+DI) is preserved. The OO+DI
   exceptions in `CLAUDE.md § OO+DI Architecture` are about _what the code looks
   like_, not _where it lives_.

### Package exports point directly at `src/`

Published `package.json` `main`, `bin`, and `exports` fields point directly at
files under `src/`. No root-level proxy file. No publish-time build step that
flattens `src/`. `products/map` already ships this way and it works cleanly.

Why this over the alternatives:

- **A publish-time flatten is a standing liability.** Every library's publish
  step has to be kept in sync with its source layout; a misconfigured flatten
  silently ships the wrong files; tests exercise the source but users exercise
  the built artifact, so drift goes unnoticed until a consumer breaks. The
  monorepo has no transpile steps today and should not acquire one for this.
- **A root-level `index.js` that re-exports from `src/` defeats the rule.** If
  every library keeps a proxy at the root, the "no source at the root" rule
  becomes cosmetic.
- **The public import specifier does not change.** Consumers keep writing
  `import { derive } from "@forwardimpact/libskill/derivation"`; the `exports`
  map resolves that to `./src/derivation.js`. `/src/` never appears in the
  consumer's import path.
- **Deep-import paths stay 1:1 with on-disk paths.** An agent debugging a
  subpath import sees the same path in the consumer and on disk.

The shape looks like:

```jsonc
{
  "main": "./src/index.js",
  "bin": { "fit-<name>": "./bin/fit-<name>.js" },
  "exports": {
    ".": "./src/index.js",
    "./derivation": "./src/derivation.js"
  },
  "files": ["src/**/*.js", "bin/**/*.js"]
}
```

The only thing that breaks is code that reaches _around_ the `exports` map —
imports that bypass the subpath alias and hit a file path directly. Success
criterion #9 requires a grep to confirm there are none.

### CLAUDE.md is the contract

The standard layout is documented in a new section of `CLAUDE.md` (under
`## Structure`). The section is the single canonical description of the expected
package shape. No other document restates it; they reference this section.
Future new packages copy the shape rather than invent one.

## Scope

### In scope

- Every package under `products/`, `services/`, and `libraries/`.
- Every `package.json` `main`, `bin`, and `exports` field whose paths move —
  rewritten to point directly at `src/` paths, with no root-level proxy files
  and no build step.
- Every import statement across the monorepo that references a moved file — both
  internal workspace imports and deep subpath imports of `@forwardimpact/*`
  packages.
- Generated-code output directories that live inside packages.
- The `libraries/libharness` restructure — `src/`, deletion of the stale
  `packages/` tree, updated description, and updated call sites.
- `CLAUDE.md § Structure` — updated to describe the new layout and the allowed
  root subdirs as a contract. Also reconciled with on-disk reality: the current
  example tree lists `products/landmark/` and `products/summit/`, which do not
  exist as packages yet.
- Skill files under `.claude/skills/libs-*` and `.claude/skills/fit-*` that
  describe library and product internals — updated to reference the new paths.
- Product internals pages under `website/docs/internals/` that show file-tree
  diagrams — updated to reflect the new layout.

### Out of scope

- Code behaviour changes. No function signatures, no new features, no bug fixes
  that are not strictly required to make the move land. If a test fails after
  the move, the fix is "adjust the import" or "adjust the path" — not "rewrite
  the code".
- OO+DI migration (spec 070 already landed). This spec does not change how
  classes are constructed, only where the files live.
- The internal structure of `libskill`, `libui`, `libsecret`, or `libtype`
  beyond moving files into `src/`. These libraries keep their current
  intentional designs.
- Service protocol or wire-format changes. `proto/` files stay where they are
  relative to the package root.
- Wiki content under `wiki/` (it is a submodule and not a package).
- `website/`, `data/`, `config/`, `specs/`, and other monorepo-root directories.
  This spec only standardises the shape _inside_ each package.
- Renaming or merging packages. Each existing package keeps its name and its
  boundary.
- Versioning strategy. Whether the layout move is a major, minor, or patch bump
  for each package is a release question, handled separately.

## Success criteria

1. **Root-level source is zero in products and libraries.** For every package
   under `products/` and `libraries/`, `git ls-files '<pkg>/*.js' '<pkg>/*.ts'`
   returns nothing. No `.js` or `.ts` source file sits at the package root in
   any product or library.

2. **Services have exactly two root source files.** For every service under
   `services/`, `git ls-files 'services/<name>/*.js'` returns exactly
   `services/<name>/index.js` and `services/<name>/server.js` — nothing else.

3. **Allowed-list is enforced.** `just check` runs an allowed-root-subdirs check
   that lists every directory at every package root under `products/`,
   `services/`, and `libraries/`, and fails with a clear diff if any directory
   is not one of `bin/`, `config/`, `macos/`, `pkg/`, `proto/`, `schema/`,
   `src/`, `starter/`, `supabase/`, `templates/`, or `test/`. The check runs in
   CI and must pass.

4. **Every non-service package has `src/index.js`.** `ls src/index.js` in every
   `products/*` and every `libraries/*` returns the file. No product or library
   uses a root `index.js` any more.

5. **`bin/` is flat.** For every package with a `bin/` directory,
   `find bin -mindepth 2` returns nothing. `bin/` contains only the entry-point
   script files listed in the package's `bin` field.

6. **CLI subcommands are under `src/commands/`.** Every file that implements a
   CLI subcommand lives in its package's `src/commands/` directory.
   Specifically, `products/map/bin/lib/commands/` no longer exists — its
   contents are under `products/map/src/commands/`.

7. **Tests pass with no weakening.** `just check` passes on the branch, and the
   diff between the pre-move and post-move test files contains only import-path
   changes and file-move renames. No test is disabled, skipped, or marked
   expected-failure as part of this move.

8. **`CLAUDE.md § Structure` describes the contract.** The section lists the
   allowed root subdirectories, documents the services exception and the
   per-package `justfile` allowance, points at the enforcement check, and no
   longer references `products/landmark/` or `products/summit/` as existing
   packages.

9. **Every published subpath export still resolves.** The set of public subpath
   keys published in `exports` across all `@forwardimpact/*` packages is the
   same after the move as before. Verifiable by enumerating the pre-move keys
   (`rg '"\./' libraries/*/package.json products/*/package.json`) and confirming
   the same set appears in the post-move package.json files, and by a
   fresh-install smoke test in a clean directory that imports each public
   subpath and asserts it resolves.

10. **libharness is restructured.** `libraries/libharness/packages/` no longer
    exists. `libharness`'s `fixture/` and `mock/` are under `src/`, along with a
    `src/index.js`. The package description in `package.json` no longer says
    "for guide tests" — it describes the cross-monorepo role.

## Risks

- **Published subpath exports are a large, silent blast radius.** Several
  packages (`@forwardimpact/map`, `@forwardimpact/libskill`,
  `@forwardimpact/libharness`) publish many deep subpath exports that reference
  specific on-disk files. Every export key has to keep resolving after the move,
  and a missed key breaks downstream installations only when a consumer happens
  to import that subpath — not at build time. The `exports`-pointing-at-`src/`
  strategy contains this to the internal paths, but the plan still needs an
  enumerated list of every published key and a fresh-install smoke test (see
  success criterion #9) to catch drift before cutting releases.

- **One big diff touches everything.** This is a repo-wide rename. It will
  conflict with any in-flight branch that edits files inside the moved
  directories. The change should land in a single commit, ideally during a quiet
  window, with open branches rebased immediately afterwards.

- **Codegen paths change.** `fit-codegen` currently writes generated code into
  each package's root-level `generated/` tree. Moving generated code into
  `src/generated/` means the codegen pipeline itself changes. If the pipeline is
  not updated atomically with the layout move, the first post-move
  `just codegen` run will put files back where they used to be.
