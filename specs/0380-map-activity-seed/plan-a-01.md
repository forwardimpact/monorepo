# Part 01 — Consolidate People Parsers

Extract `parseYamlPeople()` and `parseCsv()` into a single shared module. Both
the CLI validator and the Supabase edge function import from it.

## Rationale

The two copies are identical (both now handle `roster:` wrapper and
`github_username`/`github` aliasing). A single source prevents future drift.

## Changes

### Create: `products/map/activity/parse-people.js`

New shared module. Deno-compatible (no `fs` import, receives content strings).

```javascript
import { parse as parseYaml } from "yaml";

/**
 * Parse a YAML people file into an array of person objects.
 * Accepts a top-level array, a `people:` wrapper, or a `roster:` wrapper.
 * @param {string} content
 * @returns {Array<object>}
 */
export function parseYamlPeople(content) {
  const data = parseYaml(content);
  if (Array.isArray(data)) return data;
  const rows = data.people || data.roster || [];
  return rows.map((row) => ({
    ...row,
    github_username: row.github_username || row.github || null,
  }));
}

/**
 * Parse a CSV string into an array of objects using the header row as keys.
 * @param {string} csv
 * @returns {Array<object>}
 */
export function parseCsv(csv) {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || null]));
  });
}

/**
 * Parse a people file by format.
 * @param {string} content
 * @param {'csv'|'yaml'} format
 * @returns {Array<object>}
 */
export function parsePeopleFile(content, format) {
  if (format === "csv") return parseCsv(content);
  return parseYamlPeople(content);
}
```

### Modify: `products/map/package.json`

Add the shared parser to the exports map so it can be imported via
`@forwardimpact/map/activity/parse-people` (matching the convention used by all
other activity modules):

```json
"./activity/parse-people": "./activity/parse-people.js"
```

Add this adjacent to the existing `"./activity/validate/people"` entry (line
46).

### Modify: `products/map/activity/validate/people.js`

Remove the local `parseCsv()` and `parseYamlPeople()` functions. Import from the
shared module.

**Before:**

```javascript
import { parse as parseYaml } from "yaml";
// ... local parseCsv and parseYamlPeople definitions
```

**After:**

```javascript
import { parseYamlPeople, parseCsv } from "../parse-people.js";
// ... remove local definitions, keep loadPeopleFile, validatePeople
```

`loadPeopleFile()` stays here (it uses `fs/promises`, which is Node-only and
correct for the CLI validator). It delegates to the shared parsers.

### Modify: `products/map/supabase/functions/_shared/activity/transform/people.js`

Remove the local `parseCsv()`, `parseYamlPeople()`, and `parsePeopleFile()`
functions. Import from the shared module.

**Before:**

```javascript
import { parse as parseYaml } from "yaml";
// ... local parseCsv, parseYamlPeople, parsePeopleFile definitions
```

**After:**

```javascript
import { parsePeopleFile } from "../../../../activity/parse-people.js";
// ... remove local definitions, keep transformPeople, importPeople
```

The relative path `../../../../activity/parse-people.js` resolves from
`supabase/functions/_shared/activity/transform/` back to `activity/`. The
`deno.json` already maps `yaml` → `npm:yaml@2`, so the shared module's bare
`yaml` import works under Deno.

Remove the `import { parse as parseYaml } from "yaml"` from this file — it's no
longer needed here.

## Verification

1. `bun test products/map/test/activity/` — existing transform and validator
   tests pass.
2. `bunx fit-map people validate data/activity/roster.yaml` — works as before.
3. Confirm `parseYamlPeople` and `parseCsv` each exist in exactly one file:
   ```
   grep -rn "function parseYamlPeople\|function parseCsv" products/map/
   ```
   Should return only `products/map/activity/parse-people.js`.

## Risks

- **Deno relative import resolution**: The four-level relative path is fragile
  if the directory structure changes. Acceptable because the structure is stable
  and the integration test (part 04) will catch any breakage.
