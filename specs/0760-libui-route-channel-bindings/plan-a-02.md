# Plan 0760-a-02 — Pathway adopts the new contract

Spec: [`spec.md`](spec.md). Design: [`design-a.md`](design-a.md). Overview:
[`plan-a.md`](plan-a.md). Depends on Part 01 (`plan-a-01.md`) being on `main`.

Migrates pathway onto the libui/libcli surfaces shipped in Part 01, deletes the
three displaced files, and seals the migration with a route-bindings parity
fixture. The new ESLint rule's scope expands to `products/pathway/**` in Step 11
only after the migration is complete — no commit on this branch breaks
`bun run lint`.

## Step 1 — Lift `setupRoutes()` into a route-pattern manifest

Pre-migration commit: extract the route patterns (~28 entries) from `main.js`'s
`setupRoutes()` into an exported constant so the fixture generator and the
post-migration replay test consume the same source of truth.

| Action   | Path                                         |
| -------- | -------------------------------------------- |
| Created  | `products/pathway/src/lib/route-manifest.js` |
| Modified | `products/pathway/src/main.js`               |

```js
// route-manifest.js — one row per setupRoutes() registration, in registration order.
// Three-segment patterns precede their two-segment counterparts so registration-order
// matching in createBoundRouter resolves the more specific pattern first (mirrors
// pre-migration main.js:118-119, 123-124, 128-129, 137-138).
export const ROUTE_MANIFEST = [
  { pattern: "/", representativeUrl: "/" },
  { pattern: "/skill", representativeUrl: "/skill" },
  { pattern: "/skill/:id", representativeUrl: "/skill/testing" },
  { pattern: "/behaviour", representativeUrl: "/behaviour" },
  { pattern: "/behaviour/:id", representativeUrl: "/behaviour/clarity-of-thought" },
  // ...one row per setupRoutes() entry — every router.on(...) call in main.js
  { pattern: "/job/:discipline/:level/:track", representativeUrl: "/job/engineering/senior/individual-contributor" },
  { pattern: "/job/:discipline/:level", representativeUrl: "/job/engineering/senior" },
  // ...interview, progress follow the same three-then-two ordering...
  { pattern: "/agent-builder", representativeUrl: "/agent-builder" },
  { pattern: "/agent/:discipline/:track", representativeUrl: "/agent/engineering/individual-contributor" },
  { pattern: "/agent/:discipline", representativeUrl: "/agent/engineering" },
];
```

`main.js`'s `setupRoutes()` is rewritten in Step 9 to iterate `ROUTE_MANIFEST`
and call `router.register(defineRoute(...))` for each row, with the descriptor's
`pattern` keyed off `row.pattern`.

**Concrete enumeration rule:** the manifest must contain exactly one row per
`router.on(...)` call in pre-migration `main.js:87-138` (every list view, every
detail view, every builder route, the agent forms, and `/`). The representative
URL is chosen so its CLI mapping is non-empty for routes that have a CLI binding
(per `lib/cli-command.js:12-116`'s match table) and is the no-args form for
builder routes.

**Verification:** `grep -c "router.on(" products/pathway/src/main.js`
(pre-migration) equals
`grep -c "pattern:" products/pathway/src/lib/route-manifest.js` after this
commit; the diff against `main.js` is purely import + iteration shape.

## Step 2 — Generate the pre-migration baseline fixture

| Action  | Path                                                          |
| ------- | ------------------------------------------------------------- |
| Created | `products/pathway/scripts/generate-route-bindings-fixture.js` |
| Created | `products/pathway/test/fixtures/route-bindings.json`          |

The generator imports `ROUTE_MANIFEST` from Step 1, the still-extant
`getCliCommand` from `src/lib/cli-command.js`, and the per-entity `*ToJsonLd`
functions from `src/formatters/json-ld.js`. For each manifest row it produces:

```js
{
  pattern,
  url: row.representativeUrl,
  cliCommand: getCliCommand(row.representativeUrl),  // string, possibly empty for routes today's table doesn't cover
  jsonLd: <result of the matching *ToJsonLd(...) for entity-detail routes; null elsewhere>,
}
```

`getCliCommand` returns `"npx fit-pathway"` (the bare command, no args) for
paths that do not match any rule (cli-command.js:129). Every pathway route
therefore has a non-empty CLI string today — there is no genuine "no CLI
binding" route in pathway. The descriptor's `cli` slot is **always set** in Step
9's `ROUTE_HANDLERS`: routes that today fall through to the bare fallback get
`cli: () => "npx fit-pathway"`; routes with specific mappings get the inline
arrow that reproduces `getCliCommand`'s output. The spec's "no CLI binding"
success criterion (line 335) is exercised by a synthetic test, not by any
pathway route — see Step 11's `route-bindings-parity.test.js`, which adds one
descriptor with `cli` deliberately omitted to drive the `createCommandBar`
empty-text path.

```sh
cd products/pathway && bun scripts/generate-route-bindings-fixture.js > test/fixtures/route-bindings.json
```

**Verification:** the fixture is generated and committed as the first commit on
the branch (so reviewers see it land before any migration commit); it contains
exactly `ROUTE_MANIFEST.length` entries; entries' `cliCommand` for
existing-mapping routes (e.g. `/skill/testing`) match `lib/cli-command.js`'s
output.

## Step 3 — Per-entity `graph` formatters and bodies carved out of `json-ld.js`

Splits today's `formatters/json-ld.js` into per-entity body builders (kept,
parametrised on `vocabularyBase`) and per-entity `graph` formatters (new;
`@id`-minting now done by libui's `createJsonLdScript`).

| Action   | Path                                         |
| -------- | -------------------------------------------- |
| Modified | `products/pathway/src/formatters/json-ld.js` |

Today's file contains both halves (json-ld.js:43-218); the per-entity body
builders also reference the module-level `VOCAB_BASE` constant inside their
returned payloads (e.g. `level: ${VOCAB_BASE}senior`, cross-references to other
entities). After this commit:

- Removed: `createJsonLdScript` (lines 15-20) and the `@id`-string construction
  inside each `*ToJsonLd` function (the `@id` assignment built inside
  `baseJsonLd`, lines 28-34, and any entity-specific `@id` logic).
- Replaced: the module-level `VOCAB_BASE` constant becomes a parameter threaded
  through each body builder. Every `*ToJsonLd` is renamed to `*Body` and gains a
  `vocabularyBase` argument used for any inner IRI:

  ```js
  // Before (line 43 today):
  // export function skillToJsonLd(skill, { capabilities } = {}) { ... uses VOCAB_BASE ... }
  // After:
  export function skillBody(skill, vocabularyBase, { capabilities } = {}) {
    return {
      "@context": vocabularyBase,
      "@type": "Skill",
      // every inner IRI uses `${vocabularyBase}…` instead of `${VOCAB_BASE}…`
      ...
    };
  }
  ```

  The `*Body` functions do **not** include `@id` — that key is added by
  `createJsonLdScript` from the matching `graph<Entity>` formatter.

- Added: per-entity `graph` formatters exported from the same file:

  ```js
  export const graphSkill = (ctx, vocabularyBase) => `${vocabularyBase}Skill/${ctx.args.id}`;
  export const graphDiscipline = (ctx, vocabularyBase) => `${vocabularyBase}Discipline/${ctx.args.id}`;
  export const graphTrack = (ctx, vocabularyBase) => `${vocabularyBase}Track/${ctx.args.id}`;
  export const graphLevel = (ctx, vocabularyBase) => `${vocabularyBase}Level/${ctx.args.id}`;
  export const graphDriver = (ctx, vocabularyBase) => `${vocabularyBase}Driver/${ctx.args.id}`;
  export const graphBehaviour = (ctx, vocabularyBase) => `${vocabularyBase}Behaviour/${ctx.args.id}`;
  // composite entities use the same shape pre-migration code uses for @id
  export const graphJob = (ctx, vocabularyBase) =>
    `${vocabularyBase}Job/${ctx.args.discipline}/${ctx.args.level}` +
    (ctx.args.track ? `/${ctx.args.track}` : "");
  // ...one per entity-detail route that today mints @id
  ```

  IRIs must match what the pre-migration code minted byte-for-byte. The parity
  fixture (Step 2) is the post-migration verifier.

**Verification:** the parity replay test (Step 11) asserts that for every
entity-detail row in the fixture,
`createJsonLdScript(graph<Entity>, ctx, <Entity>Body(entity, vocabularyBase, refs), { vocabularyBase })`'s
`textContent` parses to the fixture's `jsonLd` payload — `@id` and body fields
included.

## Step 4 — Web pages converge on `(ctx)`

Rewrites every page handler in `src/pages/*.js` to take a single `ctx` argument
and read state from `ctx.data` and `ctx.options`. The rule from Part 01 Step 9
enforces this.

| Action   | Path                                                   |
| -------- | ------------------------------------------------------ |
| Modified | `products/pathway/src/pages/agent-builder.js`          |
| Modified | `products/pathway/src/pages/agent-builder-download.js` |
| Modified | `products/pathway/src/pages/agent-builder-install.js`  |
| Modified | `products/pathway/src/pages/agent-builder-preview.js`  |
| Modified | `products/pathway/src/pages/assessment-results.js`     |
| Modified | `products/pathway/src/pages/behaviour.js`              |
| Modified | `products/pathway/src/pages/discipline.js`             |
| Modified | `products/pathway/src/pages/driver.js`                 |
| Modified | `products/pathway/src/pages/interview-builder.js`      |
| Modified | `products/pathway/src/pages/interview.js`              |
| Modified | `products/pathway/src/pages/job-builder.js`            |
| Modified | `products/pathway/src/pages/job.js`                    |
| Modified | `products/pathway/src/pages/landing.js`                |
| Modified | `products/pathway/src/pages/level.js`                  |
| Modified | `products/pathway/src/pages/progress-builder.js`       |
| Modified | `products/pathway/src/pages/progress-comparison.js`    |
| Modified | `products/pathway/src/pages/progress.js`               |
| Modified | `products/pathway/src/pages/self-assessment-steps.js`  |
| Modified | `products/pathway/src/pages/self-assessment.js`        |
| Modified | `products/pathway/src/pages/skill.js`                  |
| Modified | `products/pathway/src/pages/tool.js`                   |
| Modified | `products/pathway/src/pages/track.js`                  |

Per-file change shape (uniform):

| Before                                                                           | After                                                                                                                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `export function renderSkillDetail(params) { ... getState() ... params.id ... }` | `export function renderSkillDetail(ctx) { const { skills, capabilities } = ctx.data; const { id } = ctx.args; const wantsJson = ctx.options.json === true; ... }` |
| `export function renderSkillsList() { const { data } = getState(); ... }`        | `export function renderSkillsList(ctx) { const { skills, capabilities } = ctx.data; ... }`                                                                        |

`getState()` reaches that pull `data` are removed in this commit. Pages that
today consume non-route **UI** state (e.g. `self-assessment.js` reads assessment
progress from the store, `agent-builder.js` reads form state) keep their store
import for the UI half — only `getState().data` reaches are forbidden. The
handler-shape test in Step 11 enforces this distinction by AST-matching the
member-expression property: `getState().data` is forbidden; `getState().ui` (or
any other property) is allowed. The spec's success-criterion line 332 forbids
`getState` as a `data` reach; this narrowing matches that intent and the parity
fixture seals the behaviour.

`window.location.hash` query-string parsing — currently absent from pages — is
moved upstream to `createBoundRouter` (Part 01 Step 3). No page reads
`window.location` after this commit. Verify with
`grep -nR 'window.location.hash' products/pathway/src/pages/` — zero hits.

`self-assessment-steps.js` is an internal helper imported by
`self-assessment.js`, not a routed page handler — listed here because it exports
functions that consume `data` and so it is in the rule's scope; its exports'
first parameters move to `(ctx)` too.

**Verification:** `bun run lint products/pathway/src/pages/` (the rule's new
pathway scope from Step 11 of this part) — clean.

## Step 5 — Shared presenters take `(ctx)`

Each entity's `formatters/<entity>/shared.js` exposes a single
`present<Entity>Detail(ctx) → view` function. This is the one presenter per
capability the spec mandates. Several entities have a `shared.js` today; some
entities (`job/`, `agent/`, `toolkit/`) do not — those are **created** in this
step.

| Action   | Path                                                   |
| -------- | ------------------------------------------------------ |
| Modified | `products/pathway/src/formatters/skill/shared.js`      |
| Modified | `products/pathway/src/formatters/behaviour/shared.js`  |
| Modified | `products/pathway/src/formatters/discipline/shared.js` |
| Modified | `products/pathway/src/formatters/track/shared.js`      |
| Modified | `products/pathway/src/formatters/level/shared.js`      |
| Modified | `products/pathway/src/formatters/driver/shared.js`     |
| Modified | `products/pathway/src/formatters/tool/shared.js`       |
| Modified | `products/pathway/src/formatters/interview/shared.js`  |
| Modified | `products/pathway/src/formatters/progress/shared.js`   |
| Modified | `products/pathway/src/formatters/questions/shared.js`  |
| Created  | `products/pathway/src/formatters/job/shared.js`        |
| Created  | `products/pathway/src/formatters/agent/shared.js`      |
| Created  | `products/pathway/src/formatters/toolkit/shared.js`    |

Per-file change shape:

| Before                                                                     | After                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `export function presentSkillDetail(skill, { capabilities, disciplines })` | `export function presentSkillDetail(ctx) { const { id } = ctx.args; const { skills, capabilities, disciplines } = ctx.data; const skill = findSkill(skills, id); ... }` |

The `findSkill`/`findBehaviour`/`findEntity` helpers — today inlined inside each
`commands/<entity>.js` and inside `command-factory.js` — move into the matching
`shared.js`. Web pages and CLI handlers both call the presenter, which calls the
finder. The web page mounts `view` to DOM via existing `*ToDOM` formatters; the
CLI handler renders `view` to stdout via existing `formatDetail` formatters.
Neither side carries capability logic.

For the three created files (`job/`, `agent/`, `toolkit/`), today's presenter
logic lives inline inside the matching `commands/<entity>.js` file (e.g.
`commands/job.js`'s `runJobCommand` and `commands/agent.js`'s `runAgentCommand`
build their detail views inline). The Step 5 commit extracts the
view-construction logic into the new `shared.js`'s `present<Entity>Detail(ctx)`
and leaves both the matching command file (Step 7) and matching page file
(Step 4) as thin dispatchers.

**Verification:** parity fixture replay passes;
`grep -nR 'export function present' products/pathway/src/formatters/*/shared.js`
shows every presenter takes one parameter.

## Step 6 — `commands/command-factory.js` builds an `InvocationContext`

| Action   | Path                                               |
| -------- | -------------------------------------------------- |
| Modified | `products/pathway/src/commands/command-factory.js` |

Replace today's `runCommand({ data, args, options })` (factory return value at
line 49) with `runCommand(ctx)`. Preserve every existing branch (`--validate`,
`--list`, `--json`, no-args summary, detail-with-id, not-found error). The
factory body becomes a thin pass-through to the shared presenter from Step 5
plus the existing per-mode renderers.

```js
export function createEntityCommand({
  entityName,        // singular (also the declared positional arg name in libcli)
  pluralName,
  presentDetail,     // shared with the web side (from formatters/<entity>/shared.js)
  formatSummary,
  formatDetail,
  formatListItem,
  sortItems,
  validate,
}) {
  return async function runCommand(ctx) {
    const { args, options, data } = ctx;
    const id = args[entityName];                    // single source: declared positional name
    const rawItems = data[pluralName];
    if (options.validate) {
      return handleValidate({ data, _entityName: entityName, pluralName, validate });
    }
    if (options.list) {
      // today's --list block at lines 60-66 — extracted into a helper for symmetry
      return handleList(rawItems, sortItems, formatListItem);
    }
    if (id === undefined) return formatSummary(rawItems, data);
    return handleDetail({                           // existing helper at line 141
      data, entityName, pluralName, id,
      ctx, presentDetail,                           // NEW: ctx + presenter so handleDetail
      formatDetail,                                 //      calls presentDetail(ctx) for `view`
      wantsJson: options.json === true,             //      and emits JSON for --json mode
    });
  };
}
```

The factory delegates to two helpers that already exist today — `handleValidate`
(line 97) and `handleDetail` (line 141) — plus a thin `handleList` extracted
from today's inline `--list` block (lines 60-66). **Existing helper names stay
verbatim**; their inputs grow:

- `handleDetail` today resolves the entity via `findEntity(...)` and either
  serialises to JSON via `JSON.stringify(view)` (for `--json`) or calls
  `formatDetail(view, data.standard)`. After this commit, it accepts the shared
  `presentDetail(ctx)` callback and the surrounding `ctx`, so the same presenter
  the web page uses produces `view`. Not-found resolution stays inside
  `handleDetail` (today emits an error + non-zero exit; the parity test in Step
  11 covers this branch).
- `handleList` is today inline; this commit lifts it to a sibling helper for
  symmetry. No behaviour change.

`createCompositeCommand` (today builds `runJobCommand`/`runInterviewCommand`/
`runProgressCommand`) follows the same shape: composite key resolution uses
`ctx.args.discipline`, `ctx.args.level`, `ctx.args.track`.

**Verification:** the CLI snapshot test (Step 11) covers `--validate`, `--list`,
`--json`, no-args, with-id, and a deliberate not-found case for each entity —
all match pre-migration stdout.

## Step 7 — Per-entity command files take `(ctx)`

| Action   | Path                                          |
| -------- | --------------------------------------------- |
| Modified | `products/pathway/src/commands/skill.js`      |
| Modified | `products/pathway/src/commands/behaviour.js`  |
| Modified | `products/pathway/src/commands/discipline.js` |
| Modified | `products/pathway/src/commands/track.js`      |
| Modified | `products/pathway/src/commands/level.js`      |
| Modified | `products/pathway/src/commands/driver.js`     |
| Modified | `products/pathway/src/commands/tool.js`       |
| Modified | `products/pathway/src/commands/job.js`        |
| Modified | `products/pathway/src/commands/interview.js`  |
| Modified | `products/pathway/src/commands/progress.js`   |
| Modified | `products/pathway/src/commands/questions.js`  |
| Modified | `products/pathway/src/commands/agent.js`      |

For files that already use `createEntityCommand` (most), the bodies are
unchanged — the factory now returns the new shape. The hand-rolled commands that
destructure today (`runJobCommand`, `runQuestionsCommand`, `runAgentCommand` —
confirmed by grepping for `{ data, args, options }` in
`products/pathway/src/commands/`) get their signature rewritten to `(ctx)` and
destructure inside the body, matching the Step 6 example.

**Verification:** `bun run lint products/pathway/src/commands/` (the rule's new
pathway scope from Step 11 of this part) — clean;
`grep -nR '{ data, args, options' products/pathway/src/commands/` — zero hits.

## Step 8 — `bin/fit-pathway.js` folds runtime extras into `data`

| Action   | Path                                  |
| -------- | ------------------------------------- |
| Modified | `products/pathway/bin/fit-pathway.js` |

Four changes:

1. Import `RDF_PREFIXES` from `@forwardimpact/libgraph` once. The
   `vocabularyBase` is **not** stashed in `ctx.data` (design D5 forbids per-page
   minting from `ctx`). Instead, CLI-side `--json` output that needs the IRI
   calls `graph<Entity>(ctx, RDF_PREFIXES.fit)` directly from the matching
   command file (Step 7) — `RDF_PREFIXES.fit` is a host-level constant,
   available at the bin's import site. Web-side `vocabularyBase` flows through
   `createBoundRouter({ vocabularyBase })` per Step 9.
2. Build `data` as the union of the loaded YAML data plus the three runtime
   extras today's bin passes inline at `bin/fit-pathway.js:279-286` — `dataDir`,
   `templateLoader`, and `loader` (the data loader instance from
   `@forwardimpact/map/loader`, consumed by `commands/agent.js:253-255`):
   ```js
   const data = { ...loaded, dataDir, templateLoader, loader };
   ```
3. Subcommand definitions in the local `definition` object opt into the new
   shape via three new fields per command (Part 01 Step 8 keeps the legacy
   `args: string` shape working for non-opting CLIs; pathway opts in here):
   ```js
   {
     name: "skill",
     args: ["id"],                  // declared positional names
     argsUsage: "[<id>]",           // free-form usage for help output
     handler: (ctx) => runSkillCommand(ctx),  // points at the Step 7 export
     options: { ... },
   },
   {
     name: "job",
     args: ["discipline", "level"],
     argsUsage: "<discipline> <level>",
     handler: (ctx) => runJobCommand(ctx),
     options: { track: { type: "string" } },
   },
   ```
4. Replace today's `COMMANDS[command]` lookup and the surrounding
   `await handler({ data, args, options: values, dataDir, templateLoader, loader })`
   block (the implementer locates this block by grep on `await handler(` rather
   than by line number) with `await cli.dispatch(parsed, { data })`. The
   pre-existing pre-`COMMANDS` short-circuits for `dev`, `build`, and `update`
   **stay as direct function calls** — those subcommands are not in the libcli
   `definition.commands` array today and they continue not to be after this
   commit; only the entity commands move to dispatch.

**Verification:** `npx fit-pathway --help` renders the new `argsUsage` strings
(proves Part 01 Step 8's help.js read-path works);
`npx fit-pathway skill testing` exits 0 and matches the pre-migration snapshot;
`npx fit-pathway dev`, `npx fit-pathway build`, and `npx fit-pathway update` all
continue to work (the short-circuits remain).

## Step 9 — `main.js` switches to `createBoundRouter` and registers descriptors

| Action   | Path                                       |
| -------- | ------------------------------------------ |
| Modified | `products/pathway/src/main.js`             |
| Modified | `products/pathway/src/lib/router-pages.js` |

Today, `main.js` imports `createPagesRouter` from a vendored thin wrapper at
`./lib/router-pages.js` (which itself wraps libui's `createPagesRouter`). After
this commit:

- `lib/router-pages.js` is **rewritten** to wrap `createBoundRouter` instead of
  `createPagesRouter`. The wrapper layer stays (not removed) for two reasons:
  (a) any pathway-only navigation conventions stay localised; (b) the diff is
  minimal and the parity fixture verifies behaviour equality.
- `main.js` imports `createBoundRouter`, `defineRoute`, `createCommandBar` from
  `@forwardimpact/libui` and the per-entity `graph<Entity>` formatters from
  `./formatters/json-ld.js` (added in Step 3).
- `setupRoutes()` iterates `ROUTE_MANIFEST` (Step 1) and calls
  `router.register(defineRoute({ pattern, page, cli, graph }))` for each row.
  The route → page handler mapping (today implicit from `setupRoutes()` itself)
  is moved into a `ROUTE_HANDLERS` map keyed by pattern; `cli` is the inline
  arrow that produces the CLI string the pre-migration `getCliCommand` returns
  for that pattern; `graph` is the matching formatter (omitted for routes that
  today's `*ToJsonLd` does not cover — e.g. `/agent-builder`, builder steps).

```js
import { createBoundRouter, defineRoute, createCommandBar } from "@forwardimpact/libui";
import { RDF_PREFIXES } from "@forwardimpact/libgraph";
import { ROUTE_MANIFEST } from "./lib/route-manifest.js";
import { graphSkill, graphDiscipline, /* ... */ } from "./formatters/json-ld.js";

const router = createBoundRouter({
  data, vocabularyBase: RDF_PREFIXES.fit,
  onNotFound: renderNotFound, onError, renderError,
});

const ROUTE_HANDLERS = {
  "/skill/:id": {
    page: renderSkillDetail,
    cli: (ctx) => `npx fit-pathway skill ${ctx.args.id}`,
    graph: graphSkill,
  },
  // ...one entry per ROUTE_MANIFEST row; routes without a CLI/graph binding
  // simply omit the slot
};

for (const { pattern } of ROUTE_MANIFEST) {
  router.register(defineRoute({ pattern, ...ROUTE_HANDLERS[pattern] }));
}
createCommandBar(router, { mountInto: document.getElementById("cli-command") });
router.start();
```

`updateActiveNav` continues to subscribe to `hashchange` directly (UI concern,
not a router concern). The page-private `updateNav()` in main.js:73-79 stays.

**Verification:** the parity fixture replay (Step 11) exercises every
`ROUTE_MANIFEST` pattern through this router; load pathway in a browser and
navigate `/skill/testing` → command bar shows `npx fit-pathway skill testing`;
navigate `/agent-builder` → command bar shows empty text; navigate
`/agent/engineering` (a route that today triggers `history.replaceState` after
the agent-builder step transitions) → command bar refreshes without
`hashchange`.

## Step 10 — Delete the three displaced files

| Action  | Path                                         |
| ------- | -------------------------------------------- |
| Deleted | `products/pathway/src/lib/cli-command.js`    |
| Deleted | `products/pathway/src/components/top-bar.js` |
| Deleted | `products/pathway/test/cli-command.test.js`  |

`cli-command.test.js` (today's tests for `getCliCommand`) is replaced by the
parity replay test (Step 11). Pattern-ordering coverage today's test provides
(e.g. `/job/:d/:l/:t` matches before `/job/:d/:l`) is preserved because
`ROUTE_MANIFEST` (Step 1) lists patterns in the same order `setupRoutes()`
registered them, and `createBoundRouter` matches in registration order — the
fixture row for `/job/engineering/senior/individual-contributor` asserts the
three-segment match, and the fixture row for `/job/engineering/senior` asserts
the two-segment match.

**Verification:**
`grep -nR "from .*lib/cli-command" products/pathway/src && grep -nR "from .*components/top-bar" products/pathway/src`
— zero hits.

## Step 11 — Expand ESLint rule scope to pathway, add parity test and CLI snapshot

| Action   | Path                                                  |
| -------- | ----------------------------------------------------- |
| Modified | `eslint.config.js`                                    |
| Created  | `products/pathway/test/route-bindings-parity.test.js` |
| Created  | `products/pathway/test/handler-shape.test.js`         |
| Created  | `products/pathway/test/cli-snapshot.test.js`          |

**Lint scope expansion.** Add `products/pathway/**/*.js` to the
`local/no-legacy-handler-shape` rule's `files` array — Steps 4–10 cleared every
legacy shape from pathway, so the rule fires zero errors on the post-migration
tree.

```js
// eslint.config.js (after Step 11):
{
  files: ["libraries/libui/**/*.js", "libraries/libcli/**/*.js", "products/pathway/**/*.js"],
  plugins: { local: localRules },
  rules: { "local/no-legacy-handler-shape": "error" },
}
```

**`route-bindings-parity.test.js`** reads `test/fixtures/route-bindings.json`
(Step 2) and, for each entry, drives the post-migration code: builds an
`InvocationContext` from `url`, calls the matching descriptor's `cli(ctx)` and
asserts equality with `cliCommand`; calls the descriptor's
`graph(ctx, RDF_PREFIXES.fit)` and the matching `*Body` function, mounts the
result through `createJsonLdScript`, parses `script.textContent`, and asserts
deep-equal with `jsonLd`. The test also exercises
`/agent/engineering/individual-contributor` (the `history.replaceState`-driven
shape from `agent-builder.js`) and asserts the command bar text refreshes
without a `hashchange` event.

**`handler-shape.test.js`** is the spec § Success-criteria test: imports every
module in `pages/`, `commands/`, and `formatters/<entity>/shared.js`, parses
each export with `acorn` (`acorn@8.16.0` is already in `bun.lock` transitively
via `espree`; the first commit on this branch adds `"acorn": "^8.16.0"` as a
direct `devDependencies` entry in `products/pathway/package.json` so the test
resolves it deterministically), and asserts:

- every exported function declares exactly one parameter;
- the function body never references `getState().data` (member-expression
  property `data` on a call expression named `getState` — `getState().ui` and
  other UI-state reaches are allowed);
- the function body never references `window.location.hash`;
- the parameter is not an `ObjectPattern` whose property-name set contains
  `{data, args, options}`.

**`cli-snapshot.test.js`** spawns `bun bin/fit-pathway.js <args>` (no `run` —
bin files invoke directly) for each capability ≥3 in success-criterion line 327
(skill, discipline, job) plus the
`--validate`/`--list`/`--json`/no-args/with-id/not-found combinations from Step
6, and asserts stdout matches a committed snapshot. Snapshots live at
`products/pathway/test/fixtures/cli-snapshots/<command>-<flags>.txt` and are
recorded with `process.env.NO_COLOR=1` for stability across local + CI.

**Verification (Step 11):** `cd products/pathway && bun test` — all green
(parity replay, handler shape, CLI snapshot, plus all pre-existing non-touched
tests); `bun run lint` (repo root) — clean; `bun run check` — clean.

## Libraries used

`@forwardimpact/libui` (consumes `defineRoute`, `createBoundRouter`,
`createCommandBar`, `createJsonLdScript`, `freezeInvocationContext` from Part
01), `@forwardimpact/libcli` (amended `Cli.dispatch`), `@forwardimpact/libgraph`
(`RDF_PREFIXES.fit`, read once at bootstrap), `@forwardimpact/map/loader`
(`createDataLoader` — already imported by today's `bin/fit-pathway.js:17`),
`acorn@^8.16.0` (added as a direct `devDependencies` entry on
`products/pathway/package.json`).

## Risks

- **`agent-builder.js` route param shape.** The agent-builder routes
  `/agent/:discipline` and `/agent/:discipline/:track` resolve to the same page
  handler. Confirm `ctx.args.discipline` and `ctx.args.track` (undefined when
  absent) reach the page; the parity fixture covers `/agent/engineering` and the
  three-segment form.
- **`createJsonLdScript` invocation site.** Today, every detail page calls
  `createJsonLdScript(skillToJsonLd(skill))` and mounts it. Post-migration,
  pages call
  `createJsonLdScript(descriptor.graph, ctx, body, { vocabularyBase })` (Part 01
  Step 5 signature). `descriptor` is reachable via
  `router.activeRoute.get().descriptor`; pages accept `{ vocabularyBase }` as
  the second argument to their `page(ctx, opts)` signature (per Part 01 Step 3)
  and forward both to the helper. Reviewers verify the call sites in Step 4's
  pages match this signature.
- **`getState().data` AST detection.** The handler-shape test must distinguish
  `getState().data` (forbidden — pages read data from `ctx.data`) from
  `getState().ui` and other property reaches (allowed — UI state lives in the
  store). Encode by traversing for a `MemberExpression` whose `object` is a
  `CallExpression` to an `Identifier` named `getState` and whose
  `property.name === "data"`.
- **CLI snapshot drift.** `cli-snapshot.test.js` snapshots may carry ANSI colour
  codes; commit them with `process.env.NO_COLOR=1` so the snapshot is stable
  across local and CI runs.
- **`router-pages.js` keeps wrapping.** Step 9 rewrites the vendored
  `./lib/router-pages.js` to wrap `createBoundRouter`; the wrapper layer is
  preserved (not removed) so any pathway-only navigation conventions (e.g. the
  `/agent-builder` → `/agent/:discipline` `replaceState` interception) stay
  localised in the wrapper rather than leaking into `main.js`. The parity
  fixture verifies behaviour equality.

## Verification (whole part)

- `cd products/pathway && bun test` — all green.
- `bun run lint` (repo root, with the rule's pathway scope expanded by Step 11)
  — clean.
- `bun run check` — clean.
- Manual smoke: `cd products/pathway && bun run dev`, navigate the routes in the
  fixture; command bar reflects the active route on every change, including the
  `replaceState`-driven hash updates triggered by the agent builder's step
  transitions.
