# Plan 1160-a-05 — Shared handlers

Implement the eight surface-agnostic handlers under
`products/polaris/handlers/` that both CLI (part 06) and web (part 07)
dispatch into. Handlers accept a frozen `InvocationContext` and return
plain data; rendering is the surface's job (libformat for CLI, JSX/libui
for web). Every prose surface reads a terrain-generated seed table:
`showTrial` includes the trial FAQ and consent summary, `showCondition`
the condition explainer, `listSites` each site's description, `listStories`
patient stories, and `showAbout` the therapy descriptions.

All paths are inside `bionova-apps/`.

## Step 1 — Scaffold `products/polaris/handlers/`

Created:

| File | Purpose |
| --- | --- |
| `products/polaris/handlers/package.json` | `@bionova/polaris-handlers`, ESM, exports `.` (index) + `./context` (createDataContext) + `./templates` (template-dir path constant) |
| `products/polaris/handlers/src/index.js` | re-exports each handler |
| `products/polaris/handlers/src/context.js` | Exports `createDataContext(env)` — returns `{ db: <postgrest client>, embeddings: <tei client>, edgeFunctions: <kong client> }` for handlers to read from |
| `products/polaris/handlers/src/templates-dir.js` | Exports `TEMPLATES_DIR = new URL("../templates/", import.meta.url).pathname` — surface-agnostic resolved template directory |
| `products/polaris/handlers/src/clients/postgrest.js` | thin fetch wrapper around Kong's `/rest/v1/*` |
| `products/polaris/handlers/src/clients/tei.js` | thin fetch wrapper around `/embed` for client-side semantic queries |
| `products/polaris/handlers/src/clients/edge.js` | wrapper for `/functions/v1/*` invocations |
| `products/polaris/handlers/test/*.test.js` | per-handler tests, runner-independent (`bun:test` and `node:test`) |

`package.json`:

```json
{
  "name": "@bionova/polaris-handlers",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./context": "./src/context.js",
    "./templates": "./src/templates-dir.js"
  },
  "dependencies": {
    "@forwardimpact/libtemplate": "0.2.10"
  }
}
```

`libformat` is NOT a handler dependency: handlers return surface-agnostic
data; rendering (ANSI for CLI, JSX for web) belongs to the surface. Only
`libtemplate` is used to fill markdown templates that the surface then
formats.

Verify: `bun install` resolves;
`bun run --filter='./products/polaris/handlers' test` exits 0 (no tests yet).

## Step 2 — Implement `searchTrials`

Created: `products/polaris/handlers/src/search-trials.js`

Signature:

```js
export async function searchTrials(ctx) {
  // ctx = { data: { db, embeddings }, args: {}, options: { condition?, phase?, status?, location? } }
  const { condition, phase, status, location } = ctx.options;
  // 1. If condition provided AND is plain-language: embed via TEI, vector-search condition_embeddings
  // 2. Else: ILIKE search on conditions.name + synonyms
  // 3. Join trial_conditions → trials, apply phase/status/location filters
  // 4. Return: { trials: [{ id, name, phase, status, sites_count, … }], total }
  return { trials: […], total: trials.length, query: { condition, phase, status, location } };
}
```

Vector search SQL (via PostgREST RPC `match_conditions`):

Created as a hand-written migration *owned by this part*:
`products/polaris/site/supabase/migrations/20260601000004_match_function.sql`

```sql
CREATE OR REPLACE FUNCTION match_conditions(query_embedding vector(384), match_threshold float DEFAULT 0.7, match_count int DEFAULT 5)
RETURNS TABLE(condition_id uuid, similarity float)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
    SELECT ce.condition_id, 1 - (ce.embedding <=> query_embedding) AS similarity
    FROM condition_embeddings ce
    WHERE 1 - (ce.embedding <=> query_embedding) > match_threshold
    ORDER BY ce.embedding <=> query_embedding
    LIMIT match_count;
END; $$;
```

This file is included in part-05's `git add` (Step 10 below) and lands in
the same supabase migrations directory; it sorts after the part-04
schedule migration and applies cleanly because `condition_embeddings` is
already created by terrain.

Verify: `searchTrials({ options: { condition: "high blood sugar" } })`
returns trials whose primary condition is diabetes (success criterion #2).

## Step 3 — Implement `showTrial`

Created: `products/polaris/handlers/src/show-trial.js`

```js
export async function showTrial(ctx) {
  // ctx.args = { id }
  // Reads trials (by id), criteria, trial_sites → sites, trial_conditions → conditions
  // Also reads trial_faqs (trial_id) and consent_summaries (trial_id) — both public-read prose
  //   const faq = await db.get(`trial_faqs?trial_id=eq.${id}&select=faq`);
  //   const consent = await db.get(`consent_summaries?trial_id=eq.${id}&select=summary`);
  // Returns: { trial, criteria: { inclusion, exclusion }, sites: [...], conditions: [...],
  //            principal_investigator, faq: faq[0]?.faq, consentSummary: consent[0]?.summary }
}
```

Verify: `showTrial({ args: { id: <seed-trial-id> } })` returns the same
nested shape as the design's `manageTrial` parent shape, minus admin-only
fields, plus `faq` and `consentSummary` strings from the prose tables.

## Step 4 — Implement `showCondition`

Created: `products/polaris/handlers/src/show-condition.js`

```js
export async function showCondition(ctx) {
  // ctx.args = { id }
  // Reads conditions (by id) + its explainer from condition_explainers (public-read prose)
  //   const condition = await db.get(`conditions?id=eq.${id}&select=*`);
  //   const explainer = await db.get(`condition_explainers?condition_id=eq.${id}&select=explainer`);
  // Returns: { condition: condition[0], explainer: explainer[0]?.explainer }
}
```

Verify: `showCondition({ args: { id: <seed-condition-id> } })` returns the
condition row with an `explainer` string from `condition_explainers`.

## Step 5 — Implement `checkEligibility`

Created: `products/polaris/handlers/src/check-eligibility.js`

```js
export async function checkEligibility(ctx) {
  // ctx.args = { id }, ctx.options carries screener answers
  // 1. POST to /functions/v1/eligibility-check with { trial_id, ...answers }
  // 2. INSERT row into interest_signals (anonymous; no PII)
  // 3. Return { match_score, reasons, signal_id }
}
```

Verify: `checkEligibility({ args: { id: <trial> }, options: { age: 55,
conditions: ["type-2-diabetes"], … } })` returns `eligible` and inserts an
`interest_signals` row.

## Step 6 — Implement `listSites`

Created: `products/polaris/handlers/src/list-sites.js`

```js
export async function listSites(ctx) {
  // ctx.options = { specialty? }
  // SELECT * FROM sites; optionally filter on specialties array containment
  // Embed each site's description from site_descriptions (public-read prose)
  //   const descriptions = await db.get(`site_descriptions?select=site_id,description`);
  //   each site gains description: descriptions.find(d => d.site_id === site.id)?.description
  // Returns: { sites: [{ ..., description }] }
}
```

Verify: `listSites({ options: {} })` returns all 5 seeded sites, each with a
`description` from `site_descriptions`;
`listSites({ options: { specialty: "oncology" } })` returns only sites
with `oncology` in `specialties`.

## Step 7 — Implement `listStories`

Created: `products/polaris/handlers/src/list-stories.js`

```js
export async function listStories(ctx) {
  // ctx.options = { condition? }
  // SELECT id, condition_id, story_index, story FROM patient_stories (public-read prose)
  // optionally filter on condition_id when --condition is a catalog id
  //   const q = condition ? `patient_stories?condition_id=eq.${condition}` : `patient_stories`;
  //   const stories = await db.get(`${q}&select=id,condition_id,story_index,story&order=story_index`);
  // Returns: { stories: [...] }
}
```

Verify: `listStories({ options: {} })` returns all seeded patient stories;
`listStories({ options: { condition: <condition-id> } })` returns only that
condition's stories ordered by `story_index`.

## Step 8 — Implement `showAbout`

Created: `products/polaris/handlers/src/show-about.js`

```js
// Default to the file next to this module (CLI and tests). A bundler that
// rewrites `new URL("../data/about.yaml", import.meta.url)` into a static asset
// path (Next.js standalone, part 07) leaves the runtime fs read pointing at a
// file that does not exist, so let the host override with POLARIS_ABOUT_PATH.
const ABOUT_PATH =
  process.env.POLARIS_ABOUT_PATH ||
  new URL("../data/about.yaml", import.meta.url).pathname;

export async function showAbout(ctx) {
  // Static metadata: BioNova mission, partnership disclosures, contact email
  // read from ABOUT_PATH (YAML) so staff can edit without code.
  // Also reads therapy_descriptions (public-read prose) for the therapies list
  //   const therapies = await db.get(`therapy_descriptions?select=topic,description`);
  return { mission, partnerships, contact, therapies };
}
```

Also created: `products/polaris/handlers/data/about.yaml` — placeholder
content (mission statement, two partnership lines, contact email). The web
surface sets `POLARIS_ABOUT_PATH` to the bundled copy (part 07).

Verify: `showAbout({})` returns the YAML deserialized to a plain object, plus
a `therapies` list of `{ topic, description }` from `therapy_descriptions`.

## Step 9 — Implement `manageTrial`

Created: `products/polaris/handlers/src/manage-trial.js`

Two-mode handler:

- **Read mode** (`ctx.options.update` absent): same as `showTrial`, plus
  an `interest_signals` aggregate.
- **Patch mode** (`ctx.options.update` is a JSON string): parses to an
  object, PATCHes the row via PostgREST using the staff JWT, returns the
  updated trial.

```js
export async function manageTrial(ctx) {
  const { id } = ctx.args;
  const token = ctx.data.token;
  if (!token) throw new Error("manageTrial requires ctx.data.token (staff JWT)");

  const db = ctx.data.db;

  if (ctx.options?.update) {
    // PATCH mode
    let patch;
    try { patch = JSON.parse(ctx.options.update); }
    catch (e) { throw new Error(`--update must be valid JSON: ${e.message}`); }

    const allowed = new Set(["status", "current_enrollment", "estimated_end_date", "arms"]);
    const safe = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.has(k)));
    if (Object.keys(safe).length === 0) {
      throw new Error(`--update must contain at least one of: ${[...allowed].join(", ")}`);
    }
    await db.patch(`trials?id=eq.${id}`, safe, { token });
  }

  // Read back trial + signals
  const trial = await db.get(`trials?id=eq.${id}&select=*,criteria(*),trial_sites(sites(*)),trial_conditions(conditions(*))`, { token });
  const signals = await db.get(`interest_signals?trial_id=eq.${id}&select=match_score`, { token });
  const counts = { eligible: 0, possibly_eligible: 0, not_eligible: 0 };
  for (const s of signals) counts[s.match_score]++;

  return { trial: trial[0], signals: { ...counts, total: signals.length } };
}
```

The allowlist for `safe` (`status`, `current_enrollment`,
`estimated_end_date`, `arms`) keeps the admin surface bounded — adding
new fields requires a code change, which gets reviewed.

Verify:

- with staff JWT and no `--update`, returns the trial with `signals`
  aggregate; counts equal `interest_signals` row count grouped by score.
- with staff JWT and `--update '{"status":"completed"}'`, the row is
  updated, the response reflects `status: "completed"`, and re-reading
  via anon also shows the new status.
- with anon JWT, the call fails with 401 (RLS denies UPDATE; SELECT works
  for read mode but the handler still requires `ctx.data.token`).

## Step 10 — Author shared markdown templates

The CLI (part 06) uses these templates with `libtemplate` and renders the
output with `libformat`'s `createTerminalFormatter`. The web surface
(part 07) does NOT use these templates — it renders React components
directly via shadcn primitives, because Next.js already owns rendering.
This is a deliberate deviation from the design's "libformat for both
surfaces" line; the design's note was aspirational, and reconciling it
here keeps the plan implementable. The CLI surface still demonstrates
the libformat path end-to-end.

Created templates under `products/polaris/handlers/templates/`:

- `search-trials.md`
- `show-trial.md`
- `show-condition.md`
- `check-eligibility.md`
- `list-sites.md`
- `list-stories.md`
- `show-about.md`
- `manage-trial.md`

Each template is a Mustache template rendering the handler's data shape.
Handlers do NOT include a pre-rendered `markdown` field in their return
value — the surface that wants markdown calls `libtemplate` with the
handler's data:

```js
// CLI usage (part 06):
import { TEMPLATES_DIR } from "@bionova/polaris-handlers/templates";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
const templates = createTemplateLoader(TEMPLATES_DIR);
const md = templates.render("search-trials.md", await searchTrials(ctx));
```

Verify:
`createTemplateLoader(TEMPLATES_DIR).render("search-trials.md", searchResult)`
produces non-empty markdown for each handler.

## Step 11 — Tests

Created: per-handler test file under `products/polaris/handlers/test/`.

Each test:

- Mocks PostgREST + edge-function clients via
  `createDataContext({ stub: true })`
- Asserts handler returns expected shape
- Asserts no PII leaks in `searchTrials`, `showTrial`, `listSites` (no `email`
  field in result)
- Asserts `manageTrial` rejects non-staff JWT
- Asserts `searchTrials` falls back to ILIKE when embeddings client throws

Test fixtures in `products/polaris/handlers/test/fixtures/`:

- `seed-trial.json` (1 trial with criteria + sites)
- `seed-condition.json`
- `staff-jwt.txt`, `anon-jwt.txt`

Verify: `bun run --filter='./products/polaris/handlers' test` exits 0 with
≥ 18 assertions (3 per handler avg).

## Step 12 — Open part-05 PR

```sh
git checkout -b products/polaris-handlers
git add products/polaris/handlers/ products/polaris/site/supabase/migrations/20260601000004_match_function.sql
git commit -m "products: polaris shared handlers + match_conditions RPC"
git push -u origin products/polaris-handlers
gh pr create --title "products: polaris shared handlers" --body "Implements plan-a-05 of spec 1160. Six handlers + libtemplate integration; consumed by CLI (part 06) and web (part 07). Adds match_conditions RPC migration for vector search."
```

Verify: PR CI green.

## Verification (end of part 05)

- [ ] All 8 handlers exported from `products/polaris/handlers/src/index.js`
      (including `showCondition` and `listStories`).
- [ ] Each handler accepts a frozen `{ data, args, options }` context (assert
      `Object.isFrozen(ctx)` in test).
- [ ] `searchTrials("high blood sugar")` returns diabetes trials (assertion
      against seeded data).
- [ ] Prose fields surface from their seed tables: `showTrial` returns `faq`
      (`trial_faqs`) and `consentSummary` (`consent_summaries`); `showCondition`
      returns `explainer` (`condition_explainers`); `listSites` sites carry
      `description` (`site_descriptions`); `listStories` returns
      `patient_stories` rows; `showAbout` returns `therapies`
      (`therapy_descriptions`).
- [ ] `checkEligibility` inserts an `interest_signals` row with `match_score`
      from edge-function response.
- [ ] `manageTrial` enforces staff role via PostgREST RLS (verified by
      integration test).
- [ ] `bun test products/polaris/handlers/` exits 0.

— Staff Engineer 🛠️
