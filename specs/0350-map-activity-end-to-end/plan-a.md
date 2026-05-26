# 350 — Plan: Map Activity Layer End-to-End

How to implement the seven gaps described in `spec.md` — broken edge functions,
misnamed CLI, missing CLI surface, duplicated GitHub extraction logic, dead
migration file, zero activity tests, stale skill — while keeping the external
npm surface (`@forwardimpact/map/activity/...`) unchanged.

## Approach

The linchpin decision is where the canonical transform code lives, such that
both Deno edge functions and the Node CLI import it. Two options were
considered:

1. **Parent-path imports with `--use-api`.** Keep canonical at
   `products/map/activity/`. Edge functions import via
   `../../../activity/transform/people.js`. Supabase CLI 2.13.3+ supports this
   via `supabase functions deploy --use-api`, explicitly for monorepo setups.
   Research graded this MEDIUM confidence: documented, but not smoke-tested on
   this CLI version, and `supabase functions serve` (local dev) may not resolve
   parent paths the same way. `supabase/cli#1028` cites historical failures on
   parent imports.

2. **Canonical source inside `supabase/functions/_shared/`.** Supabase's
   established convention for cross-function code. Edge functions import via
   plain relative paths (`../_shared/activity/transform/people.js`). No
   experimental flags. No deploy surprises. Cost: the physical file layout
   moves, and `products/map/activity/` becomes a slimmer directory containing
   only `queries/` and `validate/`.

**Decision: option 2.** The spec asks for deterministic end-to-end working;
"depends on an experimental CLI flag" is not deterministic. The `_shared/`
layout also sidesteps the Deno `deno.json` location question — per-function
`deno.json` is the officially recommended placement and each function imports
only from its adjacent `_shared/` sibling.

The Node CLI imports canonical files via the package `"exports"` field
("self-imports"), so `bin/fit-map.js` reads
`@forwardimpact/map/activity/transform/people` without caring where the physical
file lives. External npm consumers see zero API change — their
`@forwardimpact/map/activity/**` imports keep working because `package.json`
remaps the export paths.

### Key decisions

1. **Canonical transform source at
   `products/map/supabase/functions/_shared/activity/`.** Physical location
   moves. External API (`@forwardimpact/map/activity/...`) unchanged via
   `package.json` exports remapping.

2. **Split `activity/transform/people.js` into two files.** The Node-only
   `src/loader.js` import (used only by `validatePeople`) is incompatible with
   Deno. `transformPeople` + CSV/YAML parsing moves to
   `_shared/activity/transform/people.js` (Deno-safe). `loadPeopleFile` and
   `validatePeople` move to a new `products/map/activity/validate/people.js`
   (Node-only, CLI validation path).

3. **Per-function `deno.json` with import map.** Each edge function gets a
   `deno.json` mapping bare specifiers (`yaml`, `@supabase/supabase-js`) to
   `npm:` variants. Per research, per-function placement is the officially
   supported pattern. All four `deno.json` files have identical content.

4. **CLI migrates to `node:util parseArgs`.** Follows
   `libraries/librc/bin/fit-rc.js:6,13`. The current homegrown parser (25 lines)
   does not scale to nested subcommands like
   `fit-map activity transform github`.

5. **CLI self-imports via `@forwardimpact/map/...`.** Node 18+ supports
   self-referencing via the package `"exports"` field. `bin/fit-map.js` imports
   `"@forwardimpact/map/activity/transform/people"` rather than a brittle
   relative path. Works identically when the CLI runs from `node_modules/` in a
   consumer project or from `products/map/bin/` during development.

6. **Activity CLI commands spawn the `supabase` binary.**
   `fit-map activity start`, `stop`, `migrate`, `status` wrap `supabase` via
   `child_process.spawn` with inherited stdio. The cwd is the package root,
   resolved from `import.meta.url`, so consumers do not need to
   `cd node_modules/@forwardimpact/map`. A missing `supabase` binary is detected
   and reported with a clear install link, not `ENOENT`.

7. **`fit-map activity verify` queries the DB directly.** Uses the existing
   `activity/queries/org.js` `getOrganization` helper plus a row count from
   `getdx_snapshots` and `github_events` to prove at least one derived table is
   populated. Exits non-zero with a clear message against an empty DB.

8. **No behaviour change in `github-webhook`.** The function works today. The
   plan swaps its inline `extractArtifacts` implementation for an import from
   `_shared/activity/transform/github.js` (via `extractGitHubWebhook` and
   `transformGitHubWebhook` helpers). The one-source-of-truth criterion is
   satisfied by removing the inline code, not by rewriting the function.

9. **Dead migration file deleted with `git rm`.** `diff` confirmed the file
   differs from the canonical migration only by missing GRANT statements and
   whitespace. Nothing to salvage.

10. **Tests use `node:test` + hand-rolled mocks.** Mirror the
    `data-loader.test.js` idiom (`node:test`, `node:assert`, dependency-
    injected fake clients). No subprocess tests — not a repo pattern;
    introducing that overhead is out of scope.

11. **Leadership guide and SKILL.md are already done.** Commit `d008ca4` rewrote
    both to describe this plan's target state. The plan does not re-touch them.
    The implementation must deliver the exact command surface the docs describe.

---

## Directory layout (target)

```
products/map/
  activity/
    queries/                         # unchanged, Node-only, out-of-spec-scope
      org.js
      snapshots.js
      evidence.js
      artifacts.js
    validate/                        # NEW — Node-only CLI validation
      people.js                      # loadPeopleFile + validatePeople
  bin/
    fit-map.js                       # rewritten (node:util parseArgs dispatch)
    lib/                             # NEW
      client.js                      # createMapClient({ url, serviceRoleKey })
      package-root.js                # resolvePackageRoot() via import.meta.url
      supabase-cli.js                # detectSupabaseCli, runSupabase
      commands/
        people.js                    # validate, push
        activity.js                  # start/stop/status/migrate/transform/verify
        getdx.js                     # sync
  supabase/
    config.toml                      # unchanged
    migrations/                      # unchanged (schema out of scope)
      20250101000000_activity_schema.sql
      20250101000001_get_team_function.sql
      20250101000002_raw_bucket.sql
    functions/
      _shared/
        supabase.ts                  # unchanged
        cors.ts                      # unchanged
        activity/                    # NEW — canonical transform source
          storage.js
          extract/
            github.js
            getdx.js
            people.js
          transform/
            github.js                # extract + transform + email resolve
            getdx.js                 # transformAllGetDX
            people.js                # transformPeople only (no src/loader.js)
            index.js                 # transformAll orchestrator
      github-webhook/
        index.ts                     # rewritten to import from _shared/activity
        deno.json                    # NEW — import map
      getdx-sync/
        index.ts                     # rewritten — full extract + transform
        deno.json                    # NEW
      people-upload/
        index.ts                     # rewritten — full extract + transform
        deno.json                    # NEW
      transform/
        index.ts                     # rewritten — calls transformAll
        deno.json                    # NEW
  test/
    activity/                        # NEW — first activity-layer tests
      storage.test.js
      transform-people.test.js
      transform-getdx.test.js
      transform-github.test.js
      validate-people.test.js
    ... existing framework-layer tests unchanged ...
  package.json                       # dependencies + exports updated
```

**Deleted:**

- `products/map/activity/storage.js` (moved into `_shared/activity/`)
- `products/map/activity/extract/*.js` (all three moved)
- `products/map/activity/transform/*.js` (all four moved + people split)
- `products/map/activity/transform/` directory itself
- `products/map/activity/extract/` directory itself
- `products/map/activity/migrations/001_activity_schema.sql` (dead draft)
- `products/map/activity/migrations/` directory itself

---

## Migration map — file moves

| Before                                             | After                                                     |
| -------------------------------------------------- | --------------------------------------------------------- |
| `activity/storage.js`                              | `supabase/functions/_shared/activity/storage.js`          |
| `activity/extract/github.js`                       | `supabase/functions/_shared/activity/extract/github.js`   |
| `activity/extract/getdx.js`                        | `supabase/functions/_shared/activity/extract/getdx.js`    |
| `activity/extract/people.js`                       | `supabase/functions/_shared/activity/extract/people.js`   |
| `activity/transform/github.js`                     | `supabase/functions/_shared/activity/transform/github.js` |
| `activity/transform/getdx.js`                      | `supabase/functions/_shared/activity/transform/getdx.js`  |
| `activity/transform/people.js` (transform portion) | `supabase/functions/_shared/activity/transform/people.js` |
| `activity/transform/people.js` (validate portion)  | `activity/validate/people.js`                             |
| `activity/transform/index.js`                      | `supabase/functions/_shared/activity/transform/index.js`  |
| `activity/migrations/001_activity_schema.sql`      | _deleted_                                                 |

No content changes during the move except for `people.js`:

- `_shared/activity/transform/people.js` keeps: `transformPeople`,
  `parsePeopleFile`, `parseCsv`, `parseYamlPeople`, `importPeople`. Import
  changes from bare `yaml` to the same bare `yaml` resolved via `deno.json`
  import map. No other code change.
- `activity/validate/people.js` keeps: `loadPeopleFile`, `validatePeople`, and
  the `createDataLoader` import from `../../src/loader.js`.

---

## Phase 1 — Dependency, moves, and package exports

**Goal:** ship a commit where every existing Node test still passes and every
existing npm consumer still works, even though the canonical source has moved.
Edge functions remain broken — that's Phase 2.

### Step 1.1 — Add `@supabase/supabase-js` to `products/map/package.json`

The CLI activity commands need a Supabase client. Add:

```json
"dependencies": {
  "@forwardimpact/libtemplate": "^0.2.0",
  "@forwardimpact/libutil": "^0.1.64",
  "@supabase/supabase-js": "^2.48.0",
  "ajv": "^8.18.0",
  "ajv-formats": "^3.0.1",
  "yaml": "^2.8.3"
}
```

Run `bun install` at repo root to update `bun.lock`.

### Step 1.2 — Move activity helpers into `_shared/activity/`

Use `git mv` for each file to preserve blame:

```
git mv products/map/activity/storage.js                products/map/supabase/functions/_shared/activity/storage.js
git mv products/map/activity/extract/github.js         products/map/supabase/functions/_shared/activity/extract/github.js
git mv products/map/activity/extract/getdx.js          products/map/supabase/functions/_shared/activity/extract/getdx.js
git mv products/map/activity/extract/people.js         products/map/supabase/functions/_shared/activity/extract/people.js
git mv products/map/activity/transform/github.js       products/map/supabase/functions/_shared/activity/transform/github.js
git mv products/map/activity/transform/getdx.js        products/map/supabase/functions/_shared/activity/transform/getdx.js
git mv products/map/activity/transform/index.js        products/map/supabase/functions/_shared/activity/transform/index.js
```

Update the relative imports inside each moved file. Every moved file currently
imports from `"../storage.js"` (siblings in `activity/`); after the move they
continue to import from `"../storage.js"` because the relative structure is
preserved. No content changes needed except for `people.js` (Step 1.3).

### Step 1.3 — Split `people.js` into transform and validate halves

**New file:**
`products/map/supabase/functions/_shared/activity/transform/people.js`

```javascript
/**
 * People Transform
 *
 * Reads stored people files (CSV or YAML) from Supabase Storage and
 * produces structured rows in organization_people. Deno-safe: no Node-only
 * imports. Used by both the fit-map CLI and the people-upload/transform
 * edge functions.
 */

import { readRaw, listRaw } from "../storage.js";
import { parse as parseYaml } from "yaml";

export async function transformPeople(supabase) { /* ...unchanged... */ }
function parsePeopleFile(content, format) { /* ...unchanged... */ }
function parseCsv(csv) { /* ...unchanged... */ }
function parseYamlPeople(content) { /* ...unchanged... */ }
async function importPeople(supabase, people) { /* ...unchanged... */ }
```

Copy the five functions verbatim from the old
`products/map/activity/transform/people.js`. Delete `loadPeopleFile` and
`validatePeople` from this file. Delete the
`import { createDataLoader } from "../../src/loader.js"` line.

**New file:** `products/map/activity/validate/people.js`

```javascript
/**
 * People Validation
 *
 * Node-only CLI validation for local people files. Cross-references
 * discipline, level, and track values against the framework. Does not
 * talk to Supabase.
 */

import { parse as parseYaml } from "yaml";
import { createDataLoader } from "../../src/loader.js";

export async function loadPeopleFile(filePath) { /* ...unchanged... */ }
export async function validatePeople(people, dataDir) { /* ...unchanged... */ }

function parseCsv(csv) { /* ...duplicated... */ }
function parseYamlPeople(content) { /* ...duplicated... */ }
```

The two parse helpers (`parseCsv`, `parseYamlPeople`) are duplicated here from
the transform file — it's a small amount of code and avoids a cross-directory
import that would re-introduce the Node-Deno coupling we are trying to avoid.
Both copies are pure parsers with no side effects; drift between them would only
affect local validation output, not database state. The one-source-of- truth
principle does not apply here — the spec's criterion 8 targets the
transform/extract code that writes to Supabase, not the local-only validators.

Delete the old `products/map/activity/transform/people.js` (`git rm`).

### Step 1.4 — Update `products/map/package.json` exports

Remap the `./activity/*` entries to their new physical locations. Every external
import path stays identical; only the right-hand target changes:

```json
"exports": {
  ".": "./src/index.js",
  "./iri": "./src/iri.js",
  "./loader": "./src/loader.js",
  "./renderer": "./src/renderer.js",
  "./exporter": "./src/exporter.js",
  "./validation": "./src/validation.js",
  "./schema-validation": "./src/schema-validation.js",
  "./index-generator": "./src/index-generator.js",
  "./levels": "./src/levels.js",
  "./schema/json/*": "./schema/json/*",
  "./schema/rdf/*": "./schema/rdf/*",
  "./activity/queries/org": "./activity/queries/org.js",
  "./activity/queries/snapshots": "./activity/queries/snapshots.js",
  "./activity/queries/evidence": "./activity/queries/evidence.js",
  "./activity/queries/artifacts": "./activity/queries/artifacts.js",
  "./activity/validate/people": "./activity/validate/people.js",
  "./activity/storage": "./supabase/functions/_shared/activity/storage.js",
  "./activity/extract/github": "./supabase/functions/_shared/activity/extract/github.js",
  "./activity/extract/getdx": "./supabase/functions/_shared/activity/extract/getdx.js",
  "./activity/extract/people": "./supabase/functions/_shared/activity/extract/people.js",
  "./activity/transform/github": "./supabase/functions/_shared/activity/transform/github.js",
  "./activity/transform/getdx": "./supabase/functions/_shared/activity/transform/getdx.js",
  "./activity/transform/people": "./supabase/functions/_shared/activity/transform/people.js",
  "./activity/transform": "./supabase/functions/_shared/activity/transform/index.js"
}
```

**New export:** `./activity/validate/people` — public path for the validate-only
helpers the CLI and external consumers need.

The `files` array does not need to change; `activity/` and `supabase/` are
already listed.

### Step 1.5 — Verify nothing broke

```sh
bun install
cd products/map && bun test
cd ../.. && bun run check
```

Both must pass. The existing tests all use framework-layer helpers or directly
require the moved files — by the time Phase 1 lands, every
`import { ... } from "@forwardimpact/map/activity/..."` in the repo should still
resolve because the exports map now covers the new locations.

**Commit at end of Phase 1:**
`refactor(map): relocate activity helpers to _shared`

---

## Phase 2 — Edge function rewrites

**Goal:** every edge function completes its job end-to-end, importing from the
one canonical source.

### Step 2.1 — Add `deno.json` import maps to each edge function

**New file:** `products/map/supabase/functions/transform/deno.json`

```json
{
  "imports": {
    "yaml": "npm:yaml@2",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2"
  }
}
```

Copy the same file verbatim to the other three edge function directories:

- `products/map/supabase/functions/github-webhook/deno.json`
- `products/map/supabase/functions/getdx-sync/deno.json`
- `products/map/supabase/functions/people-upload/deno.json`

Per-function placement is the officially supported pattern per Supabase docs. A
single `functions/deno.json` would work for `supabase functions serve` but has
known quirks for `supabase functions deploy`.

### Step 2.2 — Rewrite `people-upload/index.ts`

**File:** `products/map/supabase/functions/people-upload/index.ts`

```typescript
import { createSupabaseClient } from "../_shared/supabase.ts";
import { extractPeopleFile } from "../_shared/activity/extract/people.js";
import { transformPeople } from "../_shared/activity/transform/people.js";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const contentType = req.headers.get("Content-Type") || "";
  const isCSV = contentType.includes("text/csv");
  const format = isCSV ? "csv" : "yaml";
  const body = await req.text();

  const supabase = createSupabaseClient();

  const extractResult = await extractPeopleFile(supabase, body, format);
  if (!extractResult.stored) {
    return json({ ok: false, stored: false, error: extractResult.error }, 500);
  }

  const { imported, errors } = await transformPeople(supabase);

  return json({
    ok: errors.length === 0,
    stored: true,
    path: extractResult.path,
    imported,
    errors,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

Contract: returns `{ ok, stored, path, imported, errors }`. Empty input returns
`{ ok: true, imported: 0, errors: [] }`.

### Step 2.3 — Rewrite `getdx-sync/index.ts`

**File:** `products/map/supabase/functions/getdx-sync/index.ts`

```typescript
import { createSupabaseClient } from "../_shared/supabase.ts";
import { extractGetDX } from "../_shared/activity/extract/getdx.js";
import { transformAllGetDX } from "../_shared/activity/transform/getdx.js";

Deno.serve(async (_req) => {
  const supabase = createSupabaseClient();
  const apiToken = Deno.env.get("GETDX_API_TOKEN");
  const baseUrl = Deno.env.get("GETDX_BASE_URL") || "https://api.getdx.com";

  if (!apiToken) {
    return json(
      { ok: false, error: "GETDX_API_TOKEN not set" },
      500,
    );
  }

  const extract = await extractGetDX(supabase, { apiToken, baseUrl });
  const transform = await transformAllGetDX(supabase);

  return json({
    ok: extract.errors.length === 0 && transform.errors.length === 0,
    extract: { files: extract.files, errors: extract.errors },
    transform,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

Contract: returns
`{ ok, extract: { files, errors }, transform: { teams, snapshots, scores, errors } }`.
The function is idempotent because `transformAllGetDX` upserts on natural keys.

### Step 2.4 — Rewrite `transform/index.ts`

**File:** `products/map/supabase/functions/transform/index.ts`

```typescript
import { createSupabaseClient } from "../_shared/supabase.ts";
import { transformAll } from "../_shared/activity/transform/index.js";

Deno.serve(async (_req) => {
  const supabase = createSupabaseClient();
  const result = await transformAll(supabase);
  const ok =
    result.people.errors.length === 0 &&
    result.getdx.errors.length === 0 &&
    result.github.errors.length === 0;
  return new Response(JSON.stringify({ ok, ...result }), {
    status: ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
```

`transformAll` already exists at `_shared/activity/transform/index.js` (moved
from `activity/transform/`). It runs people → getdx → github in dependency
order. Re-runs are safe because each sub-transform upserts on natural keys.

### Step 2.5 — Update `github-webhook/index.ts` to use shared source

**File:** `products/map/supabase/functions/github-webhook/index.ts`

Replace the entire current contents with:

```typescript
import { createSupabaseClient } from "../_shared/supabase.ts";
import { extractGitHubWebhook } from "../_shared/activity/extract/github.js";
import { transformGitHubWebhook } from "../_shared/activity/transform/github.js";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const deliveryId = req.headers.get("X-GitHub-Delivery");
  const eventType = req.headers.get("X-GitHub-Event");

  if (!deliveryId || !eventType) {
    return new Response("Missing required GitHub headers", { status: 400 });
  }

  const payload = await req.json();
  const supabase = createSupabaseClient();

  const extractResult = await extractGitHubWebhook(supabase, {
    deliveryId,
    eventType,
    payload,
  });

  if (!extractResult.stored) {
    return json({ ok: false, error: extractResult.error }, 500);
  }

  const result = await transformGitHubWebhook(supabase, extractResult.path);

  return json({
    ok: result.errors.length === 0,
    raw: extractResult.path,
    event: result.event,
    artifacts: result.artifacts,
    errors: result.errors,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

All three artifact-extraction functions (`extractPR`, `extractReview`,
`extractCommits`) are deleted from `github-webhook/index.ts`. Their canonical
versions live in `_shared/activity/transform/github.js` under the names
`extractPullRequestArtifacts`, `extractReviewArtifacts`,
`extractCommitArtifacts`. No behaviour change for the GitHub ingestion path;
satisfies criterion 8.

Note: `transformGitHubWebhook` at `_shared/activity/transform/github.js:29`
already reads the raw payload from storage, does its own `github_events` upsert,
extracts artifacts, and resolves email. The rewritten edge function call pattern
matches the one `transform/index.ts` uses for replay, so the webhook-inline path
and the replay path are one code path.

### Step 2.6 — Smoke-test edge function bundling

Before moving to Phase 3, verify the edge functions actually bundle and deploy.
On a machine with Docker + `supabase` CLI:

```sh
cd products/map
supabase start
supabase functions serve
# In another terminal:
curl -X POST http://127.0.0.1:54321/functions/v1/transform \
  -H "Authorization: Bearer $MAP_SUPABASE_SERVICE_ROLE_KEY"
```

Expected: HTTP 200 with
`{ ok: true, people: {...}, getdx: {...}, github: {...} }` (zero counts, no
errors, against an empty database).

If `supabase functions serve` fails to resolve the `../_shared/activity/`
imports, the fallback is to convert the `.js` files to `.ts` shims — rare but
documented. Record the failure mode in the implementation notes and do not
proceed to Phase 3 until bundling works.

**Commit at end of Phase 2:**
`feat(map): implement full edge-function transforms`

---

## Phase 3 — CLI scaffolding

**Goal:** every command the leadership guide (`d008ca4`) names actually works.
No inline Node scripts left for any activity workflow.

### Step 3.1 — Create `bin/lib/package-root.js`

**New file:** `products/map/bin/lib/package-root.js`

```javascript
/**
 * Resolve the Map package root from import.meta.url.
 *
 * Returns the directory containing `package.json` and `supabase/` —
 * i.e. the installed `@forwardimpact/map` directory, whether it lives
 * in a consumer's `node_modules/` or in `products/map/` during monorepo
 * development.
 */

import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getPackageRoot() {
  // bin/lib/package-root.js → ../../ is the package root
  return resolve(__dirname, "..", "..");
}

export function getSupabaseDir() {
  return resolve(getPackageRoot(), "supabase");
}
```

### Step 3.2 — Create `bin/lib/client.js`

**New file:** `products/map/bin/lib/client.js`

```javascript
/**
 * Shared Supabase client wiring for fit-map CLI commands.
 *
 * Reads MAP_SUPABASE_URL and MAP_SUPABASE_SERVICE_ROLE_KEY from env or
 * from explicit options. Throws with a clear message pointing at the
 * activity start output when either is missing.
 */

import { createClient } from "@supabase/supabase-js";

export function createMapClient(opts = {}) {
  const url = opts.url ?? process.env.MAP_SUPABASE_URL;
  const serviceRoleKey =
    opts.serviceRoleKey ?? process.env.MAP_SUPABASE_SERVICE_ROLE_KEY;
  const schema = opts.schema ?? "activity";

  if (!url) {
    throw new Error(
      "MAP_SUPABASE_URL is not set. Run `fit-map activity start` and " +
        "export the URL it prints.",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "MAP_SUPABASE_SERVICE_ROLE_KEY is not set. Run `fit-map activity " +
        "start` and export the service-role key it prints.",
    );
  }

  return createClient(url, serviceRoleKey, { db: { schema } });
}
```

### Step 3.3 — Create `bin/lib/supabase-cli.js`

**New file:** `products/map/bin/lib/supabase-cli.js`

```javascript
/**
 * Wraps the `supabase` CLI so fit-map can run it from the package root
 * without requiring the user to cd into node_modules. Detects a missing
 * binary and reports with a clear install link.
 */

import { spawn } from "child_process";
import { getSupabaseDir } from "./package-root.js";

const SUPABASE_INSTALL_URL =
  "https://supabase.com/docs/guides/local-development";

export async function detectSupabaseCli() {
  return new Promise((resolve) => {
    const child = spawn("supabase", ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

export async function runSupabase(args, { cwd } = {}) {
  const ok = await detectSupabaseCli();
  if (!ok) {
    throw new Error(
      "The `supabase` CLI is not installed or not on your PATH. " +
        `Install it from ${SUPABASE_INSTALL_URL} and retry.`,
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn("supabase", args, {
      cwd: cwd ?? getSupabaseDir(),
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`supabase ${args.join(" ")} exited ${code}`));
    });
  });
}
```

The `cwd` defaults to the package-local `supabase/` directory so running
`fit-map activity start` from any working directory finds the bundled
config.toml and migrations.

### Step 3.4 — Create `bin/lib/commands/people.js`

**New file:** `products/map/bin/lib/commands/people.js`

```javascript
import { readFile } from "fs/promises";
import {
  loadPeopleFile,
  validatePeople,
} from "@forwardimpact/map/activity/validate/people";
import { extractPeopleFile } from "@forwardimpact/map/activity/extract/people";
import { transformPeople } from "@forwardimpact/map/activity/transform/people";

export async function validate(filePath, dataDir) {
  console.log(`👤 Validating people file: ${filePath}\n`);
  const people = await loadPeopleFile(filePath);
  console.log(`  Loaded ${people.length} people from file`);

  const { valid, errors } = await validatePeople(people, dataDir);
  if (errors.length > 0) {
    console.log(`\n❌ Validation errors:`);
    for (const err of errors) {
      console.log(`  • Row ${err.row}: ${err.message}`);
    }
  }

  console.log(`\n✅ ${valid.length} people validated`);
  if (errors.length > 0) {
    console.log(`❌ ${errors.length} rows with errors\n`);
    return 1;
  }
  return 0;
}

export async function push(filePath, supabase) {
  console.log(`👤 Pushing people file: ${filePath}\n`);
  const content = await readFile(filePath, "utf-8");
  const format = filePath.endsWith(".csv") ? "csv" : "yaml";

  const extractResult = await extractPeopleFile(supabase, content, format);
  if (!extractResult.stored) {
    console.error(`❌ Failed to store raw file: ${extractResult.error}`);
    return 1;
  }
  console.log(`  Stored raw file: ${extractResult.path}`);

  const result = await transformPeople(supabase);
  console.log(`\n✅ Imported ${result.imported} people`);
  if (result.errors.length > 0) {
    console.error(`❌ ${result.errors.length} transform errors:`);
    for (const err of result.errors) console.error(`  • ${err}`);
    return 1;
  }
  return 0;
}
```

Note the self-import pattern — every activity helper is imported via
`@forwardimpact/map/activity/...`. Node resolves these through the package's own
`exports` field.

### Step 3.5 — Create `bin/lib/commands/activity.js`

**New file:** `products/map/bin/lib/commands/activity.js`

```javascript
import { runSupabase } from "../supabase-cli.js";
import { transformAll } from "@forwardimpact/map/activity/transform";
import { transformPeople } from "@forwardimpact/map/activity/transform/people";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";
import { transformAllGitHub } from "@forwardimpact/map/activity/transform/github";
import { getOrganization } from "@forwardimpact/map/activity/queries/org";

export async function start() {
  await runSupabase(["start"]);
  return 0;
}

export async function stop() {
  await runSupabase(["stop"]);
  return 0;
}

export async function status() {
  await runSupabase(["status"]);
  return 0;
}

export async function migrate() {
  await runSupabase(["db", "reset"]);
  return 0;
}

export async function transform(target, supabase) {
  switch (target) {
    case "people": {
      const r = await transformPeople(supabase);
      report("people", { imported: r.imported, errors: r.errors });
      return r.errors.length === 0 ? 0 : 1;
    }
    case "getdx": {
      const r = await transformAllGetDX(supabase);
      report("getdx", r);
      return r.errors.length === 0 ? 0 : 1;
    }
    case "github": {
      const r = await transformAllGitHub(supabase);
      report("github", r);
      return r.errors.length === 0 ? 0 : 1;
    }
    case "all":
    case undefined: {
      const r = await transformAll(supabase);
      report("all", r);
      const ok =
        r.people.errors.length === 0 &&
        r.getdx.errors.length === 0 &&
        r.github.errors.length === 0;
      return ok ? 0 : 1;
    }
    default:
      console.error(`Unknown transform target: ${target}`);
      return 1;
  }
}

export async function verify(supabase) {
  const people = await getOrganization(supabase);
  console.log(`  organization_people: ${people.length} rows`);

  const { count: snapshotCount, error: snapErr } = await supabase
    .from("getdx_snapshots")
    .select("*", { count: "exact", head: true });
  if (snapErr) throw new Error(`getdx_snapshots: ${snapErr.message}`);
  console.log(`  getdx_snapshots:     ${snapshotCount ?? 0} rows`);

  const { count: eventCount, error: eventErr } = await supabase
    .from("github_events")
    .select("*", { count: "exact", head: true });
  if (eventErr) throw new Error(`github_events: ${eventErr.message}`);
  console.log(`  github_events:       ${eventCount ?? 0} rows`);

  const hasPeople = people.length > 0;
  const hasDerived = (snapshotCount ?? 0) > 0 || (eventCount ?? 0) > 0;

  if (!hasPeople) {
    console.error(
      "\n❌ organization_people is empty. Run `fit-map people push <file>`.",
    );
    return 1;
  }
  if (!hasDerived) {
    console.error(
      "\n❌ No derived-table rows found. Run `fit-map getdx sync` or " +
        "configure the github-webhook.",
    );
    return 1;
  }

  console.log("\n✅ Activity layer verified");
  return 0;
}

function report(target, counts) {
  console.log(`Transform ${target}:`, JSON.stringify(counts, null, 2));
}
```

### Step 3.6 — Create `bin/lib/commands/getdx.js`

**New file:** `products/map/bin/lib/commands/getdx.js`

```javascript
import { extractGetDX } from "@forwardimpact/map/activity/extract/getdx";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";

export async function sync(supabase, { baseUrl } = {}) {
  const apiToken = process.env.GETDX_API_TOKEN;
  if (!apiToken) {
    console.error(
      "GETDX_API_TOKEN is not set. Export it before running getdx sync.",
    );
    return 1;
  }

  console.log("📥 Extracting GetDX snapshots...");
  const extract = await extractGetDX(supabase, {
    apiToken,
    baseUrl: baseUrl ?? "https://api.getdx.com",
  });
  console.log(`  Stored ${extract.files.length} raw files`);
  if (extract.errors.length > 0) {
    console.error("❌ Extract errors:");
    for (const err of extract.errors) console.error(`  • ${err}`);
    return 1;
  }

  console.log("\n🔄 Transforming GetDX data...");
  const result = await transformAllGetDX(supabase);
  console.log(
    `✅ Imported ${result.teams} teams, ${result.snapshots} snapshots, ${result.scores} scores`,
  );
  if (result.errors.length > 0) {
    console.error("❌ Transform errors:");
    for (const err of result.errors) console.error(`  • ${err}`);
    return 1;
  }
  return 0;
}
```

### Step 3.7 — Rewrite `bin/fit-map.js`

**File:** `products/map/bin/fit-map.js`

Replace the whole file. Key changes:

- Top of file imports `parseArgs` from `node:util`.
- The `main()` function uses
  `parseArgs({ options, allowPositionals: true, strict: false })` — strict false
  so unknown `--flag` values on the top- level parse don't trip over
  per-subcommand flags.
- `runValidate`, `runValidateShacl`, `runGenerateIndex`, `runExport`,
  `findDataDir`, `findOutputDir`, `formatValidationResults` stay unchanged.
- `runPeopleImport` is deleted. In its place, `dispatchPeople` dynamically
  imports `./lib/commands/people.js`.
- New dispatcher functions `dispatchActivity` and `dispatchGetdx` dynamically
  import their respective command files.
- `showHelp` updated to list every command from the leadership guide (commit
  `d008ca4`).
- `people import` is kept as a **deprecated alias** that delegates to
  `people validate` and prints a one-line deprecation warning to stderr. The
  spec permits this; it reduces friction for users who skimmed the old README.

Final dispatch table:

```javascript
switch (command) {
  case "validate":          return runValidate(...);
  case "generate-index":    return runGenerateIndex(...);
  case "export":            return runExport(...);
  case "people":            return dispatchPeople(subcommand, rest, values);
  case "activity":          return dispatchActivity(subcommand, rest, values);
  case "getdx":             return dispatchGetdx(subcommand, rest, values);
  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    return 1;
}
```

`dispatchPeople`:

```javascript
async function dispatchPeople(subcommand, rest, values) {
  const people = await import("./lib/commands/people.js");
  switch (subcommand) {
    case "validate": {
      const filePath = rest[0];
      if (!filePath) { console.error("people validate requires a file path"); return 1; }
      const dataDir = await findDataDir(values.data);
      return people.validate(filePath, dataDir);
    }
    case "push": {
      const filePath = rest[0];
      if (!filePath) { console.error("people push requires a file path"); return 1; }
      const supabase = await mapClient(values);
      return people.push(filePath, supabase);
    }
    case "import": {
      console.error(
        "warning: `fit-map people import` is deprecated. Use " +
          "`fit-map people validate` to validate locally or " +
          "`fit-map people push` to push to the database.",
      );
      const filePath = rest[0];
      if (!filePath) { console.error("people import requires a file path"); return 1; }
      const dataDir = await findDataDir(values.data);
      return people.validate(filePath, dataDir);
    }
    default:
      console.error(`Unknown people subcommand: ${subcommand || "(none)"}`);
      showHelp();
      return 1;
  }
}
```

`dispatchActivity`:

```javascript
async function dispatchActivity(subcommand, rest, values) {
  const activity = await import("./lib/commands/activity.js");
  switch (subcommand) {
    case "start":     return activity.start();
    case "stop":      return activity.stop();
    case "status":    return activity.status();
    case "migrate":   return activity.migrate();
    case "transform": return activity.transform(rest[0] ?? "all", await mapClient(values));
    case "verify":    return activity.verify(await mapClient(values));
    default:
      console.error(`Unknown activity subcommand: ${subcommand || "(none)"}`);
      showHelp();
      return 1;
  }
}
```

`dispatchGetdx`:

```javascript
async function dispatchGetdx(subcommand, rest, values) {
  const getdx = await import("./lib/commands/getdx.js");
  switch (subcommand) {
    case "sync":
      return getdx.sync(await mapClient(values), {
        baseUrl: values["base-url"],
      });
    default:
      console.error(`Unknown getdx subcommand: ${subcommand || "(none)"}`);
      showHelp();
      return 1;
  }
}

async function mapClient(values) {
  const { createMapClient } = await import("./lib/client.js");
  return createMapClient({ url: values.url });
}
```

The `parseArgs` options block:

```javascript
const { values, positionals } = parseArgs({
  options: {
    help: { type: "boolean", short: "h", default: false },
    json: { type: "boolean", default: false },
    shacl: { type: "boolean", default: false },
    data: { type: "string" },
    output: { type: "string" },
    url: { type: "string" },
    "base-url": { type: "string" },
  },
  allowPositionals: true,
  strict: false,
});

const [command, subcommand, ...rest] = positionals;
```

`showHelp` text must list every command the leadership guide and SKILL.md
already document. Cross-check against commit `d008ca4`.

### Step 3.8 — Sanity-run the CLI

```sh
node products/map/bin/fit-map.js --help
node products/map/bin/fit-map.js validate --data=products/pathway/starter
node products/map/bin/fit-map.js people validate <fixture.yaml> --data=products/pathway/starter
```

Expected: help text lists the new commands, validate still works, people
validate still works. `activity start` and `getdx sync` won't be run in CI but a
manual smoke test is fine.

**Commit at end of Phase 3:**
`feat(map): grow fit-map CLI with activity commands`

---

## Phase 4 — Cleanup + tests

**Goal:** delete dead code; bring the activity helpers up to test parity with
the framework layer.

### Step 4.1 — Delete the dead migration file

```sh
git rm products/map/activity/migrations/001_activity_schema.sql
rmdir products/map/activity/migrations
```

Run `find products/map/activity/migrations` to confirm the directory is gone
(criterion 10).

### Step 4.2 — Add `products/map/test/activity/storage.test.js`

```javascript
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
  storeRaw,
  readRaw,
  listRaw,
} from "@forwardimpact/map/activity/storage";

function createFakeClient() {
  const files = new Map();
  return {
    files,
    storage: {
      from(bucket) {
        assert.strictEqual(bucket, "raw");
        return {
          async upload(path, content) {
            files.set(path, { content, created_at: new Date().toISOString() });
            return { error: null };
          },
          async download(path) {
            const entry = files.get(path);
            if (!entry) return { data: null, error: { message: "not found" } };
            return { data: { text: async () => entry.content }, error: null };
          },
          async list(prefix) {
            const data = [...files.entries()]
              .filter(([p]) => p.startsWith(prefix))
              .map(([p, v]) => ({ name: p.slice(prefix.length), created_at: v.created_at }));
            return { data, error: null };
          },
        };
      },
    },
  };
}

describe("activity/storage", () => {
  let fake;
  beforeEach(() => { fake = createFakeClient(); });

  test("storeRaw then readRaw round-trips content", async () => {
    const r = await storeRaw(fake, "people/test.yaml", "hello");
    assert.strictEqual(r.stored, true);
    assert.strictEqual(r.path, "people/test.yaml");
    const text = await readRaw(fake, "people/test.yaml");
    assert.strictEqual(text, "hello");
  });

  test("listRaw returns files under a prefix", async () => {
    await storeRaw(fake, "people/one.yaml", "1");
    await storeRaw(fake, "people/two.yaml", "2");
    await storeRaw(fake, "github/one.json", "x");
    const people = await listRaw(fake, "people/");
    assert.strictEqual(people.length, 2);
    const github = await listRaw(fake, "github/");
    assert.strictEqual(github.length, 1);
  });
});
```

### Step 4.3 — Add `products/map/test/activity/transform-people.test.js`

Key property: manager-less-first ordering (the bug that would have caught the
`people import` misnomer).

```javascript
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { transformPeople } from "@forwardimpact/map/activity/transform/people";

function createFakeClient({ peopleYaml }) {
  const upsertCalls = [];
  return {
    upsertCalls,
    from(table) {
      assert.strictEqual(table, "organization_people");
      return {
        async upsert(rows, opts) {
          upsertCalls.push({ rows, onConflict: opts.onConflict });
          return { error: null };
        },
      };
    },
    storage: {
      from(bucket) {
        assert.strictEqual(bucket, "raw");
        return {
          async list() {
            return {
              data: [{ name: "latest.yaml", created_at: "2026-01-01T00:00:00Z" }],
              error: null,
            };
          },
          async download() {
            return {
              data: { text: async () => peopleYaml },
              error: null,
            };
          },
        };
      },
    },
  };
}

describe("activity/transform/people", () => {
  test("upserts manager-less people before people with managers", async () => {
    const yaml = [
      "- email: ada@example.com",
      "  name: Ada",
      "  discipline: se",
      "  level: L4",
      "  manager_email: charles@example.com",
      "- email: charles@example.com",
      "  name: Charles",
      "  discipline: em",
      "  level: L5",
    ].join("\n");

    const fake = createFakeClient({ peopleYaml: yaml });
    const result = await transformPeople(fake);

    assert.strictEqual(result.imported, 2);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(fake.upsertCalls.length, 2);
    assert.strictEqual(fake.upsertCalls[0].rows[0].email, "charles@example.com");
    assert.strictEqual(fake.upsertCalls[1].rows[0].email, "ada@example.com");
    assert.strictEqual(fake.upsertCalls[0].onConflict, "email");
  });
});
```

### Step 4.4 — Add `products/map/test/activity/transform-github.test.js`

Covers all three artifact types against a recording fake client:

```javascript
import { test, describe } from "node:test";
import assert from "node:assert";
import {
  transformGitHubWebhook,
} from "@forwardimpact/map/activity/transform/github";

function createFakeClient(storedDocument) {
  const upsertCalls = [];
  return {
    upsertCalls,
    from(table) {
      if (table === "organization_people") {
        return {
          select() { return this; },
          eq() { return this; },
          async single() { return { data: { email: "ada@example.com" } }; },
        };
      }
      return {
        async upsert(row, opts) {
          upsertCalls.push({ table, row, onConflict: opts.onConflict });
          return { error: null };
        },
      };
    },
    storage: {
      from() {
        return {
          async download() {
            return {
              data: { text: async () => storedDocument },
              error: null,
            };
          },
        };
      },
    },
  };
}

describe("activity/transform/github", () => {
  test("extracts pull_request artifact", async () => {
    const raw = JSON.stringify({
      delivery_id: "1",
      event_type: "pull_request",
      received_at: "2026-01-01T00:00:00Z",
      payload: {
        action: "opened",
        repository: { full_name: "org/repo" },
        sender: { login: "adalovelace" },
        pull_request: {
          number: 7,
          title: "Thing",
          user: { login: "adalovelace" },
          created_at: "2026-01-01T00:00:00Z",
          state: "open",
          additions: 10,
          deletions: 2,
          changed_files: 1,
          merged: false,
          base: { ref: "main" },
          head: { ref: "feat" },
        },
      },
    });
    const fake = createFakeClient(raw);
    const result = await transformGitHubWebhook(fake, "github/1.json");
    assert.strictEqual(result.event, true);
    assert.strictEqual(result.artifacts, 1);
    const prCall = fake.upsertCalls.find((c) => c.table === "github_artifacts");
    assert.strictEqual(prCall.row.artifact_type, "pull_request");
    assert.strictEqual(prCall.row.external_id, "pr:org/repo#7");
    assert.strictEqual(prCall.row.email, "ada@example.com");
  });

  test("extracts review artifact", async () => { /* similar */ });
  test("extracts commit artifacts from push", async () => { /* similar */ });
});
```

Fill in the two remaining tests following the same shape. Sample payloads for
`pull_request_review` and `push` events are small and can be written inline.

### Step 4.5 — Add `products/map/test/activity/transform-getdx.test.js`

```javascript
import { test, describe } from "node:test";
import assert from "node:assert";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";

function createFakeClient({ rawFiles }) {
  const upsertCalls = [];
  return {
    upsertCalls,
    from(table) {
      if (table === "organization_people") {
        return { select: async () => ({ data: [], error: null }) };
      }
      return {
        async upsert(rows, opts) {
          upsertCalls.push({ table, rows, onConflict: opts.onConflict });
          return { error: null };
        },
        async insert(rows) {
          upsertCalls.push({ table, rows, insert: true });
          return { error: null };
        },
      };
    },
    storage: {
      from() {
        return {
          async list(prefix) {
            const names = Object.keys(rawFiles)
              .filter((k) => k.startsWith(prefix))
              .map((k) => ({ name: k.slice(prefix.length), created_at: "z" }));
            return { data: names, error: null };
          },
          async download(path) {
            return {
              data: { text: async () => rawFiles[path] },
              error: null,
            };
          },
        };
      },
    },
  };
}

describe("activity/transform/getdx", () => {
  test("transformAllGetDX imports teams, snapshots, and scores", async () => {
    const rawFiles = {
      "getdx/teams-list/2026.json": JSON.stringify({
        teams: [{ id: "T1", name: "Platform" }],
      }),
      "getdx/snapshots-list/2026.json": JSON.stringify({
        snapshots: [{ id: "S1", completed_at: "2026-01-01" }],
      }),
      "getdx/snapshots-info/S1.json": JSON.stringify({
        snapshot: {
          team_scores: [
            { item_id: "D1", item_type: "driver", score: 80 },
          ],
        },
      }),
    };
    const fake = createFakeClient({ rawFiles });
    const result = await transformAllGetDX(fake);
    assert.strictEqual(result.teams, 1);
    assert.strictEqual(result.snapshots, 1);
    assert.strictEqual(result.scores, 1);
    assert.strictEqual(result.errors.length, 0);
  });
});
```

### Step 4.6 — Add `products/map/test/activity/validate-people.test.js`

Node-only path (the one still importing from `src/loader.js`):

```javascript
import { test, describe } from "node:test";
import assert from "node:assert";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadPeopleFile,
  validatePeople,
} from "@forwardimpact/map/activity/validate/people";

describe("activity/validate/people", () => {
  test("validatePeople flags unknown levels", async () => {
    const people = [
      { email: "a@x", name: "A", discipline: "software_engineering", level: "L999" },
    ];
    const { valid, errors } = await validatePeople(
      people,
      "products/pathway/starter",
    );
    assert.strictEqual(valid.length, 0);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /unknown level/);
  });

  test("loadPeopleFile parses yaml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "map-people-"));
    const path = join(dir, "test.yaml");
    await writeFile(path, "- email: a@x\n  name: A\n  discipline: se\n  level: L1");
    const people = await loadPeopleFile(path);
    assert.strictEqual(people.length, 1);
    assert.strictEqual(people[0].email, "a@x");
    await rm(dir, { recursive: true });
  });
});
```

`products/pathway/starter` is the monorepo's committed framework fixture used by
existing tests.

### Step 4.7 — Verify tests pass

```sh
cd products/map && bun test
```

Expected: 101 existing tests + 5 new files worth (~15 new tests) = well above
101, all green.

**Commit at end of Phase 4:**
`test(map): add activity helper coverage + drop dead migration`

---

## Phase 5 — Verification against the spec's 12 success criteria

Each criterion has one command (or short sequence) the implementer runs to prove
it holds.

| #   | Criterion                | Verification                                                                                                                                                                                                     |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Install + help           | `node products/map/bin/fit-map.js --help` shows `validate`, `generate-index`, `export`, `people validate`, `people push`, `activity …`, `getdx sync`. npm-install smoke test is done separately.                 |
| 2   | Framework path unchanged | `cd products/map && bun test` — 101 framework tests still green.                                                                                                                                                 |
| 3   | Activity stack starts    | `cd /tmp && npx fit-map activity start` → prints Supabase URL and keys. `npx fit-map activity status` → reports stack running. `npx fit-map activity stop` → stops cleanly. None of these require a manual `cd`. |
| 4   | People push end-to-end   | After `start` + `migrate` + `people push ./fixture.yaml`: `psql` (or Supabase UI) shows rows in `activity.organization_people` with `manager_email` resolved. Second `people push` is a no-op, prints 0 errors.  |
| 5   | GetDX sync — both paths  | `GETDX_API_TOKEN=<real> npx fit-map getdx sync` populates the three getdx tables. `curl -X POST .../functions/v1/getdx-sync` produces the same row counts. (GetDX creds required.)                               |
| 6   | Transform reprocess      | After raw bucket has data: `npx fit-map activity transform` repopulates all four derived tables. `curl -X POST .../functions/v1/transform` produces identical counts.                                            |
| 7   | Verify command           | `npx fit-map activity verify` exits 0 after criteria 4 and 5 have run. `supabase db reset && npx fit-map activity verify` exits non-zero with a clear message pointing at `people push`.                         |
| 8   | Shared source of truth   | `grep -rn "extractPullRequestArtifacts\|extractReviewArtifacts\|extractCommitArtifacts" products/map/supabase products/map/bin` returns hits only in `supabase/functions/_shared/activity/transform/github.js`.  |
| 9   | Tests                    | `cd products/map && bun test` — all old + new tests green. At least one `test/activity/*.test.js` file per file under `supabase/functions/_shared/activity/**`.                                                  |
| 10  | Dead migration gone      | `find products/map/activity/migrations` prints nothing.                                                                                                                                                          |
| 11  | Docs coherent            | `grep -n "\.mjs\|@forwardimpact/map/activity" website/docs/getting-started/leadership/index.md` returns zero matches. (Already verified on commit `d008ca4`.)                                                    |
| 12  | Skill coherent           | `grep -n "Activity commands" .claude/skills/fit-map/SKILL.md` matches the top-level section and the CLI reference table lists every command from criterion 1. (Already verified on commit `d008ca4`.)            |

After every criterion passes, run the final check:

```sh
bun run check && bun run test
```

and confirm `git status` is clean.

---

## Risks and mitigations

### Risk 1 — Deno cannot resolve `yaml` and `@supabase/supabase-js` from the moved `people.js` at deploy time

**Likelihood:** MEDIUM. The import map lives in per-function `deno.json`. The
shared `_shared/activity/transform/people.js` imports bare `yaml`. When Deno
bundles `people-upload/index.ts`, it walks the import graph, hits
`_shared/activity/transform/people.js`, encounters the bare `yaml` specifier,
and must resolve it via a `deno.json` it can see. Per-function `deno.json`
placement works when the edge function starts at a file co-located with the
`deno.json`. It is less clear whether a bare specifier encountered in a
transitive import inherits the starter's import map.

**Mitigation:**

1. Phase 2 step 2.6 is an explicit smoke test before Phase 3 starts. Run
   `supabase functions serve` locally with
   `supabase functions deploy --no-verify-jwt transform` and hit the endpoint.
   If bundling fails, the failure mode is early and obvious.
2. **Fallback A:** switch bare imports to `npm:yaml@2` inline in
   `_shared/activity/transform/people.js`. Node cannot resolve `npm:` specifiers
   — so guard with a conditional that swaps at build time, or more simply, move
   the YAML parsing up to the call sites (CLI + edge function each parse, then
   call a parser-free transform).
3. **Fallback B:** add a monorepo-root `deno.json` that Supabase CLI picks up
   via the standard Deno import-map resolution walk.

### Risk 2 — `supabase functions serve` (Docker) resolves `../_shared/` differently from `supabase functions deploy` (remote)

**Likelihood:** LOW. The `_shared/` pattern is the documented Supabase
convention; both paths are expected to resolve it identically.

**Mitigation:** the Phase 2 smoke test runs both `serve` and `deploy` for one
function against a throwaway Supabase project before any CLI work begins. If
there's a mismatch, the plan author stops and reports; the fallback is to inline
the transform code into the edge function and accept the duplication (losing
criterion 8). Do not proceed past the smoke test without both paths green.

### Risk 3 — `@supabase/supabase-js` adds ~200 KB to the installed `@forwardimpact/map` package

**Likelihood:** HIGH (this just happens).

**Mitigation:** accept. The activity layer needs it, and the spec explicitly
calls out adding the dependency. Consumers who only use the framework layer
(`fit-map validate`) don't pay the transfer cost at runtime — Node doesn't load
it unless the CLI dispatches to an activity command. Package size is measured
after Phase 1 lands and reported in the implementation notes.

### Risk 4 — Self-imports via `@forwardimpact/map/...` from `bin/fit-map.js` don't resolve during monorepo development

**Likelihood:** LOW. Node 18+ and Bun both support the package `"exports"` field
for self-referencing (a package importing its own exports by name). No existing
package in this monorepo uses self-references yet —
`products/pathway/bin/fit-pathway.js:37` imports `@forwardimpact/map/loader`,
which is a cross-package import, not a self-reference. However, self-referencing
is part of the Node module resolution spec since Node 12 and has no known
compatibility issues in Node 18+ or Bun 1.2+.

**Mitigation:** if self-imports misbehave on some platform, fall back to
relative paths from `bin/lib/commands/*.js`:
`import { transformPeople } from "../../../supabase/functions/_shared/activity/transform/people.js"`.
Ugly but always works. Tests use the same fallback pattern.

### Risk 5 — Users with a broken `getdx-sync` already deployed

Addressed in spec. The mitigation is already in the plan:

- Phase 5 criterion 5 verifies the deployed function end-to-end.
- `fit-map activity verify` gives the user a single command to prove the fix
  landed after `supabase functions deploy`.

---

## Non-negotiables for the implementer

- Every command name, every env variable, every step in the leadership guide and
  SKILL.md must keep working. Commit `d008ca4` is the contract.
- No schema changes. Migrations under `supabase/migrations/` are read-only in
  this plan.
- No new external dependencies beyond `@supabase/supabase-js`.
- No behaviour change in `github-webhook`. Only its imports move.
- No subprocess CLI tests (not a repo pattern).

## Ordering summary

```
Phase 1 (moves, exports) ─► Phase 2 (edge functions) ─► Phase 3 (CLI) ─► Phase 4 (tests + delete) ─► Phase 5 (verification)
```

Each phase ends in a commit. Phase 2 has an explicit smoke-test gate before
advancing to Phase 3 — if the edge function bundle can't resolve the shared
imports, the CLI work is wasted effort and the plan author must regroup.

The leadership guide and SKILL.md changes are already landed on the branch
(`d008ca4`). The implementer does not touch them; they validate them via Phase 5
criteria 11 and 12.
