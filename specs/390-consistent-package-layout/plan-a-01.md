# Plan A — Part 01: Allowed-root-subdirs check infrastructure

Introduce the layout contract as an executable check, running in **permissive
mode** for the duration of the migration (Parts 02–07) and switched to **strict
mode** by Part 08. This part adds no enforcement against existing drift yet — it
only makes the drift visible.

## Scope

Add a new `bun run layout` script that walks every package under `products/`,
`services/`, and `libraries/`, lists each root subdirectory, and reports any
directory not on the allowed list. In permissive mode it prints the drift and
exits 0; in strict mode it exits non-zero.

This part also wires the new script into `bun run check` and the CI quality
workflow, so subsequent parts can see their progress with a single command.

## Files created

- `scripts/check-package-layout.js` — the check implementation (≈80 lines).

## Files modified

- `package.json` — add `layout` script; add `layout` to the `check` pipeline:
  ```jsonc
  "scripts": {
    "check": "bun run format && bun run lint && bun run layout",
    "check:fix": "bun run format:fix && bun run lint:fix",
    "layout": "node scripts/check-package-layout.js",
    // ...
  }
  ```
- `.github/workflows/check-quality.yml` — add a third job `layout`:
  ```yaml
  layout:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - uses: ./.github/actions/bootstrap
      - run: bun run layout
  ```
- `justfile` — add a `layout` recipe under `## ── Quality ──` for convenience:
  ```make
  # Check package layout against allowed-subdirs contract
  layout:
      bun run layout
  ```

## Check implementation

`scripts/check-package-layout.js` walks `products/*`, `services/*`, and
`libraries/*` and inspects each package directory. It takes an optional
`--strict` flag (default: permissive).

```js
#!/usr/bin/env node
// Check every package under products/, services/, libraries/ for conformance
// to the allowed-root-subdirs contract (spec 390).

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const ALLOWED_SUBDIRS = new Set([
  "bin",
  "config",
  "macos",
  "pkg",
  "proto",
  "schema",
  "src",
  "starter",
  "supabase",
  "templates",
  "test",
]);

// Dirs the working tree may contain but that are gitignored / out of scope.
const IGNORED_SUBDIRS = new Set(["node_modules"]);

const TIERS = ["products", "services", "libraries"];
const strict = process.argv.includes("--strict");

const violations = [];
const rootSourceFiles = [];

for (const tier of TIERS) {
  for (const pkgName of readdirSync(tier)) {
    const pkgDir = join(tier, pkgName);
    if (!statSync(pkgDir).isDirectory()) continue;

    for (const entry of readdirSync(pkgDir)) {
      const entryPath = join(pkgDir, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        if (IGNORED_SUBDIRS.has(entry)) continue;
        if (!ALLOWED_SUBDIRS.has(entry)) {
          violations.push({ pkg: pkgDir, subdir: entry });
        }
        continue;
      }

      // Root-level source files.
      if (entry.endsWith(".js") || entry.endsWith(".ts")) {
        // Services are allowed exactly two: index.js and server.js.
        if (tier === "services") {
          if (entry !== "index.js" && entry !== "server.js") {
            rootSourceFiles.push({ pkg: pkgDir, file: entry });
          }
        } else {
          rootSourceFiles.push({ pkg: pkgDir, file: entry });
        }
      }
    }
  }
}

if (violations.length || rootSourceFiles.length) {
  console.error("Package layout drift detected (spec 390):\n");

  if (violations.length) {
    console.error("  Non-allowed root subdirectories:");
    for (const v of violations) {
      console.error(`    ${v.pkg}/${v.subdir}/`);
    }
    console.error(
      "\n  Allowed: " + [...ALLOWED_SUBDIRS].sort().join(", ") + "\n",
    );
  }

  if (rootSourceFiles.length) {
    console.error("  Root-level source files (move into src/):");
    for (const f of rootSourceFiles) {
      console.error(`    ${f.pkg}/${f.file}`);
    }
    console.error(
      "\n  Services may keep only index.js and server.js at the root.\n",
    );
  }

  if (strict) {
    process.exit(1);
  }
  console.error("  (Permissive mode — not failing. Pass --strict to fail.)");
}
```

**Key design choices:**

- Uses `readdirSync` on the working tree (not `git ls-files`) because the check
  runs _before_ the working tree is committed and needs to see in-flight
  changes. `node_modules/` is explicitly skipped so `libskill/node_modules/`
  (created by Bun for workspace deps) does not trip the check.
- Permissive is the default so every intermediate commit in Parts 02–07 still
  passes CI. Strict mode is enabled in Part 08.
- Report is grouped by violation type for easy scanning — non-allowed subdirs
  first, then root source files.
- Output is plaintext (not JSON) because it runs in CI logs and in terminal.
  Adding JSON output later is easy; do not add it speculatively.

## Ordering

1. Write `scripts/check-package-layout.js`.
2. Add the `layout` script to `package.json`, wire it into `check`.
3. Add `layout` recipe to `justfile`.
4. Add the `layout` job to `check-quality.yml`.
5. Run `bun run layout` locally — **expect it to report drift** (that is the
   whole point of permissive mode). Verify the report lists all the
   non-conforming packages the spec calls out (`libui`, `libskill`,
   `libsyntheticgen`, `libharness`, `products/guide`, `products/map`, etc.).
6. Run `bun run check` — should pass (permissive mode exits 0 on drift).
7. Commit as `refactor(layout): add package layout contract check (permissive)`.
8. Push.

## Verification

- `bun run layout` prints the drift report and exits 0.
- `bun run layout --strict` prints the drift report and exits 1.
- `bun run check` exits 0.
- `bun run test` exits 0.
- Drift report includes at minimum: `products/guide/lib`,
  `products/map/activity`, `libraries/libharness/packages`,
  `libraries/libharness/fixture`, `libraries/libharness/mock`,
  `libraries/libskill/policies`, `libraries/libsyntheticgen/dsl`,
  `libraries/libsyntheticgen/engine`, `libraries/libsyntheticgen/tools`,
  `libraries/libsyntheticprose/engine`, `libraries/libsyntheticprose/prompts`,
  `libraries/libsyntheticrender/render`, `libraries/libui/components`,
  `libraries/libui/css`, and root `.js` files in every library that has them.

## Risks

- **False positives from `.ts` files.** Today no package uses `.ts` source at
  the root, but the check forbids them. That matches the spec's rule #1. No
  change required; flagged for the implementer so an unrelated `.ts` file
  introduction is caught quickly.
- **Permissive drift is invisible to CI.** The new `layout` job prints to stderr
  but exits 0 during the migration. A reviewer skimming the CI status page will
  not notice ongoing drift. Mitigation: Part 08 flips strict mode on. Between
  Part 01 and Part 08, drift is visible locally via `bun run layout` but not
  enforced in PRs — acceptable for the two-hour planning-to-landing window of
  this branch.
- **Running `node scripts/check-package-layout.js` from a subdirectory breaks.**
  The script uses relative paths (`products/`, `libraries/`, `services/`). Wire
  it exclusively via `bun run layout` from the monorepo root. Do not invoke
  directly.

## Deliverable commit

```
refactor(layout): add package layout contract check (permissive)

Introduces bun run layout, powered by scripts/check-package-layout.js,
which reports any package root subdir outside the allowed contract from
spec 390 and any root-level source file. Permissive by default — the
check prints drift but exits 0 until every package conforms and strict
mode is enabled in part 08.

Wires layout into bun run check and the check-quality CI workflow.

Part 01 of 08 for spec 390.
```

— Staff Engineer 🛠️
