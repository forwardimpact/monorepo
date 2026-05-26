# Plan 0760-a — Shared invocation surfaces for LibUI and LibCLI

Spec: [`spec.md`](spec.md). Design: [`design-a.md`](design-a.md). Plan parts:
[`plan-a-01.md`](plan-a-01.md), [`plan-a-02.md`](plan-a-02.md),
[`plan-a-03.md`](plan-a-03.md).

## Approach

Land the design's nine architectural decisions in three sequential parts. Part
01 publishes the new public surface (libui's `defineRoute`, `createBoundRouter`,
`createCommandBar`, `createJsonLdScript`, `freezeInvocationContext`; libcli's
amended `createCli` handler contract) and the repo-root ESLint rule that forbids
the legacy `params` and `{ data, args, options }` handler shapes — but touches
no product. Part 02 migrates pathway page-by-page and command-by-command onto
the new contract, replaces `setupTopBar` with `createCommandBar`, deletes the
three displaced files, and seals the migration with a route-bindings parity
fixture generated from the pre-migration build. Part 03 updates the catalog
metadata (`forwardimpact.needs`, regenerated `libraries/README.md`) and writes
the external library guide. Parts run sequentially because Part 02 imports from
the libui/libcli HEADs that Part 01 ships, and Part 03's `bun run check`
regeneration must observe the post-migration libui exports.

## Parts index

| #   | Plan                        | Scope                                                                                                  | Owner              | Depends on        |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------ | ----------------- |
| 01  | [`plan-a-01`](plan-a-01.md) | libui exports, libcli amendments, `freezeInvocationContext`, ESLint rule, library tests                | `staff-engineer`   | —                 |
| 02  | [`plan-a-02`](plan-a-02.md) | Pathway adoption: pages, commands, presenters, `main.js`, three deletions, parity fixture              | `staff-engineer`   | Part 01 on `main` |
| 03  | [`plan-a-03`](plan-a-03.md) | Catalog `forwardimpact.needs` entry, regenerated catalog, libui README snippet, external library guide | `technical-writer` | Part 02 on `main` |

## Libraries used

`@forwardimpact/libui` (new exports), `@forwardimpact/libcli` (amended
**additively** — legacy `args: "<usage>"` definitions still work),
`@forwardimpact/libgraph` (`RDF_PREFIXES.fit`, read once at pathway bootstrap),
`node:test`, `node:assert`, `happy-dom` (libui test dep), `acorn` (pathway test
dep), ESLint (in-repo plugin `tools/eslint-rules/no-legacy-handler-shape.js`).

## Risks (cross-cutting)

- **Legacy libcli consumers must not break.** `landmark`, `map`, `summit`, and
  pathway's own `dev`/`build`/`update` short-circuits all use today's
  `args: "<usage>"` string definitions and direct handler invocation. Part 01's
  amendment is **additive**: legacy definitions continue to construct and
  `parse()` continues to return `{ values, positionals }` unchanged; the new
  `dispatch()` method and `args: string[]` + `handler` opt-in are required only
  for callers that want named-map args (pathway in Part 02). Part 01
  verification smokes `fit-landmark --help` to prove no regression.
- **ESLint rule scope by part.** Part 01 scopes the `no-legacy-handler-shape`
  rule to `libraries/libui/**` + `libraries/libcli/**` only. Part 02 Step 11
  expands the scope to `products/pathway/**` after the migration is complete.
  The repo-root `bun run lint` (`eslint . --max-warnings 0`) stays green at
  every commit on every branch.
- **`history.replaceState` interception.** `setupTopBar` today patches
  `history.replaceState` so the bar refreshes when a page (e.g. agent builder)
  rewrites the hash without firing `hashchange`. The design's dispatch sequence
  is silent about this case. Part 01 replicates the interception inside
  `createBoundRouter` so `activeRoute` updates on both `hashchange` and
  `replaceState`; Part 02's parity fixture exercises the
  `/agent/:discipline[/:track]` shapes that today trigger `replaceState` to
  detect regression.
- **`parseArgs` positional → named-map mapping.** `node:util`'s `parseArgs`
  returns `positionals` as a flat array including the subcommand name (e.g.
  `["skill", "testing"]`). Part 01's libcli `dispatch` consumes the subcommand
  prefix before zipping against the subcommand definition's `args: string[]`,
  and tolerates fewer-than-declared positionals (optional args).
- **In-repo ESLint plugin.** `no-restricted-syntax` selectors cannot enforce
  property-name sets directly. Part 01 ships a small in-repo plugin loaded by
  direct `import` from `eslint.config.js`.
- **Fixture-generation ordering on a single branch.** Part 02's parity test
  requires a fixture generated from the **pre-migration** build of pathway. Step
  1 lifts the route patterns into a manifest constant; Step 2 generates and
  commits the fixture. Both must land before any page-handler migration commit
  on the Part 02 branch; reviewers verify by checking the commit order in the
  PR.
- **`createRouter` callers outside pathway.** `createRouter` stays exported
  unchanged for products that do not opt in. Part 01 adds `createBoundRouter`
  alongside it; Part 02 rewrites pathway's vendored `lib/router-pages.js`
  wrapper to wrap `createBoundRouter` (the wrapper is preserved — pathway-only
  navigation conventions stay localised). Other products are not modified.
- **Catalog command-name drift.** `libraries/CLAUDE.md` references
  `bun run lib:fix`, but the actual `package.json` script is
  `bun run context:fix`. Part 03 uses the actual command and files a follow-up
  issue for the doc drift rather than touching CLAUDE.md in this PR.

## Execution

- **Sequential.** Each part's PR depends on the previous part being on `main`
  (libui/libcli HEADs for Part 02; the new libui export visible to
  `bun run context:fix` for Part 03).
- **Same-branch alternative for Part 02.** If `staff-engineer` opts to land
  Parts 01 + 02 in one branch, the parts remain separately verifiable — Part
  01's tests stay green at the part-01 commit, Part 02's parity test goes green
  at the part-02 commit. The PR description must list the two parts as separate
  review surfaces. Part 03 stays its own branch so `technical-writer` can own
  it.
- **Branches.**
  - Part 01: `feat/760-libui-libcli-invocation-context`
  - Part 02: `feat/760-pathway-adopts-invocation-context`
  - Part 03: `docs/760-web-cli-graph-bindings-guide`
- **Do not skip.** Part 02's migration is the spec's proof; Part 03's catalog
  entry is a success-criterion line in the spec ("The libui catalog reflects the
  new capability"). Both must land for the spec to be implemented.
