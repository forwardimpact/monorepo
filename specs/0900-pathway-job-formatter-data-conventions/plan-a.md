# Plan A — Spec 0900 — Pathway Job Formatter Data Conventions

## Approach

The design fixes #874 bugs 1 and 4 by naming two composition contracts and
closing the gate at the render path. Step 1 adds three pure predicates and a
shared `CONTRACT_URL` constant in `products/map/src/validation/level.js`.
Step 2 wires them into `validateAllData`'s level walk so the contract surfaces
as standard `INVALID_VALUE` errors, and re-exports the new symbols from the
package barrel. Step 3 creates a new browser-safe module
`products/map/src/contract.js` that owns `ContractViolationError` and
`throwIfErrors` — these must not live in `loader.js` (which statically imports
`fs/promises`) or any browser bundle on the pathway side will pull Node-only
modules. Step 4 adds the `DataLoader.loadAndValidate` wrapper. Step 5 flips
the two Node render entry points to it. Step 6 mirrors the gate in the three
browser entry points using imports from `@forwardimpact/map/contract` and
`@forwardimpact/map/validation` (both pure JS). Step 7 adds the authoring
gate by calling `validateAllData` inside `runFullValidation`'s existing
`loadedData` guard. Steps 8–10 align the upstream emitters: the
synthetic-prose prompt, the DSL seed, and the schema `description` strings.
Step 11 writes the canonical contract section in the authoring guide. Step
12 adds the predicate, gate, and starter render-parity tests. The plan
touches the codebase in dependency order: predicate-only first, orchestrator
second, callers third, emitters last, docs alongside the schema pointer.

Libraries used: none.

## Files

| Status | File |
| --- | --- |
| created  | `products/map/src/contract.js` |
| modified | `products/map/src/validation/level.js` |
| modified | `products/map/src/validation.js` |
| modified | `products/map/src/loader.js` |
| modified | `products/map/src/schema-validation.js` |
| modified | `products/map/src/index.js` |
| modified | `products/map/package.json` |
| modified | `products/map/schema/json/levels.schema.json` |
| modified | `products/pathway/bin/fit-pathway.js` |
| modified | `products/pathway/src/commands/build-packs.js` |
| modified | `products/pathway/src/main.js` |
| modified | `products/pathway/src/slide-main.js` |
| modified | `products/pathway/src/handout-main.js` |
| modified | `products/pathway/src/index.html` |
| modified | `products/pathway/src/slides.html` |
| modified | `products/pathway/src/handout.html` |
| modified | `libraries/libsyntheticprose/src/prompts/pathway/level.js` |
| modified | `data/synthetic/story.dsl` |
| modified | `websites/fit/docs/products/authoring-standards/index.md` |
| modified | `products/pathway/test/build-packs.test.js` |
| created  | `products/map/test/validation-level.test.js` |
| created  | `products/map/test/validation-all-data.test.js` |
| created  | `products/map/test/contract.test.js` |
| created  | `products/map/test/loader-validate.test.js` |
| created  | `libraries/libsyntheticprose/test/prompts-pathway-level.test.js` |

## Steps

### Step 1 — Three predicates and `CONTRACT_URL` in `validation/level.js`

Add the contract anchor and three pure predicates. Predicates are
self-contained; the orchestrator wires them in Step 2.

Files modified: `products/map/src/validation/level.js`.

Append to the existing module (after `validateCapability`):

```js
export const CONTRACT_URL =
  "https://www.forwardimpact.team/docs/products/authoring-standards/index.md#level-field-conventions";

const PROFESSIONAL_TITLE_SHAPE = /^(?:Level [IVX]+|Level \d+|[A-Z][a-z]+)$/;

/** @param {string} value */
export function checkProfessionalTitleShape(value) {
  if (typeof value !== "string" || !PROFESSIONAL_TITLE_SHAPE.test(value)) {
    return {
      ok: false,
      reason: `professionalTitle must be a single capitalised rank word or "Level <numeral>"; got ${JSON.stringify(value)}`,
    };
  }
  return { ok: true };
}

function tokenise(s) {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t !== "level");
}

/** @param {{professionalTitle: string}} level @param {Array<{roleTitle: string}>} disciplines */
export function checkProfessionalTitleDisjoint(level, disciplines) {
  const titleTokens = new Set(tokenise(level.professionalTitle));
  for (const discipline of disciplines || []) {
    const roleTokens = tokenise(discipline.roleTitle);
    const overlap = roleTokens.filter((t) => titleTokens.has(t));
    if (overlap.length > 0) {
      return {
        ok: false,
        reason: `professionalTitle ${JSON.stringify(level.professionalTitle)} shares token "${overlap[0]}" with discipline "${discipline.id}" roleTitle ${JSON.stringify(discipline.roleTitle)}`,
      };
    }
  }
  return { ok: true };
}

const AUTONOMY_THIRD_PERSON = /^[A-Z][a-z]*[^s]s$/;

/** @param {string} value */
export function checkAutonomyExpectation(value) {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: true }; // empty/missing handled by upstream MISSING_OPTIONAL warning
  }
  const firstToken = value.split(/\s+/)[0];
  if (firstToken === "Is" || AUTONOMY_THIRD_PERSON.test(firstToken)) {
    return {
      ok: false,
      reason: `autonomyExpectation must open with a base-form verb (e.g. "Work…"); got third-person opener ${JSON.stringify(firstToken)}`,
    };
  }
  return { ok: true };
}
```

Notes for the implementer:

- `checkAutonomyExpectation` returns `{ok: true}` on empty/missing because
  the existing `validateLevel` warns when the whole `expectations` object is
  absent (`level.js:103`); the spec scope is verb-form correctness on
  values that *are* present, not presence enforcement (see design § Open
  Scope) — do not widen the predicate.
- The shape regex rejects `"Senior Engineer"` (two words), `"engineer"`
  (lower-case), `""`, and `null`; accepts `"Level I"`, `"Level 3"`,
  `"Senior"`, `"Mid"`, `"Staff"`, `"Principal"`, `"Distinguished"`.
- `tokenise` strips the literal `level` (case-insensitive) per design K3(b)
  so a discipline `roleTitle: "Software Engineer Level"` does not falsely
  intersect a level `Level I`.

Verification: Step 12 covers with unit tests.

### Step 2 — Wire predicates into `validateAllData` and re-export

Add a post-`validateEntityList` loop over levels that calls the three
predicates and emits `INVALID_VALUE` errors with the contract URL embedded in
`message`. Then re-export the new symbols from `index.js` so callers can
import from the package barrel.

Files modified: `products/map/src/validation.js`, `products/map/src/index.js`.

In `validation.js`, extend the imports from `./validation/level.js`:

```js
import {
  validateLevel,
  validateCapability,
  checkProfessionalTitleShape,
  checkProfessionalTitleDisjoint,
  checkAutonomyExpectation,
  CONTRACT_URL,
} from "./validation/level.js";
```

`validation.js`'s level walk runs `validateEntityList(levels, "level", …)` at
lines 126–132. Immediately after that call (line 133), add the contract
loop. The `disciplines` array is the same one the function already received
as a destructured parameter at line 65, so no signature change:

```js
(levels || []).forEach((level, index) => {
  const path = `levels[${index}]`;

  const shape = checkProfessionalTitleShape(level.professionalTitle);
  if (!shape.ok) {
    allErrors.push(
      createError(
        "INVALID_VALUE",
        `${shape.reason} — see ${CONTRACT_URL}`,
        `${path}.professionalTitle`,
        level.professionalTitle,
      ),
    );
  }

  const disjoint = checkProfessionalTitleDisjoint(level, disciplines || []);
  if (!disjoint.ok) {
    allErrors.push(
      createError(
        "INVALID_VALUE",
        `${disjoint.reason} — see ${CONTRACT_URL}`,
        `${path}.professionalTitle`,
        level.professionalTitle,
      ),
    );
  }

  const exp = level.expectations || {};
  const autonomy = checkAutonomyExpectation(exp.autonomyExpectation);
  if (!autonomy.ok) {
    allErrors.push(
      createError(
        "INVALID_VALUE",
        `${autonomy.reason} — see ${CONTRACT_URL}`,
        `${path}.expectations.autonomyExpectation`,
        exp.autonomyExpectation,
      ),
    );
  }
});
```

`products/map/src/index.js` currently re-exports `validateAllData` from
`./validation.js` (lines 22–27) and per-entity validators are **not**
exposed. Append a new block after the existing one:

```js
// Level field contract (added 2026-05-21 — spec 0900)
export {
  checkProfessionalTitleShape,
  checkProfessionalTitleDisjoint,
  checkAutonomyExpectation,
  CONTRACT_URL,
} from "./validation/level.js";
```

`validateLevel` and `validateCapability` stay unexported from the barrel —
they remain internals of `validation.js`.

Verification: Step 12 covers with `validation-all-data.test.js`.

### Step 3 — Create `products/map/src/contract.js` (browser-safe)

`loader.js` statically imports `fs/promises` at module scope (line 8) — any
module that re-imports `loader.js` will pull Node-only modules into a
browser bundle. The render-gate primitives must live in a separate file
that imports nothing Node-specific.

Files created: `products/map/src/contract.js`.

```js
/**
 * Render-gate primitives for the level field contract.
 *
 * Browser-safe: this module must not import `fs/promises`, `path`, or any
 * other Node-only module. The pathway browser bundles
 * (main.js / slide-main.js / handout-main.js) consume `throwIfErrors`.
 */

import { CONTRACT_URL } from "./validation/level.js";

export class ContractViolationError extends Error {
  /**
   * @param {{field: string, value: any, reason: string}} info
   */
  constructor({ field, value, reason }) {
    super(`Contract violation at ${field}: ${reason}`);
    this.name = "ContractViolationError";
    this.field = field;
    this.value = value;
    this.reason = reason;
    this.contractUrl = CONTRACT_URL;
  }
}

/**
 * Throw a ContractViolationError for the first matching validation error.
 * @param {{errors: Array}} result
 * @param {{ruleCodes: string[], paths: RegExp[]}} filter
 */
export function throwIfErrors(result, filter) {
  if (!result || !result.errors || result.errors.length === 0) return;
  const { ruleCodes, paths } = filter;
  const match = result.errors.find(
    (err) =>
      ruleCodes.includes(err.type) &&
      paths.some((rx) => rx.test(err.path || "")),
  );
  if (!match) return;
  throw new ContractViolationError({
    field: match.path,
    value: match.value,
    reason: match.message,
  });
}
```

Files modified: `products/map/package.json`.

Add `./contract` to the `exports` block, immediately after `./loader` (line
35):

```diff
     "./loader": "./src/loader.js",
+    "./contract": "./src/contract.js",
```

Files modified: `products/map/src/index.js`.

Append a re-export for the contract primitives so consumers that already
import from `@forwardimpact/map` keep one entry point:

```js
// Render-gate primitives (spec 0900)
export { ContractViolationError, throwIfErrors } from "./contract.js";
```

The barrel import path is browser-unsafe (it transitively pulls `loader.js`
+ `fs/promises`); browser entry points in Step 6 import from the subpath
`@forwardimpact/map/contract` directly, not from the barrel.

Verification: Step 12 (`contract.test.js`).

### Step 4 — `DataLoader.loadAndValidate(dataDir)`

Add a wrapper method on `DataLoader` that loads, validates, and gates.

Files modified: `products/map/src/loader.js`.

At the top of the file (after the existing imports), add:

```js
import { validateAllData } from "./validation.js";
import { throwIfErrors } from "./contract.js";
```

Inside the `DataLoader` class, immediately after the closing `}` of
`loadAllData(dataDir)` (line 344) and before the private `#loadRepoFile`
helper that starts at line 353:

```js
/**
 * Load all data and gate on K3/K5 contract violations.
 * Non-contract validation errors pass through silently to preserve
 * pre-existing behaviour at the CLI entry.
 * @param {string} dataDir
 * @returns {Promise<Object>}
 */
async loadAndValidate(dataDir) {
  const data = await this.loadAllData(dataDir);
  const result = validateAllData(data);
  throwIfErrors(result, {
    ruleCodes: ["INVALID_VALUE"],
    paths: [/\.professionalTitle$/, /\.autonomyExpectation$/],
  });
  return data;
}
```

`loader.js` may also re-export the contract primitives for Node-side
consumers that already import from `./loader`:

```js
export { ContractViolationError, throwIfErrors } from "./contract.js";
```

Verification: Step 12 (`loader-validate.test.js`).

### Step 5 — Switch Node render entry points

Files modified: `products/pathway/bin/fit-pathway.js`,
`products/pathway/src/commands/build-packs.js`.

In `bin/fit-pathway.js`, the default handler runs lines 320 (`try {`)
through 338 (the closing `}`); `catch` opens at line 335 and
`process.exit(1)` is at line 337. The existing block is:

```js
  try {
    const loader = createDataLoader();
    const templateLoader = createTemplateLoader(TEMPLATE_DIR);

    const data = await loader.loadAllData(dataDir);
    validateAllData(data);

    await handler({
```

Replace the two consecutive load/validate calls with one gated call:

```diff
-    const data = await loader.loadAllData(dataDir);
-    validateAllData(data);
+    const data = await loader.loadAndValidate(dataDir);
```

Drop the now-unused import. `bin/fit-pathway.js:18` reads:

```js
import { validateAllData } from "@forwardimpact/map/validation";
```

`validateAllData` was used only at line 325; remove the entire line.

The outer `try` at 320 and `catch` at 335 already print `error.message` and
exit non-zero, so `ContractViolationError`'s message ("Contract violation at
… — see …") surfaces unchanged.

In `commands/build-packs.js` (line 221):

```diff
-  const data = await loader.loadAllData(dataDir);
+  const data = await loader.loadAndValidate(dataDir);
```

`commands/build.js` and `commands/update.js` are explicitly **not** changed —
`build.js` delegates level loading to `build-packs.js`, and `update.js` only
reads `standard.yaml` (via `loadStandardConfig`). `commands/dev.js` is also
unchanged (it calls `loadStandardConfig`, not `loadAllData`).

Verification: existing `products/pathway/test/build-packs.test.js` runs
through `generatePacks`; Step 12 extends it with a starter render-parity
assertion (Files-modified row).

### Step 6 — Browser-side gate

Files modified: `products/pathway/src/main.js`,
`products/pathway/src/slide-main.js`,
`products/pathway/src/handout-main.js`.

The three browser entry points use `./lib/yaml-loader.js`'s plain
`loadAllData()`. Add the gate inline after each call site using imports
from `@forwardimpact/map/validation` (pure JS — no `fs`) and
`@forwardimpact/map/contract` (pure JS — Step 3 guarantees no Node-only
imports). **Do not import from `@forwardimpact/map/loader`** — it pulls
`fs/promises`.

In each of the three files, near the existing `loadAllData` import:

```diff
 import { loadAllData } from "./lib/yaml-loader.js";
+import { validateAllData } from "@forwardimpact/map/validation";
+import { throwIfErrors } from "@forwardimpact/map/contract";
```

`main.js` line 51:

```diff
-    const data = await loadAllData("./data");
+    const data = await loadAllData("./data");
+    throwIfErrors(validateAllData(data), {
+      ruleCodes: ["INVALID_VALUE"],
+      paths: [/\.professionalTitle$/, /\.autonomyExpectation$/],
+    });
```

`slide-main.js` line 348 and `handout-main.js` line 425 — identical gate,
immediately after the `loadAllData(...)` call site. The pre-existing
`try/catch` blocks in each file surface the thrown error to the rendered
error page (`setError` / `showError`).

**Register the new subpath in the three HTML import-maps.** The pathway
browser shell resolves bare specifiers via explicit `<script
type="importmap">` blocks in `index.html` (lines 26–68), `slides.html`
(top of `<head>`), and `handout.html` (top of `<head>`). Each already
lists `@forwardimpact/map`, `/levels`, `/loader`, and `/validation`. Add
one new entry — same path shape as the existing `/loader` mapping —
immediately after the existing `@forwardimpact/map/validation` row in
all three files:

```diff
           "@forwardimpact/map/loader": "/map/lib/loader.js",
           "@forwardimpact/map/validation": "/map/lib/validation.js",
+          "@forwardimpact/map/contract": "/map/lib/contract.js",
```

Without these entries the browser raises a `TypeError: Failed to resolve
module specifier "@forwardimpact/map/contract"` at page load, regressing
the very render path the spec exists to fix. The `build.js`
`resolvePackageLib("@forwardimpact/map")` step already copies the whole
`@forwardimpact/map` `src/` tree into `/map/lib/` of the built site, so
the new `contract.js` lands at the mapped target with no additional
build-script change.

Confirm `products/pathway/package.json` pins `@forwardimpact/map` at a
range that resolves to the local workspace version (it does via the
workspace hoist). Existing pathway imports from
`@forwardimpact/map/validation` and `@forwardimpact/map/loader` (in
`bin/fit-pathway.js:18` and `commands/build-packs.js:18`) prove subpath
resolution already works for Node-side callers; the import-map entries
above provide the same for browser-side callers.

Manually verify the build by running `bunx fit-pathway build
--data=products/map/starter --output /tmp/pathway-build` before opening
the PR (the CLI flag is `--data=<path>`, declared at
`bin/fit-pathway.js:202`; **not** `--data-dir`). The build runs the
bundler over `main.js` and would surface any browser import that
resolves to Node-only modules at bundle time, plus copies the static
HTML so the new import-map entries can be inspected in
`/tmp/pathway-build/index.html`.

Verification: existing browser code-path tests continue to pass (the gate
is a no-op on the compliant starter); the negative-fixture loader test
from Step 12 covers the throwing path.

### Step 7 — Authoring-path gate inside `runFullValidation`

Files modified: `products/map/src/schema-validation.js`.

`runFullValidation` is declared at line 449. The `if (loadedData)` guard
opens at line 457 and closes at line 461. Invoke `validateAllData` inside
that guard and merge its errors and warnings into the accumulators.

```diff
   async runFullValidation(dataDir, loadedData) {
     const allErrors = [];
     const allWarnings = [];

     const schemaResult = await this.validateDataDirectory(dataDir);
     allErrors.push(...schemaResult.errors);
     allWarnings.push(...schemaResult.warnings);

     if (loadedData) {
       const refResult = this.validateReferentialIntegrity(loadedData);
       allErrors.push(...refResult.errors);
       allWarnings.push(...refResult.warnings);
+      const allDataResult = validateAllData(loadedData);
+      allErrors.push(...allDataResult.errors);
+      allWarnings.push(...allDataResult.warnings);
     }

     return createValidationResult(
```

Indent the three new lines at the same column as `const refResult = …` —
6 spaces (4 for the method body + 2 for the `if` block content).

Add the import at the top of the file (group with the existing validation
imports):

```js
import { validateAllData } from "./validation.js";
```

`fit-map validate` prints all collected errors via the existing CLI output;
the contract URL embedded in the message surfaces without any further code
change.

Verification: existing `fit-map validate` smoke tests on the starter must
still pass; Step 12 adds a negative fixture that surfaces a K3 error
through the same path.

### Step 8 — Synthetic-prose prompt for the contract

Files modified: `libraries/libsyntheticprose/src/prompts/pathway/level.js`.

Replace the single-line `professionalTitle` instruction (line 49) with the
two-branch form, and inline the `autonomyExpectation` rule into the
`expectations` instruction (line 60). Concrete diff:

```diff
       "  - For each level, generate:",
       "  - id: Use the provided ID (uppercase, e.g., J040).",
-      "  - professionalTitle: Use the provided title or generate one.",
+      "  - professionalTitle: A single capitalised rank word (e.g. \"Associate\", \"Senior\", \"Staff\", \"Principal\") OR \"Level <roman>\" / \"Level <digit>\".",
+      "    When the level skeleton supplies professionalTitle, pass it through verbatim.",
+      "    Otherwise emit \"Level <roman>\" derived from the supplied rank (1→I, 2→II, …).",
+      "    NEVER emit a multi-word role-complete title (e.g. \"Senior Engineer\") — the discipline supplies the role.",
       "  - managementTitle: Generate a management-track equivalent.",
       …unchanged middle lines…
       "  - expectations: { impactScope, autonomyExpectation, influenceScope, complexityHandled }.",
       "    Each 1 sentence showing clear progression.",
+      "    autonomyExpectation MUST open with a base-form verb (e.g. \"Work…\", \"Lead…\", \"Define…\").",
+      "    Never start with a third-person form (e.g. \"Works…\", \"Owns…\", \"Drives…\").",
```

Verification: Step 12 (`prompts-pathway-level.test.js`) asserts both
branches appear in the prompt body.

### Step 9 — DSL seed alignment

Files modified: `data/synthetic/story.dsl`.

The `standard { levels { … } }` block sits at lines 680–687 of the current
DSL (design K8 cites lines 570–576 — those are stale; the file grew). The
DSL parser strips `//` line comments at the tokeniser level (verified by
the existing comments at lines 1, 8 of `story.dsl`); add a leading comment
that points at the contract URL.

```diff
+    // Level titles must comply with the professionalTitle contract:
+    // single capitalised rank word — see
+    // https://www.forwardimpact.team/docs/products/authoring-standards/index.md#level-field-conventions
     levels {
-      J040 { title "Associate Engineer" rank 1 experience "0-2 years" }
-      J060 { title "Engineer" rank 2 experience "2-4 years" }
-      J070 { title "Senior Engineer" rank 3 experience "4-7 years" }
-      J080 { title "Lead Engineer" rank 4 experience "7-10 years" }
-      J090 { title "Staff Engineer" rank 5 experience "10-14 years" }
-      J100 { title "Principal Engineer" rank 6 experience "14+ years" }
+      J040 { title "Associate" rank 1 experience "0-2 years" }
+      J060 { title "Mid" rank 2 experience "2-4 years" }
+      J070 { title "Senior" rank 3 experience "4-7 years" }
+      J080 { title "Staff" rank 4 experience "7-10 years" }
+      J090 { title "Principal" rank 5 experience "10-14 years" }
+      J100 { title "Distinguished" rank 6 experience "14+ years" }
     }
```

The `parser-standard.js:66` mapping (`title → professionalTitle`) is
unchanged; only the DSL values change. The starter (Step 10 — schema docs)
is already compliant — no `levels.yaml` change.

The K9 BioNova parity check (`bunx fit-terrain build --only=pathway`
against `data/synthetic/story.dsl`, seed 42 at line 6, followed by
`bunx fit-pathway job software_engineering J060`) requires an LLM API
key. It is **not** a CI test; record the procedure and the observed
output in the PR body under a `## BioNova parity` section:

- Command run (one line).
- Expected: role title appears exactly once at the top level; no
  `"You will works"` substring.
- Observed: paste the rendered first three lines of the markdown.

Verification: existing `libsyntheticgen` parser tests must still pass (no
parser change); CI does not run the LLM regen.

### Step 10 — Schema description pointers

Files modified: `products/map/schema/json/levels.schema.json`.

Replace the misleading example-bearing prose with a pointer to the canonical
home. No `pattern` is added — the predicates own enforcement. The level
object carries `additionalProperties: false` on line 104; the plan changes
only `description` strings on lines 29 and 90, leaving the schema's
property surface unchanged.

```diff
         "professionalTitle": {
           "type": "string",
-          "description": "Title for professional/IC track (e.g., Engineer I, Senior Engineer)"
+          "description": "Rank token; see https://www.forwardimpact.team/docs/products/authoring-standards/index.md#level-field-conventions"
         },
…
             "autonomyExpectation": {
               "type": "string",
-              "description": "Level of autonomy expected"
+              "description": "Base-form verb opener; see https://www.forwardimpact.team/docs/products/authoring-standards/index.md#level-field-conventions"
             },
```

Verification: `bunx fit-doc build --src=websites/fit` (not `serve` — the
build path copies schemas into `dist/schema/` per
`website-fit.yaml`; `serve` does not exercise the schema-publish lane)
must succeed; `bunx fit-map validate` against the starter continues to
pass (description text is informational).

### Step 11 — Canonical contract section in the authoring guide

Files modified: `websites/fit/docs/products/authoring-standards/index.md`.

Insert a new `## Level field conventions` section after Step 1 (the
existing "Define levels" section ends near line 105; the new section sits
between it and `## Step 2`). The anchor must be `#level-field-conventions`
to match Steps 1/8/9/10. Contents (one compliant + one non-compliant
example per field):

```markdown
## Level field conventions

Two fields on each level entry feed string composition in `fit-pathway job`
and have an unstated shape contract. This section names both. Standards
that violate either shape fail `fit-map validate` and `fit-pathway` startup
with a `ContractViolationError` pointing back here.

### `professionalTitle` — rank token

`professionalTitle` is the **rank** the engineer sits at, not the role.
The discipline supplies the role (e.g. `Software Engineer`); Pathway
composes the two into the job title via two branches:

- When `professionalTitle` starts with `Level`, the job title is
  `{roleTitle} {professionalTitle}` (e.g. `Software Engineer Level II`).
- Otherwise the job title is `{professionalTitle} {roleTitle}` (e.g.
  `Senior Software Engineer`).

The second branch produces a duplicated role token whenever the rank token
shares words with the discipline `roleTitle`. To avoid that, the contract
requires:

- A single capitalised word (`Associate`, `Senior`, `Staff`, `Principal`,
  `Distinguished`).
- `Level <roman>` (`Level I`, `Level II`) or `Level <digit>` (`Level 3`).
- The rank token must be **disjoint** (case- and punctuation-insensitive)
  from every discipline's `roleTitle` in the same standard.

Compliant: `professionalTitle: Senior` against
`discipline.roleTitle: Software Engineer` renders `Senior Software Engineer`.

Non-compliant: `professionalTitle: "Engineer"` against the same discipline
renders `Engineer Software Engineer` — `Engineer` is not disjoint from
`Software Engineer`.

### `autonomyExpectation` — base-form verb opener

`autonomyExpectation` is composed into the sentence `You will <value>`
(with the value lower-cased). The first word must be a base-form/imperative
verb so the sentence parses.

Compliant: `Work independently on familiar problems` →
`You will work independently on familiar problems.`

Non-compliant: `Works independently on routine tasks` →
`You will works independently on routine tasks.` Third-person openers
(`Works`, `Owns`, `Drives`, `Leads`, `Defines`) are rejected.
```

Verification: build the site with `bunx fit-doc build --src=websites/fit`
and confirm the anchor `#level-field-conventions` resolves. The build
fails on broken cross-references inside the same site.

### Step 12 — Tests

Files created and modified:

| File | Status | Coverage |
| --- | --- | --- |
| `products/map/test/validation-level.test.js` | created | predicate unit tests |
| `products/map/test/validation-all-data.test.js` | created | orchestrator with disciplines cross-check |
| `products/map/test/contract.test.js` | created | `ContractViolationError`, `throwIfErrors` |
| `products/map/test/loader-validate.test.js` | created | `DataLoader.loadAndValidate` |
| `libraries/libsyntheticprose/test/prompts-pathway-level.test.js` | created | prompt body assertions |
| `products/pathway/test/build-packs.test.js` | modified | starter render-parity assertion |

All test files use `node:test` + `assert/strict`, in line with sibling
files like `validation-organizational-context.test.js`.

`validation-level.test.js`:

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  checkProfessionalTitleShape,
  checkProfessionalTitleDisjoint,
  checkAutonomyExpectation,
  CONTRACT_URL,
} from "../src/validation/level.js";

describe("checkProfessionalTitleShape", () => {
  for (const ok of ["Level I", "Level II", "Level 3", "Associate", "Mid",
                    "Senior", "Staff", "Principal", "Distinguished"]) {
    test(`accepts ${JSON.stringify(ok)}`, () =>
      assert.equal(checkProfessionalTitleShape(ok).ok, true));
  }
  for (const bad of ["Senior Engineer", "Engineer I", "engineer", "",
                     null, undefined, "STAFF"]) {
    test(`rejects ${JSON.stringify(bad)}`, () =>
      assert.equal(checkProfessionalTitleShape(bad).ok, false));
  }
});

describe("checkProfessionalTitleDisjoint", () => {
  const disciplines = [{ id: "swe", roleTitle: "Software Engineer" }];
  test("rejects shared token", () => {
    const r = checkProfessionalTitleDisjoint({ professionalTitle: "Engineer" }, disciplines);
    assert.equal(r.ok, false);
    assert.match(r.reason, /"engineer"/);
  });
  test("accepts disjoint single word", () => {
    assert.equal(
      checkProfessionalTitleDisjoint({ professionalTitle: "Senior" }, disciplines).ok,
      true,
    );
  });
  test("ignores literal Level when tokenising", () => {
    const ds = [{ id: "swe", roleTitle: "Software Engineer Level" }];
    assert.equal(
      checkProfessionalTitleDisjoint({ professionalTitle: "Level I" }, ds).ok,
      true,
    );
  });
});

describe("checkAutonomyExpectation", () => {
  for (const ok of ["Work independently", "Lead the team", "Define a strategy",
                    "Build resilient systems", "", null]) {
    test(`accepts ${JSON.stringify(ok)}`, () =>
      assert.equal(checkAutonomyExpectation(ok).ok, true));
  }
  for (const bad of ["Works independently", "Owns the roadmap", "Drives outcomes",
                     "Leads the team", "Is responsible for"]) {
    test(`rejects ${JSON.stringify(bad)}`, () =>
      assert.equal(checkAutonomyExpectation(bad).ok, false));
  }
});

test("CONTRACT_URL points at the canonical anchor", () => {
  assert.equal(
    CONTRACT_URL,
    "https://www.forwardimpact.team/docs/products/authoring-standards/index.md#level-field-conventions",
  );
});
```

`validation-all-data.test.js` exercises the orchestrator. The fixture
helper below builds the minimum input that satisfies the pre-existing
required-field checks so the new K3/K5 errors are the only ones emitted:

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateAllData } from "../src/validation.js";
import { CONTRACT_URL } from "../src/validation/level.js";

function makeData(overrides = {}) {
  const baseLevel = {
    id: "J060",
    professionalTitle: "Level II",
    managementTitle: "Manager",
    ordinalRank: 2,
    baseSkillProficiencies: { core: "working", supporting: "foundational", broad: "awareness" },
    baseBehaviourMaturity: "developing",
    expectations: { autonomyExpectation: "Work independently on familiar problems" },
  };
  return {
    drivers: [{ id: "delivery", name: "Delivery" }],
    behaviours: [{ id: "ownership", name: "Ownership" }],
    skills: [{ id: "coding", name: "Coding", capability: "delivery" }],
    disciplines: [{
      id: "software_engineering",
      roleTitle: "Software Engineer",
      coreSkills: ["coding"],
      supportingSkills: [],
      broadSkills: [],
    }],
    tracks: [],
    levels: [{ ...baseLevel, ...(overrides.level || {}) }],
    capabilities: [{ id: "delivery", name: "Delivery" }],
    ...overrides.top,
  };
}

describe("validateAllData K3/K5", () => {
  test("compliant input emits zero K3/K5 errors", () => {
    const result = validateAllData(makeData());
    const contractErrors = result.errors.filter((e) =>
      e.path?.endsWith(".professionalTitle") || e.path?.endsWith(".autonomyExpectation"));
    assert.deepEqual(contractErrors, []);
  });

  test("non-disjoint professionalTitle emits one INVALID_VALUE", () => {
    const result = validateAllData(makeData({ level: { professionalTitle: "Engineer" } }));
    const matches = result.errors.filter((e) =>
      e.type === "INVALID_VALUE" && e.path === "levels[0].professionalTitle");
    assert.equal(matches.length, 1);
    assert.ok(matches[0].message.includes(CONTRACT_URL));
  });

  test("shape-violating professionalTitle is rejected", () => {
    // "Senior Manager" fails the shape regex (two words) but is token-disjoint
    // from the `Software Engineer` discipline, so only the shape predicate
    // emits an error — keeps the assertion count deterministic.
    const result = validateAllData(makeData({ level: { professionalTitle: "Senior Manager" } }));
    const matches = result.errors.filter((e) =>
      e.type === "INVALID_VALUE" && e.path === "levels[0].professionalTitle");
    assert.equal(matches.length, 1);
    assert.match(matches[0].message, /single capitalised rank word/);
  });

  test("multi-failure professionalTitle emits one error per failed predicate", () => {
    // "Senior Engineer" fails BOTH predicates: shape (two words) AND disjoint
    // (token "engineer" overlaps the discipline `Software Engineer`).
    // The orchestrator loop in validation.js calls predicates independently
    // and emits an error per failure, so both errors land on the same path.
    const result = validateAllData(makeData({ level: { professionalTitle: "Senior Engineer" } }));
    const matches = result.errors.filter((e) =>
      e.type === "INVALID_VALUE" && e.path === "levels[0].professionalTitle");
    assert.equal(matches.length, 2);
  });

  test("third-person autonomyExpectation is rejected", () => {
    const result = validateAllData(makeData({
      level: { expectations: { autonomyExpectation: "Works independently" } },
    }));
    const matches = result.errors.filter((e) =>
      e.type === "INVALID_VALUE" && e.path === "levels[0].expectations.autonomyExpectation");
    assert.equal(matches.length, 1);
    assert.ok(matches[0].message.includes(CONTRACT_URL));
  });
});
```

`contract.test.js`:

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ContractViolationError, throwIfErrors } from "../src/contract.js";

describe("throwIfErrors", () => {
  test("no-op when result has no errors", () => {
    throwIfErrors({ errors: [] },
      { ruleCodes: ["INVALID_VALUE"], paths: [/\.professionalTitle$/] });
  });

  test("no-op when no error matches the filter", () => {
    throwIfErrors(
      { errors: [{ type: "MISSING_REQUIRED", path: "levels[0].id" }] },
      { ruleCodes: ["INVALID_VALUE"], paths: [/\.professionalTitle$/] },
    );
  });

  test("throws ContractViolationError for the first matching error", () => {
    let caught = null;
    try {
      throwIfErrors(
        {
          errors: [
            {
              type: "INVALID_VALUE",
              path: "levels[0].professionalTitle",
              value: "Engineer",
              message: 'professionalTitle "Engineer" shares token "engineer"…',
            },
          ],
        },
        {
          ruleCodes: ["INVALID_VALUE"],
          paths: [/\.professionalTitle$/, /\.autonomyExpectation$/],
        },
      );
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof ContractViolationError);
    assert.equal(caught.field, "levels[0].professionalTitle");
    assert.equal(caught.value, "Engineer");
    assert.equal(
      caught.contractUrl,
      "https://www.forwardimpact.team/docs/products/authoring-standards/index.md#level-field-conventions",
    );
  });
});
```

`loader-validate.test.js` uses the same `mockFs` / `mockParser` shape as
`data-loader.test.js:85–189`. The compliant fixture inlines the minimum
1-level / 1-discipline / 1-capability tree; the non-compliant fixture
flips `professionalTitle` to `"Engineer"`:

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DataLoader } from "../src/loader.js";
import { ContractViolationError } from "../src/contract.js";

function makeMocks(levels) {
  const entities = {
    "drivers.yaml": [{ id: "delivery", name: "Delivery" }],
    "behaviours/ownership.yaml": { name: "Ownership", human: {} },
    "disciplines/software_engineering.yaml": {
      roleTitle: "Software Engineer",
      coreSkills: ["coding"], supportingSkills: [], broadSkills: [],
      isProfessional: true, isManagement: false, human: {},
    },
    "tracks/.empty": {},
    "capabilities/delivery.yaml": { name: "Delivery", skills: [
      { id: "coding", name: "Coding", human: { description: "", proficiencyDescriptions: {} } },
    ] },
    "levels.yaml": levels,
    "standard.yaml": { name: "Test" },
  };
  return {
    fs: {
      stat: async () => ({}),
      readdir: async (path) => {
        if (path.endsWith("disciplines")) return ["software_engineering.yaml"];
        if (path.endsWith("behaviours")) return ["ownership.yaml"];
        if (path.endsWith("tracks")) return [];
        if (path.endsWith("capabilities")) return ["delivery.yaml"];
        return [];
      },
      readFile: async (path) => {
        for (const [key, data] of Object.entries(entities)) {
          if (path.endsWith(key)) return JSON.stringify(data);
        }
        return "{}";
      },
    },
    parser: { parseYaml: (s) => JSON.parse(s) },
  };
}

const compliantLevels = [{
  id: "J060",
  professionalTitle: "Level II",
  managementTitle: "Manager",
  ordinalRank: 2,
  baseSkillProficiencies: { core: "working", supporting: "foundational", broad: "awareness" },
  baseBehaviourMaturity: "developing",
  expectations: { autonomyExpectation: "Work independently" },
}];

describe("DataLoader.loadAndValidate", () => {
  test("compliant data resolves with the loaded object", async () => {
    const { fs, parser } = makeMocks(compliantLevels);
    const loader = new DataLoader(fs, parser);
    const data = await loader.loadAndValidate("/data");
    assert.equal(data.levels[0].id, "J060");
  });

  test("non-compliant professionalTitle rejects with ContractViolationError", async () => {
    const { fs, parser } = makeMocks([{ ...compliantLevels[0], professionalTitle: "Engineer" }]);
    const loader = new DataLoader(fs, parser);
    let caught = null;
    try { await loader.loadAndValidate("/data"); } catch (err) { caught = err; }
    assert.ok(caught instanceof ContractViolationError);
    assert.equal(caught.field, "levels[0].professionalTitle");
  });
});
```

`prompts-pathway-level.test.js`:

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildLevelPrompt } from "../src/prompts/pathway/level.js";

describe("buildLevelPrompt", () => {
  const ctx = { domain: "test", industry: "test", standardName: "Test" };
  const schema = {};
  const levels = [{ id: "J040", rank: 1, experience: "0-2 years",
                    professionalTitle: "Associate" }];
  const { user } = buildLevelPrompt(levels, ctx, schema);

  test("instructs single capitalised rank for professionalTitle", () => {
    assert.match(user, /single capitalised rank word/);
    assert.match(user, /NEVER emit a multi-word role-complete title/);
  });

  test("instructs base-form verb opener for autonomyExpectation", () => {
    assert.match(user, /open with a base-form verb/);
    assert.match(user, /Never start with a third-person form/);
  });
});
```

Extension to `products/pathway/test/build-packs.test.js` — render-parity
against the starter, satisfying spec criterion 5. The existing
`describe("generatePacks", …)` block declares only `workDir`, `outputDir`,
and `validCombinations` in outer scope at lines 88–90; the starter `data`
is loaded as a `before()`-local `const` (line 98) and is therefore **not**
reachable from new `test()` bodies in the same block. Two-part fix:

1. Hoist `data` to outer scope alongside the other `let` declarations
   (line 88–90), and convert the `before()` assignment from `const data =`
   to plain `data = `.
2. Add the new test after the existing "valid combinations" test. Use a
   static `import { generateJobTitle } from "@forwardimpact/libskill"` at
   the top of the file (next to the existing `libskill/agent` import on
   line 19) — `libskill` is already a workspace dep of pathway, so the
   static import surfaces a missing-dep failure at file parse time rather
   than test-execution time.

```diff
 describe("generatePacks", () => {
   let workDir;
   let outputDir;
   let validCombinations;
+  let data;

   before(async () => {
     workDir = mkdtempSync(join(tmpdir(), "fit-pathway-packs-test-"));
     outputDir = join(workDir, "public");
     await mkdir(outputDir, { recursive: true });

     const loader = createDataLoader();
-    const data = await loader.loadAllData(starterDir);
+    data = await loader.loadAllData(starterDir);
     const agentData = await loader.loadAgentData(starterDir);
```

New test body:

```js
test("starter renders software_engineering × J060 without duplicated role token or broken autonomy", () => {
  const swDiscipline = data.disciplines.find((d) => d.id === "software_engineering");
  const j060 = data.levels.find((l) => l.id === "J060");
  assert.ok(swDiscipline && j060, "starter must contain software_engineering + J060");

  // Job title from libskill must contain the role title exactly once:
  const title = generateJobTitle({ discipline: swDiscipline, level: j060 });
  const occurrences = title.split("Software Engineer").length - 1;
  assert.equal(occurrences, 1, `expected one role-title occurrence in ${JSON.stringify(title)}`);

  // Composed autonomy sentence must not exhibit the "You will works" pattern:
  const autonomy = j060.expectations.autonomyExpectation;
  const sentence = `You will ${autonomy.toLowerCase()}`;
  assert.doesNotMatch(sentence, /You will (works|owns|drives|leads|defines)/i, "no broken verb agreement");
});
```

`@forwardimpact/libskill` is already listed under
`products/pathway/package.json`'s `dependencies`, so the static
`generateJobTitle` import resolves at file-parse time with no manifest
change needed.

Verification: run `bun run test`; all six files green. `bunx fit-map
validate products/map/starter/` continues to pass (manual smoke).

## Risks

- **Browser-bundle `fs/promises` hazard.** The original draft of this plan
  imported `throwIfErrors` from `@forwardimpact/map/loader`, which would
  have pulled `fs/promises` into the pathway browser bundles. Step 3
  hoists `ContractViolationError` and `throwIfErrors` into a separate
  `contract.js` with **no Node-only imports**. Step 6 imports
  exclusively from `@forwardimpact/map/contract` and
  `@forwardimpact/map/validation` — both transitively pure JS. Verify by
  running `bunx fit-pathway build --data=products/map/starter` against
  the branch before pushing; the bundler stage will surface any remaining
  Node-only import.

- **`additionalProperties: false` on the level schema** (`levels.schema.json`
  line 104) means future schema additions to express the contract via
  `pattern` would break the data migration window. The plan deliberately
  uses only `description` (Step 10) so this constraint stays inert.

- **DSL ladder reshuffle is observable downstream.** Cached prose under any
  `data/synthetic/cache/` keyed on the old titles (`Lead Engineer`, etc.)
  becomes stale. Anyone consuming BioNova-derived corpora
  (`kata-interview`, `fit-benchmark` fixtures) needs to regenerate.
  Mitigation: K9 regen is fast (pathway-only); call it out in the PR body.

- **K5 false positives** for rare base-form imperatives ending in lowercase
  `s` after a non-`s` letter (`Focus`, `Bias`, `Process`, `Address`). None
  appear in the starter or in the new DSL tokens. If one is added later,
  the contract document carries the English rule; the predicate lives
  behind a single export and can grow an allow-list head without touching
  call sites.

- **PR #878 (bugs 2/3) is closed-no-merge.** This plan's land order is
  independent — touched surfaces are disjoint (subtitle interpolation and
  `impactScope` sentence are not under the predicate gate). No
  cross-coordination needed.

## Execution

Single trusted engineering agent runs Steps 1 → 12 sequentially in one
feature branch + PR. No parallelism: every step after Step 1 reads symbols
introduced by the prior step. The `technical-writer` agent is not
separately required — Step 11 is a single section addition with code-block
content; the staff engineer can author it without handoff. The
implementing agent should:

1. Run `bun run test` after Steps 1–2 to confirm the predicates and
   orchestrator pass before wiring callers.
2. Run `bun run test` after Steps 3–6 to confirm the render gate surfaces
   correctly and existing render tests still pass on the starter.
3. Run `bunx fit-pathway build --data=products/map/starter --output
   /tmp/pathway-build` after Step 6 to confirm the browser bundle builds
   without pulling Node-only modules from `loader.js` (the CLI flag is
   `--data=<path>`, declared at `bin/fit-pathway.js:202`).
4. Run `bun run check` after Step 11 to confirm doc link checking and
   `context:fix` are clean.
5. Manually run `bunx fit-map validate products/map/starter/` and
   `bunx fit-pathway job software_engineering J060
   --data=products/map/starter` to confirm both surfaces succeed
   end-to-end on the starter.
6. Document the K9 BioNova parity check (LLM regen + `fit-pathway job`)
   in the PR body under `## BioNova parity`, per Step 9.

— Staff Engineer 🛠️
