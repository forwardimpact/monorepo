# Part 02 — Map: Export Compliance + Credential Removal

## Problem

Two violations in `products/map`:

1. **8 exports point outside `src/`.** Lines 49–56 of `package.json` export
   paths under `supabase/functions/_shared/activity/` instead of `src/`.
2. **Hardcoded demo JWT in source.** `src/commands/activity.js` line 30 embeds a
   Supabase local-dev service role key as a string literal.

## Approach

**Exports:** Move the 8 source files from `supabase/functions/_shared/activity/`
into `src/activity/` (which already contains `queries/`, `parse-people.js`, and
`validate/`). Replace the originals with one-line re-exports so the three
Supabase Edge Functions (`transform`, `github-webhook`, `getdx-sync`) continue
to resolve their relative imports unchanged. Update the 8 package.json exports
to point to `src/activity/`.

The re-export files in `_shared/` are a permanent architectural bridge between
the Deno Edge Function runtime and the canonical `src/` source — not migration
shims. Edge Function source files (out of scope) are not modified.

**Credential:** Add a `capture(args)` method to the Supabase CLI wrapper that
returns stdout as a string, then use it in `start()` to dynamically read the
service role key from `supabase status --output json` after startup. This
removes the hardcoded JWT from source while preserving the same user experience.

## Changes

### Step 1: Move source files to `src/activity/`

Move these 8 files, preserving directory structure:

| From (supabase/functions/\_shared/activity/) | To (src/activity/)    |
| -------------------------------------------- | --------------------- |
| `storage.js`                                 | `storage.js`          |
| `extract/github.js`                          | `extract/github.js`   |
| `extract/getdx.js`                           | `extract/getdx.js`    |
| `extract/people.js`                          | `extract/people.js`   |
| `transform/index.js`                         | `transform/index.js`  |
| `transform/github.js`                        | `transform/github.js` |
| `transform/getdx.js`                         | `transform/getdx.js`  |
| `transform/people.js`                        | `transform/people.js` |

Create `src/activity/extract/` and `src/activity/transform/` directories.

Internal relative imports within `transform/index.js` (`./github.js`,
`./getdx.js`, `./people.js`) remain correct after the move because the directory
structure is preserved.

### Step 2: Replace originals with re-exports

Each original file in `_shared/activity/` becomes a single re-export line. The
relative path from `supabase/functions/_shared/activity/` to `src/activity/` is
`../../../../src/activity/`.

**`supabase/functions/_shared/activity/storage.js`:**

```javascript
export * from "../../../../src/activity/storage.js";
```

**`supabase/functions/_shared/activity/extract/github.js`:**

```javascript
export * from "../../../../../src/activity/extract/github.js";
```

Same pattern for all 8 files. The extra `../` for files inside `extract/` and
`transform/` subdirectories accounts for the additional nesting level.

Full list of re-export paths:

| Re-export file (under \_shared/activity/) | Points to                                         |
| ----------------------------------------- | ------------------------------------------------- |
| `storage.js`                              | `../../../../src/activity/storage.js`             |
| `extract/github.js`                       | `../../../../../src/activity/extract/github.js`   |
| `extract/getdx.js`                        | `../../../../../src/activity/extract/getdx.js`    |
| `extract/people.js`                       | `../../../../../src/activity/extract/people.js`   |
| `transform/index.js`                      | `../../../../../src/activity/transform/index.js`  |
| `transform/github.js`                     | `../../../../../src/activity/transform/github.js` |
| `transform/getdx.js`                      | `../../../../../src/activity/transform/getdx.js`  |
| `transform/people.js`                     | `../../../../../src/activity/transform/people.js` |

### Step 3: Update package.json exports

Replace the 8 export targets (lines 49–56) to point to `src/activity/`:

**Before:**

```json
"./activity/storage": "./supabase/functions/_shared/activity/storage.js",
"./activity/extract/github": "./supabase/functions/_shared/activity/extract/github.js",
"./activity/extract/getdx": "./supabase/functions/_shared/activity/extract/getdx.js",
"./activity/extract/people": "./supabase/functions/_shared/activity/extract/people.js",
"./activity/transform/github": "./supabase/functions/_shared/activity/transform/github.js",
"./activity/transform/getdx": "./supabase/functions/_shared/activity/transform/getdx.js",
"./activity/transform/people": "./supabase/functions/_shared/activity/transform/people.js",
"./activity/transform": "./supabase/functions/_shared/activity/transform/index.js"
```

**After:**

```json
"./activity/storage": "./src/activity/storage.js",
"./activity/extract/github": "./src/activity/extract/github.js",
"./activity/extract/getdx": "./src/activity/extract/getdx.js",
"./activity/extract/people": "./src/activity/extract/people.js",
"./activity/transform/github": "./src/activity/transform/github.js",
"./activity/transform/getdx": "./src/activity/transform/getdx.js",
"./activity/transform/people": "./src/activity/transform/people.js",
"./activity/transform": "./src/activity/transform/index.js"
```

### Step 4: Add `capture()` to Supabase CLI wrapper

**File:** `products/map/src/lib/supabase-cli.js`

Add an async `capture(args)` function alongside the existing `run(args)`.
Identical flow (resolve binary, spawn) but uses
`stdio: ['inherit', 'pipe', 'inherit']` and collects stdout into a string.

```javascript
async function capture(args) {
  const desc = await resolve();
  if (!desc) {
    throw new Error(
      "Could not find the `supabase` CLI. Install it via Homebrew " +
        "(`brew install supabase/tap/supabase`) or npm " +
        "(`npm install supabase` in this project, or `npm install -g supabase`), " +
        `then retry. See ${SUPABASE_INSTALL_URL}.`,
    );
  }

  return new Promise((res, rej) => {
    const chunks = [];
    const child = spawnFn(desc.cmd, [...desc.prefix, ...args], {
      cwd,
      stdio: ["inherit", "pipe", "inherit"],
    });
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.on("error", rej);
    child.on("exit", (code) => {
      if (code === 0) res(Buffer.concat(chunks).toString());
      else rej(new Error(`supabase ${args.join(" ")} exited ${code}`));
    });
  });
}
```

Return `{ run, capture, resolve }` from the factory.

### Step 5: Remove hardcoded JWT from activity.js

**File:** `products/map/src/commands/activity.js`

Replace the hardcoded key in `start()` with a dynamic read from
`supabase status`.

**Before (lines 21–32):**

```javascript
export async function start() {
  await supabaseCli.run(["start"]);
  process.stdout.write("\n");
  process.stdout.write(
    formatSubheader("Export these variables to use the activity layer:") +
      "\n\n",
  );
  process.stdout.write("  export MAP_SUPABASE_URL=http://127.0.0.1:54321\n");
  process.stdout.write(
    "  export MAP_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...\n\n",
  );
  return 0;
}
```

**After:**

```javascript
export async function start() {
  await supabaseCli.run(["start"]);
  const json = await supabaseCli.capture(["status", "--output", "json"]);
  const status = JSON.parse(json);
  process.stdout.write("\n");
  process.stdout.write(
    formatSubheader("Export these variables to use the activity layer:") +
      "\n\n",
  );
  process.stdout.write(`  export MAP_SUPABASE_URL=${status.API_URL}\n`);
  process.stdout.write(
    `  export MAP_SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}\n\n`,
  );
  return 0;
}
```

**Risk:** The JSON field names (`API_URL`, `SERVICE_ROLE_KEY`) come from the
Supabase CLI and should be verified by running `supabase status --output json`
locally. If the actual field names differ, adjust accordingly.

### Step 6: Fix module-level singleton in activity.js

While reading `activity.js`, note that line 17 has a module-level singleton:

```javascript
const supabaseCli = createSupabaseCli();
```

This is the same OO+DI violation pattern as pathway's `agent-list.js`. However,
the spec scopes OO+DI fixes to pathway only (violation #4 names only
`agent-list.js`). Leave this instance as-is — it can be addressed in a follow-up
if desired.

## Blast radius

| Action   | File                                                      |
| -------- | --------------------------------------------------------- |
| Created  | `src/activity/storage.js`                                 |
| Created  | `src/activity/extract/github.js`                          |
| Created  | `src/activity/extract/getdx.js`                           |
| Created  | `src/activity/extract/people.js`                          |
| Created  | `src/activity/transform/index.js`                         |
| Created  | `src/activity/transform/github.js`                        |
| Created  | `src/activity/transform/getdx.js`                         |
| Created  | `src/activity/transform/people.js`                        |
| Modified | `supabase/functions/_shared/activity/storage.js`          |
| Modified | `supabase/functions/_shared/activity/extract/github.js`   |
| Modified | `supabase/functions/_shared/activity/extract/getdx.js`    |
| Modified | `supabase/functions/_shared/activity/extract/people.js`   |
| Modified | `supabase/functions/_shared/activity/transform/index.js`  |
| Modified | `supabase/functions/_shared/activity/transform/github.js` |
| Modified | `supabase/functions/_shared/activity/transform/getdx.js`  |
| Modified | `supabase/functions/_shared/activity/transform/people.js` |
| Modified | `package.json`                                            |
| Modified | `src/lib/supabase-cli.js`                                 |
| Modified | `src/commands/activity.js`                                |

All paths relative to `products/map/`.

## Ordering

1. Move files (Step 1) — must complete before re-exports and export updates.
2. Replace originals with re-exports (Step 2) — immediately after move.
3. Update package.json exports (Step 3) — can run in parallel with Step 2.
4. Add `capture()` to supabase-cli.js (Step 4) — independent.
5. Remove hardcoded JWT (Step 5) — depends on Step 4.

## Verification

```sh
bun run check:exports         # all map exports resolve
bun run test -- products/map  # existing activity tests pass
grep -rn "console\.log(" products/map/src/  # no console.log (pre-existing clean)
grep -n "eyJhbGci" products/map/src/        # no JWT in source
```

Verify self-imports work by running one of the CLI commands that uses the
activity exports:

```sh
bunx fit-map activity --help
```
