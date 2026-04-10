# Part 03 — Seed Command and Just Targets

Add `fit-map activity seed` and the supporting `just` targets.

**Depends on**: Part 01 (shared parser module).

## Rationale

The seed command is a thin orchestrator. It reads local files, uploads them to
Supabase Storage using the existing `storeRaw()` function, then runs the
existing transform and verify pipeline. No new database logic needed.

## Changes

### Modify: `products/map/bin/lib/commands/activity.js`

Add a `seed` subcommand function.

```javascript
/**
 * Seed the activity database from synthetic data.
 * @param {object} options
 * @param {string} options.data - Path to data directory (default: monorepo data/)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<number>} exit code
 */
export async function seed({ data, supabase }) {
  const { readFile, readdir } = await import("fs/promises");
  const { join } = await import("path");

  const activityDir = join(data, "activity");
  const rawDir = join(activityDir, "raw");

  // 1. Upload roster to Supabase Storage (people/ prefix)
  const rosterPath = join(activityDir, "roster.yaml");
  const rosterContent = await readFile(rosterPath, "utf-8");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const stored = await storeRaw(supabase, `people/${timestamp}.yaml`, rosterContent, "text/yaml");
  if (!stored.stored) {
    console.error(`Failed to upload roster: ${stored.error}`);
    return 1;
  }
  report("Upload roster", { stored: 1 });

  // 2. Upload raw documents (github/, getdx/ prefixes)
  const uploaded = await uploadRawDir(supabase, rawDir);
  report("Upload raw", { stored: uploaded.count, errors: uploaded.errors.length });
  if (uploaded.errors.length > 0) {
    for (const err of uploaded.errors) console.error(`  ${err}`);
  }

  // 3. Run all transforms
  const result = await transformAll(supabase);
  report("Transform people", result.people);
  report("Transform getdx", result.getdx);
  report("Transform github", result.github);

  // 4. Verify
  const verifyResult = await verify(supabase);
  return verifyResult;
}
```

Add a helper to recursively upload files from the raw directory:

```javascript
/**
 * Upload all files from a local raw directory to Supabase Storage.
 * Preserves subdirectory structure as storage prefixes.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} rawDir - Local path to data/activity/raw/
 * @returns {Promise<{count: number, errors: Array<string>}>}
 */
async function uploadRawDir(supabase, rawDir) {
  const { readFile, readdir } = await import("fs/promises");
  const { join, relative } = await import("path");

  const errors = [];
  let count = 0;

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // directory doesn't exist — skip silently
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        const storagePath = relative(rawDir, fullPath);
        const content = await readFile(fullPath, "utf-8");
        const contentType = fullPath.endsWith(".yaml") || fullPath.endsWith(".yml")
          ? "text/yaml"
          : "application/json";
        const result = await storeRaw(supabase, storagePath, content, contentType);
        if (result.stored) {
          count++;
        } else {
          errors.push(`${storagePath}: ${result.error}`);
        }
      }
    }
  }

  await walk(rawDir);
  return { count, errors };
}
```

**Imports to add**: `storeRaw` from the storage module via the existing package
export (confirmed in `package.json` exports map):

```javascript
import { storeRaw } from "@forwardimpact/map/activity/storage";
```

The `transformAll` call reuses the existing orchestrator import
(`@forwardimpact/map/activity/transform`). The `verify` call reuses the existing
verify function (it already returns an exit code).

The existing `report(target, counts)` function takes two arguments — a label
string and a counts object, logging `Transform ${target}: ${JSON.stringify(counts)}`.
The seed command reuses this signature.

**Wire the subcommand** in the `dispatchActivity` switch in
`products/map/bin/fit-map.js` (line 343). Follow the existing pattern for
`transform` and `verify`. Accept `--data <path>` option defaulting to the
monorepo's `data/` directory.

### Modify: `products/map/bin/fit-map.js` (or command router)

Add `seed` to the activity subcommand dispatch:

```javascript
case "seed":
  return seed({ data: options.data || defaultDataDir, supabase });
```

Add `--data` option parsing. Update the `activity` command definition's args
string from `"<start|stop|status|migrate|transform|verify>"` to
`"<start|stop|status|migrate|transform|verify|seed>"` (line 54 in `fit-map.js`).
The description should clearly state the command populates the activity database
from synthetic data — no `[internal]` label needed.

### Modify: `justfile`

Add targets:

```makefile
# Seed the activity database from synthetic data (requires Supabase running)
seed:
    bunx fit-map activity seed

# Full synthetic-to-database workflow
seed-full: supabase-up supabase-migrate synthetic seed
```

Update `quickstart` to include seed when Docker is available:

```makefile
quickstart: env-setup synthetic data-init codegen process-fast _quickstart-seed

# Conditionally seed if Docker is running
_quickstart-seed:
    #!/usr/bin/env bash
    if docker info --format '{{.ID}}' >/dev/null 2>&1; then
      echo "Docker detected — seeding activity database..."
      just supabase-up && just supabase-migrate && just seed
    else
      echo "Docker not running — skipping activity seed (run 'just seed-full' later)"
    fi
```

### Modify: `website/docs/internals/operations/index.md`

Add a section documenting the seed workflow:

```markdown
### Activity Seed (synthetic data)

Populate the activity database from synthetic data in one command:

    bunx fit-map activity seed

Or use the full workflow from scratch:

    just seed-full

This runs: `supabase-up → supabase-migrate → synthetic → seed`.

The seed command uploads the synthetic roster and raw documents (GitHub events,
GetDX responses) to Supabase Storage, then runs all transforms and verifies the
result. Idempotent — safe to run repeatedly.
```

### Modify: `website/docs/getting-started/leadership/index.md`

Add a note about seeding after the activity verify section (around line 422
where verification is discussed). External users who want to explore the
activity layer without real GitHub webhooks or GetDX tokens can use synthetic
data to populate the database.

```markdown
### Trying the activity layer with synthetic data

If you want to explore the activity layer before connecting real data sources,
Map can populate the database with synthetic data — a realistic roster, GitHub
events, and GetDX snapshots generated from a template.

First, generate synthetic data (requires the `@forwardimpact/universe` package):

    npx fit-universe data/synthetic/story.dsl

Then seed the activity database:

    npx fit-map activity seed

This uploads the generated roster and raw documents, runs all transforms, and
verifies the result. The database will contain realistic but fictional data you
can query with Landmark or Summit. When you are ready to switch to real data,
push your actual roster with `npx fit-map people push` — it overwrites the
synthetic entries.
```

### Create: `products/map/test/activity/seed.test.js`

Unit test for the seed command using fake Supabase clients (following the
existing test pattern in `products/map/test/activity/`).

Test cases:
- **Happy path**: Fake filesystem with roster + raw files, fake Supabase client.
  Verify `storeRaw` called with correct paths, transforms run, verify called.
- **Missing raw directory**: Seed completes without error (uploads roster,
  transforms run, verify shows zero getdx/github).
- **Upload failure**: `storeRaw` returns error for roster — seed exits 1.
- **Idempotent**: Two seed calls produce same fake DB state.

## Verification

1. `bun test products/map/test/activity/seed.test.js` — new tests pass.
2. `bun test products/map/` — full map test suite passes.
3. Manual: with Supabase running, `just seed-full` completes and
   `bunx fit-map activity verify` exits 0.

## Risks

- **`storeRaw` import from CLI context**: The CLI command imports via the
  package export `@forwardimpact/map/activity/storage`, which maps to the
  `_shared` module. This is pure JS with no Deno-specific APIs — it only uses
  the Supabase client passed as an argument. The existing `people.js` command
  already imports from `_shared` via the extract package exports.
- **Testability**: The seed function uses dynamic `import("fs/promises")`. For
  unit tests, structure the function so file reading is a separate step that can
  be tested independently. The seed unit tests should focus on the orchestration
  (upload, transform, verify sequence) using fake Supabase clients, with real
  file reads covered by the integration test (part 04).
- **Large raw directories**: If synthetic generation produces many files, the
  sequential upload loop could be slow. Acceptable for development use; can be
  parallelized later if needed.
