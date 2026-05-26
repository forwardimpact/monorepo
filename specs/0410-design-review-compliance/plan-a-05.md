# Part 05 — Summit: Optional Dependency Reclassification

## Problem

`@supabase/supabase-js` is in `dependencies` with a static `import` in
`products/summit/src/lib/supabase.js` line 9. Per CONTRIBUTING.md dependency
policy, backend-specific packages that have alternative code paths belong in
`optionalDependencies` with dynamic `import()`. Summit works without Supabase
via `--roster <path>` (YAML file source), making this backend-specific.

## Changes

### Step 1: Reclassify in package.json

**File:** `products/summit/package.json`

Move `"@supabase/supabase-js": "^2.103.0"` from `dependencies` (line 41) to a
new `optionalDependencies` section.

**Before:**

```json
"dependencies": {
  "@forwardimpact/libcli": "^0.1.0",
  "@forwardimpact/libskill": "^4.1.7",
  "@forwardimpact/libtelemetry": "^0.1.33",
  "@forwardimpact/libutil": "^0.1.72",
  "@forwardimpact/map": "^0.15.18",
  "@supabase/supabase-js": "^2.103.0",
  "yaml": "^2.8.3"
}
```

**After:**

```json
"dependencies": {
  "@forwardimpact/libcli": "^0.1.0",
  "@forwardimpact/libskill": "^4.1.7",
  "@forwardimpact/libtelemetry": "^0.1.33",
  "@forwardimpact/libutil": "^0.1.72",
  "@forwardimpact/map": "^0.15.18",
  "yaml": "^2.8.3"
},
"optionalDependencies": {
  "@supabase/supabase-js": "^2.103.0"
}
```

### Step 2: Convert static import to dynamic import

**File:** `products/summit/src/lib/supabase.js`

Replace the static import (line 9) with a dynamic import inside the factory
function. The function becomes `async` to accommodate `await import()`.

**Before:**

```javascript
import { createClient } from "@supabase/supabase-js";

// ... (class and JSDoc unchanged)

export function createSummitClient(opts = {}) {
  const url = opts.url ?? process.env.MAP_SUPABASE_URL;
  const key = opts.serviceRoleKey ?? process.env.MAP_SUPABASE_SERVICE_ROLE_KEY;
  const schema = opts.schema ?? "activity";

  if (!url || !key) {
    throw new SupabaseUnavailableError(
      "MAP_SUPABASE_URL / MAP_SUPABASE_SERVICE_ROLE_KEY not set. " +
        "Run `fit-map activity start` and export the URL + key it prints, " +
        "or use --roster <path> to load from a local YAML file instead.",
    );
  }

  return createClient(url, key, { db: { schema } });
}
```

**After:**

```javascript
// Static import removed — dynamic import below per CONTRIBUTING.md § Optional Dependency Pattern.

// ... (class and JSDoc unchanged, update @returns to Promise)

export async function createSummitClient(opts = {}) {
  const url = opts.url ?? process.env.MAP_SUPABASE_URL;
  const key = opts.serviceRoleKey ?? process.env.MAP_SUPABASE_SERVICE_ROLE_KEY;
  const schema = opts.schema ?? "activity";

  if (!url || !key) {
    throw new SupabaseUnavailableError(
      "MAP_SUPABASE_URL / MAP_SUPABASE_SERVICE_ROLE_KEY not set. " +
        "Run `fit-map activity start` and export the URL + key it prints, " +
        "or use --roster <path> to load from a local YAML file instead.",
    );
  }

  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    throw new Error(
      "Supabase features require @supabase/supabase-js. " +
        "Install with: npm install @supabase/supabase-js",
    );
  }

  return createClient(url, key, { db: { schema } });
}
```

The credential check stays before the dynamic import — if env vars are missing,
the user gets the existing `SupabaseUnavailableError` without needing the
package installed.

### Step 3: Update callers to await

`createSummitClient` is now async. Four call sites need `await`:

**File:** `products/summit/src/roster/loader.js`

The factory is used as a default parameter (line 35):

```javascript
createClient = createSummitClient,
```

Later in the function body, wherever `createClient()` is called, add `await`:

```javascript
// Before
const client = createClient();

// After
const client = await createClient();
```

`loadRoster` is already `async`, so this is a safe change.

**File:** `products/summit/src/commands/coverage.js`

Line 89 calls `createSummitClient()` directly inside the async
`decorateWithEvidence` helper:

```javascript
// Before
const client = options.supabase ?? createSummitClient();

// After
const client = options.supabase ?? await createSummitClient();
```

**File:** `products/summit/src/commands/growth.js`

Two call sites inside async helpers:

- Line 99 in `loadEvidenceSafe()`: `options.supabase ?? createSummitClient()`
- Line 118 in `loadScoresSafe()`: `options.supabase ?? createSummitClient()`

Add `await` to both:

```javascript
// Before
const client = options.supabase ?? createSummitClient();

// After
const client = options.supabase ?? await createSummitClient();
```

Both helpers are `async` functions.

**File:** `products/summit/src/commands/risks.js`

Line 103 in `loadEvidenceSafe()`: same pattern as growth.js.

```javascript
// Before
const client = options.supabase ?? createSummitClient();

// After
const client = options.supabase ?? await createSummitClient();
```

Already inside an `async` function.

## Blast radius

| Action   | File                                       |
| -------- | ------------------------------------------ |
| Modified | `products/summit/package.json`             |
| Modified | `products/summit/src/lib/supabase.js`      |
| Modified | `products/summit/src/roster/loader.js`     |
| Modified | `products/summit/src/commands/coverage.js` |
| Modified | `products/summit/src/commands/growth.js`   |
| Modified | `products/summit/src/commands/risks.js`    |

## Ordering

1. Reclassify dependency (Step 1).
2. Convert import (Step 2).
3. Update callers (Step 3) — depends on Step 2.

Steps are strictly sequential within this part.

## Risks

- **Async propagation.** Making `createSummitClient` async propagates to every
  caller. All four verified call sites (`loader.js`, `coverage.js`, `growth.js`,
  `risks.js`) are inside `async` functions, so adding `await` is safe. The
  re-export in `src/index.js` is pass-through and unaffected.
- **JSDoc type annotations.** Several files reference
  `import("@supabase/supabase-js").SupabaseClient` in JSDoc. These are type-only
  annotations and do not cause runtime imports — leave them unchanged.

## Verification

```sh
grep -n "\"@supabase/supabase-js\"" products/summit/package.json
  # appears in optionalDependencies, not dependencies

grep -n "^import.*supabase-js" products/summit/src/
  # zero hits (no static imports)

bun run test -- products/summit   # all tests pass
```
