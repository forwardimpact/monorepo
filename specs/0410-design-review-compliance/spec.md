# Spec 0410 — Design Review Compliance

## Problem

A full technical design review of all six products against the rules in
CLAUDE.md, CONTRIBUTING.md, and the shared library skills found violations in
four products (map, pathway, basecamp, summit) and one library (libdoc). Two
products (guide, landmark) are fully compliant. Tests pass (2317/2317), but
`bun run check` fails due to layout drift.

The violations cluster into six categories, ordered by severity.

### 1. Operational logging bypasses libtelemetry (96 occurrences)

CLAUDE.md (via libs-service-infrastructure SKILL.md) requires `createLogger`
from `@forwardimpact/libtelemetry` for all operational output. `logger.info`
writes to stderr; stdout stays clean for data.

Three packages use `console.log` for operational output instead:

| Package                        | Files | Occurrences |
| ------------------------------ | ----- | ----------- |
| products/pathway/src/commands/ | 17    | 73          |
| products/basecamp/src/         | 3     | 23          |
| libraries/libdoc/src/          | 2     | 10          |

**Evidence:**

- `products/pathway/src/commands/build.js` — 20 `console.log` calls for build
  progress and status messages (e.g., "Building site...", file counts).
- `products/basecamp/src/basecamp.js` — 12 `console.log` calls for daemon
  status, validation output, and operational messages.
- `libraries/libdoc/src/builder.js` — 7 `console.log` calls for build progress
  checkmarks ("Building documentation...", asset copy confirmations).

These pollute stdout with status messages, breaking pipelines that parse
structured output. guide, landmark, summit, and map have zero `console.log` in
their source — they demonstrate the correct pattern.

### 2. Export contract violations

CLAUDE.md states: "Published `package.json` `main`, `bin`, and `exports` fields
point directly at files under `src/`."

**map: 8 exports point outside `src/`.** `products/map/package.json` lines 49-56
export paths under `supabase/functions/_shared/activity/` (storage, extract,
transform modules). These are Supabase Edge Function internals exposed as
package exports, violating the `src/`-only export rule.

**pathway: 2 dead exports reference non-existent files.**
`products/pathway/src/commands/index.js` lines 19-20 re-export `runServeCommand`
from `./serve.js` and `runSiteCommand` from `./site.js`. Neither file exists.
Since `package.json` exports `"./commands"` pointing to this index, importing
the module will fail at parse time when the JS engine tries to resolve the
missing files — regardless of whether the consumer destructures those specific
symbols.

### 3. Dependency classification error

CONTRIBUTING.md classifies backend-specific dependencies as
`optionalDependencies` with dynamic `import()` wrapped in `try/catch`.

**summit: `@supabase/supabase-js` is synchronous and misclassified.**
`products/summit/src/lib/supabase.js` line 9 imports `createClient` with a
static ESM `import` statement. The package is declared in `dependencies` instead
of `optionalDependencies`. Summit works without Supabase (via `--roster <path>`
flag), making this backend-specific. The factory function already has the right
error message pattern — it's just unreachable when the import itself fails.

### 4. OO+DI violation

CLAUDE.md requires constructor-injected dependencies with factory functions,
wired at composition roots. No module-level singletons.

**pathway: Module-level singleton.**
`products/pathway/src/commands/agent-list.js` line 19 creates a
`SummaryRenderer` instance at module scope:

```
const summary = new SummaryRenderer({ process });
```

This is a module-level singleton — it executes on import, not at the composition
root. It cannot be replaced in tests.

### 5. Hardcoded credential in source

CONTRIBUTING.md requires no hardcoded secrets in source code.

**map: Demo JWT token in source.** `products/map/src/commands/activity.js` line
30 writes a Supabase demo service role key directly in a `process.stdout.write`
call. While this is a well-known Supabase local development token (not a
production secret), embedding any credential string in source code violates the
policy.

### 6. Layout check failure (infrastructure)

`bun run check` runs `check-package-layout.js` which scans the filesystem. It
currently fails:

```
Non-allowed root subdirectories:
  libraries/librpc/generated/
  libraries/libtype/generated/
```

These directories are gitignored (`**/generated` in `.gitignore`) and created at
runtime by `just codegen`. The layout checker treats them as non-allowed root
subdirectories, producing a false-positive failure after code generation runs.
The checker's `IGNORED_SUBDIRS` set contains only `node_modules`.

## Scope

### In scope

- **pathway** — Eliminate operational `console.log` usage across 17 command
  files (73 occurrences). Remove dead `serve.js`/`site.js` re-exports from the
  commands index. Fix module-level `SummaryRenderer` singleton.
- **basecamp** — Eliminate operational `console.log` usage across 3 source files
  (23 occurrences).
- **map** — Bring 8 `supabase/`-rooted export targets into compliance with the
  `src/`-only export rule. Note: map's `supabase/` directory contains Edge
  Function code that consumes these modules via relative imports. The plan must
  account for this — ensuring Edge Function internal imports continue to resolve
  after the export targets change. Remove the hardcoded demo JWT from source.
- **summit** — Reclassify `@supabase/supabase-js` as a backend-specific optional
  dependency per CONTRIBUTING.md policy, ensuring summit remains usable without
  Supabase installed.
- **libdoc** — Eliminate operational `console.log` usage across 2 source files
  (10 occurrences).
- **check-package-layout.js** — Fix false-positive layout failure for
  runtime-generated gitignored directories (`generated/`).

### Out of scope

- guide and landmark (fully compliant, no changes needed).
- Services (zero `console.log` — already compliant).
- Test files (`console.log` in tests is acceptable).
- Library `bin/` scripts (thin CLI entry points; operational logging is
  acceptable for one-off tools).
- Map's Supabase Edge Function internal code (only the package export paths are
  in scope, not the Edge Function source itself).

## Success Criteria

1. Zero `console.log` call sites in `products/pathway/src/`,
   `products/basecamp/src/`, and `libraries/libdoc/src/` — verified by
   `grep -rn "console\.log("` (targeting function calls, not string literals or
   comments).
2. All `exports` entries in `products/map/package.json` point to files under
   `src/` or `schema/`.
3. Importing `@forwardimpact/pathway/commands` does not throw — every
   re-exported symbol resolves.
4. `@supabase/supabase-js` appears in `optionalDependencies` (not
   `dependencies`) in `products/summit/package.json`, and
   `products/summit/src/lib/supabase.js` uses dynamic `import()`.
5. No `SummaryRenderer` instantiation at module scope in
   `products/pathway/src/commands/agent-list.js`.
6. No credential strings in `products/map/src/commands/activity.js`.
7. `bun run check` passes (including layout check) after `just codegen`.
8. `bun run test` continues to pass (2317+ tests, zero failures).
