# Plan 2000-a: Hosted transform path runs the artifact-driven evidence producer

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Add the two missing hosted collaborators bottom-up: a minimal Deno runtime/clock
and a deploy-bundled standard-data loader, then thread them into the three
clock-touching Edge Function handlers (`transform` also gets `mapData`). The
orchestrator's producer result gains an additive
`producerRan`/`missingCollaborator` discriminator so skipped is distinguishable
from empty. A new CLI subcommand generates the bundle from the existing loader.
A first hosted test harness drives each handler module against a fake Supabase
and fixture bundle.

Libraries used: none.

## Steps

### 1. Minimal hosted runtime

Construct the Deno-side clock the transforms dereference.

- Created: `products/map/supabase/functions/_shared/runtime.ts`

```ts
export function createHostedRuntime() {
  return Object.freeze({ clock: Object.freeze({ now: () => Date.now() }) });
}
```

Verify: a Node-runner test asserts `createHostedRuntime().clock.now()` returns a
number and the bag is frozen.

### 2. Standard-data bundle loader

Read the deploy-bundled standard data through an injectable reader so the loader
runs under both Deno and the Node test runner; return a typed skip when absent
or malformed.

- Created: `products/map/supabase/functions/_shared/activity/map-data.js` (the
  `.js` variant per the risk note below — the `.ts` import did not resolve under
  the Node test runner)

```ts
/** @typedef {"bundle_absent" | "bundle_malformed"} SkipReason */
const denoReader = (url) => Deno.readTextFile(url);

export async function loadHostedMapData(readBundle = denoReader) {
  const url = new URL("./standard-data.json", import.meta.url);
  let text;
  try {
    text = await readBundle(url);
  } catch {
    return { skipped: true, reason: "bundle_absent" };
  }
  try {
    return { mapData: JSON.parse(text) };
  } catch {
    return { skipped: true, reason: "bundle_malformed" };
  }
}
```

The default reader uses the `Deno` global; tests pass their own `readBundle`, so
importing this module never touches `Deno` at load time.

Verify: with a reader returning valid JSON → `{ mapData }`; a throwing reader →
`{ skipped, reason: "bundle_absent" }`; invalid JSON → `bundle_malformed`.

### 3. Additive producer discriminator in the orchestrator

Make skipped distinguishable from empty at the orchestrator boundary. Edit the
source of truth, not the `_shared` shim.

- Modified: `products/map/src/activity/transform/index.js`

```js
let evidenceArtifact;
if (mapData) {
  const result = await transformEvidenceArtifact(supabase, { mapData });
  evidenceArtifact = { ...result, producerRan: true };
} else {
  evidenceArtifact = {
    inserted: 0,
    skipped: 0,
    errors: [],
    producerRan: false,
    missingCollaborator: "mapData",
  };
}
```

Verify: existing `products/map` transform tests still pass (CLI reads only the
retained count fields); a new orchestrator test asserts `producerRan` true with
`mapData` and false (with `missingCollaborator`) without.

### 4. Extract testable handlers and thread collaborators

Each function's full logic (extract where present, then transform) moves into a
sibling `.js` `handler.js`. The runtime threads into **both** phases —
`extractPeopleFile`/`extractGetDX` read `runtime.clock` too
(`src/activity/extract/people.js:19`, `src/activity/extract/getdx.js:76`), so a
transform-only thread would leave the extract clock read throwing. The `.ts`
`index.ts` becomes a thin wrapper: it builds the Deno-only collaborators
(`createSupabaseClient` from `../_shared/supabase.ts`, which is the
esm.sh-backed client; `createHostedRuntime`), reads `Deno.env` config, calls the
handler, and maps the returned body to an HTTP status — preserving each
function's current response shape and `ok ? 200 : 500` mapping. `handler.js`
carries no `Deno`/esm.sh import, so the Node test runner imports it cleanly. The
old collaborator-less extract/transform calls are **replaced**, not duplicated.

- Created: `products/map/supabase/functions/transform/handler.js`

  ```js
  export async function handleTransform(supabase, runtime, loadMapData) {
    const md = await loadMapData();
    const result = await transformAll(
      supabase, runtime, md.mapData ? { mapData: md.mapData } : {},
    );
    const ea = result.evidenceArtifact;
    const ok = result.people.errors.length === 0 &&
      result.getdx.errors.length === 0 &&
      result.github.errors.length === 0;
    return {
      ok,
      ...result,
      evidenceArtifact: md.skipped ? { ...ea, skipReason: md.reason } : ea,
    };
  }
  ```

  Imports only `transformAll` (shim), nothing Deno-specific. `ok` keeps the
  current people/getdx/github-only computation, leaving the existing 200/500
  contract unchanged (criterion 5); the skip `reason` rides the response
  (criterion 4: names *why*).
- Created: `products/map/supabase/functions/people-upload/handler.js` exporting
  `handlePeopleUpload(supabase, runtime, body, format)`: calls
  `extractPeopleFile(supabase, body, format, runtime)` (now with runtime); on
  `!stored` returns `{ ok: false, stored: false, error }`; else
  `transformPeople(supabase, runtime)` and returns
  `{ ok: errors.length === 0, stored: true, path, imported, errors }` — the
  current response shape, unchanged.
- Created: `products/map/supabase/functions/getdx-sync/handler.js` exporting
  `handleGetDXSync(supabase, runtime, config)`: calls
  `extractGetDX(supabase, config, runtime)` then
  `transformAllGetDX(supabase, runtime)`, returns
  `{ ok, extract: { files, errors }, transform }` — current shape. `config`
  (`{ apiToken, baseUrl }`) is read from `Deno.env` by the wrapper.
- Modified: each `index.ts` becomes the `Deno.serve` wrapper. `transform` gains
  a `respond(body)` helper returning a `Response` with
  `status: body.ok ? 200 : 500` (matching the other two), and calls
  `respond(await handleTransform(createSupabaseClient(), createHostedRuntime(), loadHostedMapData))`.
  `people-upload` keeps its 405 method guard + body read, then calls
  `handlePeopleUpload`. `getdx-sync` keeps its `Deno.env` reads + the
  missing-`GETDX_API_TOKEN` 500 guard, then calls `handleGetDXSync`. Each
  wrapper maps `body.ok` to `200/500`.
- `github-webhook/index.ts` is unchanged (takes neither collaborator).

Verify: step-6 tests import the `handler.js` functions and drive them with the
hand-rolled fake (full orchestrator storage/table surface, step 6) +
`createHostedRuntime()` + an injected `loadMapData`; no runtime TypeError on
either extract or transform; the `transform` response carries `producerRan` and,
on skip, `skipReason`.

### 5. Bundle generator subcommand

Generate the deploy bundle from the live loader.

- Modified: `products/map/bin/fit-map.js`
  - Register the target in the `activity` command's `args` string
    (`<start|stop|status|migrate|transform|verify|seed|bundle-standard-data>`)
    and add an `options: { out: { type: "string" } }` block to the command
    definition so `values.out` is populated (the command has no `options` block
    today).
  - Add a `case "bundle-standard-data"` to the `dispatchActivity` switch:

```js
case "bundle-standard-data": {
  const dataDir = await findDataDir(values.data, runtime);
  const { createDataLoader } = await import("../src/index.js");
  const mapData = await createDataLoader(runtime).loadAllData(dataDir);
  const defaultOut = fileURLToPath(new URL(
    "../supabase/functions/_shared/activity/standard-data.json",
    import.meta.url));
  await runtime.fs.writeFile(values.out ?? defaultOut,
    JSON.stringify(mapData, null, 2));
  return 0;
}
```

The default path resolves relative to the module (`import.meta.url`), not cwd,
so it lands at the design's target from any install dir. Add an
`import { fileURLToPath } from "node:url";` to `bin/fit-map.js` (it imports only
from `"path"`/`"os"` today).

Verify: running `fit-map activity bundle-standard-data --out <tmp>` against the
starter data writes a JSON file whose parsed shape has
`disciplines`/`levels`/`tracks`/`skills`/`capabilities`.

### 6. Hosted test harness

Stand up the first Edge Function handler tests (spec § success criteria 1–4),
driving the exported `handle` functions — not the shared transform — so the
hosted entry point itself is exercised.

Tests use a hand-rolled fake Supabase client, following
`test/activity/transform-evidence-artifact.test.js` — `createMockSupabaseClient`
does not model the producer's chains. Because the handlers drive the **full
orchestrator** (people → getdx → github → producer → evidence), the fake must
model the whole surface those transforms touch, not just the producer's:

- `storage.from("raw").list(prefix, …)` → returns `[]` for the people/getdx/
  github prefixes so those transforms no-op cleanly (no fixtures needed for the
  producer-focused tests); `storage.from("raw").download(path)` for any seeded
  file.
- `from("github_artifacts").select(…).not(…)` returning the seeded joined rows;
  `from("evidence").delete().eq(…)` and `.upsert(rows, opts)` recording
  payloads; the
  `github_events`/`github_artifacts`/`getdx_snapshots`/`organization_people`
  reads/writes the other transforms make (all returning empty/`null` so they
  no-op).

The fake records `evidence.upsert` payloads for row assertions. Build it once as
a test helper shared across the hosted tests.

- Created: `products/map/test/activity/hosted/transform.test.js` — imports
  `handleTransform` from `transform/handler.js`, drives it with the fake (raw
  storage empty, `github_artifacts` join seeded) and a fixture `mapData` via an
  injected `loadMapData`:
  - criterion 1: `producerRan === true`, non-zero `evidenceArtifact.inserted`,
    and the upserted `evidence` rows carry the `artifact_interpreted` provenance
    tier (the same per-provenance signal `fit-landmark coverage` reads — that
    downstream CLI is out of this product's test scope, so criterion 1's
    coverage-tier half is verified on the produced rows' `provenance`).
  - criterion 2: a parallel `transformAll(supabase, runtime, { mapData })` over
    the same seeded fake yields identical `evidence.upsert` rows (artifact,
    marker, provenance); the test compares the two surfaces' payloads, not
    counts.
  - criterion 4: `handleTransform` with `loadMapData` returning
    `{ skipped, reason }` yields `producerRan === false`, `missingCollaborator`,
    `skipReason`.
- Created: `products/map/test/activity/hosted/people-upload.test.js` — drives
  `handlePeopleUpload` with the fake + `createHostedRuntime()` through the full
  extract→transform round-trip (criterion 3's named live failure is the
  `extractPeopleFile` clock read at `src/activity/extract/people.js:19`),
  asserting no throw and a populated `path`/`imported`.
- Created: `products/map/test/activity/hosted/getdx-sync.test.js` —
  `extractGetDX` calls the global `fetch` (no injection seam,
  `src/activity/extract/getdx.js:113`), so the test stubs `globalThis.fetch`
  (restored in a `finally`) to return canned GetDX payloads. It asserts the
  extract clock read (line 76, reached before any fetch) and the
  `transformAllGetDX` snapshot-comment clock path complete without throwing
  (criterion 3), seeding a snapshot-comments file in the fake's storage.
- Created: `products/map/test/activity/hosted/map-data.test.js` — unit-tests
  `loadHostedMapData` via its `readBundle` parameter (step 2), never the `Deno`
  global.

The `handler.js` modules carry no `Deno`/esm.sh imports, so the Node runner
imports them cleanly; the `.ts` wrappers (with `Deno.serve`) are not imported by
any test.

Verify: the repository's check and test commands pass; criteria 1–4 covered by
these tests, criterion 5 by step 3's unchanged-CLI-tests assertion.

## Risks

- **Deno globals / esm.sh under the Node test runner.** The `.ts` wrappers
  reference the `Deno` global and import the supabase client from an esm.sh URL,
  neither resolvable under the repository's Node-based runner. The split removes
  the hazard: tests import only the `handler.js`/`map-data.ts` logic modules,
  which carry no `Deno` or esm.sh import; `loadHostedMapData` takes a
  `readBundle` seam (step 2). `map-data.ts` is plain TS with no Deno-only
  import; `bun test` transpiles `.ts` on import, but no `.js` test in this
  product imports a `.ts` module today — if the import does not resolve, move
  the loader to `map-data.js` and let a `.ts` shim re-export it (the handlers
  already follow this `.js`-logic / `.ts`-wrapper split).
- **`extractGetDX` calls the global `fetch`.** It has no injection seam
  (`src/activity/extract/getdx.js:113`), so the getdx-sync handler test must
  stub `globalThis.fetch` and restore it; otherwise the test hits the network.
- **Fake breadth.** The handlers drive the full orchestrator, so the hosted
  fake must model the storage list/download and the github/getdx/people table
  ops, not just the producer's chains (step 6 enumerates them); a narrower fake
  throws before reaching the assertions.
- **Bundle path resolution** differs between the deploy layout and the test
  fixture; resolve via `import.meta.url` in product code and an injected reader
  / fixture `mapData` in tests.

## Execution

Single engineering agent, steps in order. Steps 1, 2, and 5 are mutually
independent. Step 4 depends on steps 1, 2, and 3 (the handlers import
`createHostedRuntime` and `loadHostedMapData`, and `transform`'s handler
consumes the new producer result shape). Step 6 depends on steps 1, 2, 3, and 4.
Step 5 produces the deploy bundle but does not feed the test fixtures — step 6
injects its own `mapData`.

— Staff Engineer 🛠️
