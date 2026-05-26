# Spec 0760 — Shared invocation surfaces for LibUI and LibCLI

## Problem

Pathway is the only product whose web routes are bound to a parallel CLI command
and a stable graph entity IRI. The three bindings live as one-off files inside
the product:

- `products/pathway/src/lib/cli-command.js` — an ordered table of
  `{ pattern: RegExp, toCommand }` rules that turns a hash route like
  `/skill/testing` into the equivalent `npx fit-pathway skill testing`.
- `products/pathway/src/components/top-bar.js` — the Safari-style URL bar that
  displays the current command, plus copy-to-clipboard and a
  `history.replaceState` interception that keeps the display in sync.
- `products/pathway/src/formatters/json-ld.js` — per-entity functions that mint
  `https://www.forwardimpact.team/schema/rdf/<Type>/<id>` IRIs (matching
  `libgraph`'s `fit:` prefix in `libraries/libgraph/src/index.js`) and emit them
  as `<script type="application/ld+json">` from each detail page.

The same fragmentation extends inward, from output to input. Pathway's CLI
handlers (built by `products/pathway/src/commands/command-factory.js`) receive
`{ data, args, options }`. Pathway's web handlers
(`products/pathway/src/pages/*.js`) receive a `params` object from libui's
router and reach into module-level `getState()` for `data` and into the URL hash
query string for option-shaped values. Two handler shapes for the same
capability. The "view" object that pathway's presenters return converges the two
surfaces downstream — but the input boundary is not shared, so handler code is
written twice and tested twice for every entity.

Specs [080-landmark-product](../080-landmark-product/spec.md) and
[090-summit-product](../090-summit-product/spec.md) commit to web UIs for those
products. Both will need the same three bindings, and without abstraction each
product will copy pathway's pattern, with predictable drift: a Landmark route
will forget to update its CLI string when a flag changes, or its IRI will
diverge from libgraph's `fit:` prefix.

The capability also belongs in libui by intent. The library catalog frames libui
as web UI primitives "for products agents build". The route–CLI–graph triangle
is libui's most agent-shaped affordance: it gives an agent reading a rendered
page (a) the exact command to type to get the same view in a terminal and (b)
the RDF subject IRI the view is about, identical to the IRI the guide agent
reads through libgraph. Today that affordance is locked inside pathway.

## Why

- **Reuse without duplication.** Landmark and Summit web UIs are queued; we want
  one mechanism, not three near-copies.
- **Prevent drift.** A single descriptor per route makes the URL, the CLI
  string, and the graph IRI co-evolve. Today the three are wired in three
  different files and only kept in sync by convention.
- **Honour libui's stated capability.** `libraries/libui/package.json` lists one
  `forwardimpact.needs` entry today: "Build a reactive single-page web app". The
  route↔channel binding is part of what makes such an app legible to an agent
  and belongs at the same layer as `createRouter`.
- **Strengthen the human–agent contract.** Agents that read the JSON-LD on a
  rendered page should land on the same IRI they would query through libgraph.
  Centralising the IRI minting eliminates the failure mode where the page IRI
  silently drifts from the graph's view of the same entity.
- **One handler per capability.** A unified handler-input contract collapses two
  parallel implementations (CLI and web) into one presenter that either surface
  invokes. Tests run against a single fixture; coverage doubles automatically.
- **A third surface becomes possible.** A graph-walking guide agent that
  "navigates" to an RDF entity can synthesize the same context to drive the
  presenter without rendering — turning every capability into something an agent
  can introspect without DOM or stdout.
- **Clean break, not shim.** libui and libcli have few consumers today; this is
  the right moment to converge their handler contracts. The migration removes
  the two old handler shapes outright. No `params`-only handlers, no
  module-level `getState()` reaches, no compatibility wrappers — there is one
  handler shape after this change.

## What

### 1. The shared contract: `InvocationContext`

`@forwardimpact/libui` and `@forwardimpact/libcli` converge on a single contract
for handler input. Every web route and every CLI subcommand transforms its
native input — URL params plus query string, or argv plus parsed flags — into
the same `InvocationContext` object. Handlers consume the context without
knowing which surface invoked them and return a surface-agnostic view object
that surface-specific formatters render.

The contract is the JSDoc typedef below, exported by both libraries (the exact
location is a design-phase decision — see Notes):

```js
/**
 * @typedef {Object} InvocationContext
 *
 * The shape libui and libcli both produce from their native inputs.
 * Handlers consume the context and return a view; surface-specific
 * formatters render the view. The context carries no information about
 * which surface produced it — surface dispatch happens one level above the
 * handler.
 *
 * @property {Object} data
 *   The host's data dependencies, opaque to libui and libcli. Shape is the
 *   product's responsibility (e.g. `{ skills, disciplines, capabilities,
 *   standard }` for pathway). Anything a handler needs that is not a
 *   positional or named argument lives here, including surface-specific
 *   runtime dependencies the host folds in before invocation (pathway's
 *   CLI `dataDir` and `templateLoader` are present examples). The handler
 *   treats `data` as immutable input.
 *
 * @property {Readonly<Object<string, string>>} args
 *   Named positional arguments. On the web side: route-pattern parameters
 *   keyed by their name (e.g. `/job/:discipline/:level/:track` maps to
 *   `{ discipline, level, track }`). On the CLI side: the subcommand's
 *   declared positional argument names mapped to their argv values. Values
 *   are always strings; consumers parse if they need other types.
 *
 * @property {Readonly<Object<string, string | boolean | string[]>>} options
 *   Named non-positional arguments. On the web side: the URL hash query
 *   string parsed once. On the CLI side: parsed CLI flags. Values are one
 *   of: a string, the boolean `true` (for a presence-only flag or an
 *   empty-valued query parameter), or an array of strings (when the same
 *   key appears more than once). Absent options are not present in the
 *   object — `'foo' in ctx.options` is the membership test.
 */
```

Three invariants the contract encodes:

- **No surface affordances.** The context carries no DOM nodes, no streams, no
  `Request`/`Response` objects, no clipboard handles, no logger, and no surface
  tag. Anything that exists on only one surface stays out of the contract. This
  is the property that keeps the context from becoming a god-object and that
  lets a future graph-walking agent surface synthesize the same shape without
  ceremony.
- **Uniform value shapes.** `args` values are strings; `options` values are one
  of `string`, `true`, or `string[]`. Both surfaces' parsers normalise to this
  shape so handlers never branch on surface-specific value types.
- **Frozen at all levels.** The context and its `args` and `options` maps are
  immutable, and any array values inside `options` are immutable too. Handlers
  MAY assume immutability without checking.

A handler signature is therefore exactly:

```js
/**
 * @param {InvocationContext} ctx
 * @returns {*} A view object, surface-agnostic.
 */
function present(ctx) { ... }
```

The same `present` function is exercised by both surfaces. A test constructs a
synthetic context, calls the presenter, and asserts against the returned view —
no DOM, no stdout, no surface scaffolding required. Surface-specific concerns
(provenance for traces, error messages, dispatch decisions) live in the
dispatcher one level above the handler, never in the context.

### 2. A unified route descriptor in libui

`@forwardimpact/libui` exposes a way to register each route once and bind it to
up to two channels in addition to its DOM handler:

| Channel | Role                                                                                                              | Where the same role lives in pathway today                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages   | Render the route into the DOM.                                                                                    | The route handlers wired up in `products/pathway/src/main.js`.                                                                                                           |
| CLI     | Produce a CLI command string equivalent to the route.                                                             | `products/pathway/src/lib/cli-command.js`.                                                                                                                               |
| Graph   | Produce a stable graph entity IRI for the route, when one exists, against a vocabulary base supplied by the host. | The `@id` minted by the per-entity functions in `products/pathway/src/formatters/json-ld.js`, against a vocabulary base shared verbatim with `libgraph`'s `fit:` prefix. |

A registered route is one descriptor that names the pattern, the page handler,
and the optional CLI and Graph formatters. Whichever channels the descriptor
binds, libui resolves them for the active route as the user navigates. Either
non-Pages channel may be absent: a builder page may have no graph entity; an
internal-only debug route may have no CLI form.

Routes that today have no graph entity (e.g. the `/skill` list view) remain
unbound to the Graph channel. Routes that today have no CLI equivalent (e.g.
in-progress builder steps) remain unbound to the CLI channel. The descriptor
must accept absence on either channel without forcing a placeholder.

When a route is matched, libui builds an `InvocationContext` from the URL
(`args` from the route-pattern parameters, `options` from the hash query string,
and the host-provided `data`) and passes it to the page handler.

### 3. `libcli` produces `InvocationContext` from argv

`@forwardimpact/libcli` is amended so every CLI subcommand handler is invoked
with an `InvocationContext`. The library's command builder already knows the
subcommand's positional argument names and parsed flags; it now assembles those
into the contract above (`args` keyed by declared positional names, `options`
from parsed flags, and the host-provided `data`) before calling the handler.
Surface-specific runtime needs that pathway's CLI today receives as extra
parameters (e.g. `dataDir` and `templateLoader` in `runSkillCommand`) are folded
into `data` by the host's bootstrap before the handler is called — `data` is the
only host-supplied dependency channel.

The same handler that the web route invokes is reused verbatim by the CLI
subcommand — there is one presenter per capability, not two.

### 4. A reusable command bar component in libui

`@forwardimpact/libui` exposes a top-bar component that displays the active
route's CLI command and offers a copy-to-clipboard affordance. Product-specific
styling stays in the consuming product's CSS; the component itself is
structurally complete and product-agnostic.

The component must remain in sync with the active route as the user navigates
and must not break, throw, or render stale content on routes that have no CLI
binding.

### 5. A JSON-LD emission helper in libui

`@forwardimpact/libui` exposes a helper that, given the active route's Graph
formatter and a body object, returns a `<script type="application/ld+json">`
element whose JSON content carries the formatter's IRI as `@id` merged with the
caller's body fields. Mounting the returned element into the page DOM is the
caller's responsibility, mirroring how `createJsonLdScript` is used in pathway
today. The vocabulary itself (the value of the `fit:` prefix) stays owned by
`libraries/libgraph`.

Per-entity body shapes — `Skill.proficiencyDescriptions`,
`Discipline.coreSkills`, etc. — remain owned by each product's formatters. libui
only owns the script-element wiring and the `@id` minting through the Graph
channel.

### 6. Pathway adopts the new capability

Pathway is the proof of the abstraction. After migration:

- `products/pathway/src/lib/cli-command.js` no longer exists as a separate
  module — pathway expresses every route's CLI binding through libui's
  descriptor API.
- `products/pathway/src/components/top-bar.js` no longer exists as a separate
  component — pathway consumes libui's command-bar component.
- `products/pathway/src/formatters/json-ld.js` keeps its per-entity body
  builders but stops minting `@id` strings and stops constructing `<script>`
  elements; both responsibilities sit in libui.

Pathway's handlers also converge on the `InvocationContext` shape:

- Every web page handler in `products/pathway/src/pages/*.js` takes a single
  `ctx: InvocationContext` argument. Pages stop calling module-level
  `getState()` for `data` — they read `ctx.data`. Pages stop reading the URL
  hash query string directly — they read `ctx.options`. Route params arrive on
  `ctx.args` keyed by their pattern names.
- Every presenter in `products/pathway/src/formatters/<entity>/shared.js` takes
  a single `ctx: InvocationContext` argument. The current
  `(entity, { disciplines, tracks, drivers, capabilities })` signature is
  replaced; the presenter destructures from `ctx.data` instead.
- `products/pathway/src/commands/command-factory.js` is updated so the
  `runCommand({ data, args, options })` shape it builds today becomes a full
  `InvocationContext` (`args` becomes a named map keyed by the subcommand's
  declared positional names; runtime extras such as `dataDir` and
  `templateLoader` are folded into `data` by the host's bootstrap, so handlers
  no longer take them as extra parameters). Each `commands/<entity>.js` file
  keeps the same module exports but its handler signatures change to `(ctx)` and
  call the same shared presenter the web pages call.
- For each capability that today has separate CLI and web implementations,
  pathway ends up with exactly one presenter file per entity. Duplicate handler
  logic is removed, not aliased.

How each consumer wires up to the libui exports — argument shape, registration
site, file layout, CSS placement — is a plan-phase concern. The
`InvocationContext` typedef location, by contrast, is a design-phase decision
because it determines a public-API surface (see Notes).

### 7. Catalog and documentation

- `libraries/libui/package.json` gains a new entry in `forwardimpact.needs`. The
  library has one such entry today: "Build a reactive single-page web app".
  Wording for the new entry is a design decision; the catalog generator
  (`bun run lib:fix`) enforces uniqueness across the monorepo at check time.
- A library guide documents the capability for external readers under
  `websites/fit/docs/libraries/<task-slug>/index.md`, with the task slug decided
  in the design phase. libui ships no CLI and no published skill, so the
  cross-link rule in `libraries/CLAUDE.md` (skill ↔ CLI `--help` ↔ guide) does
  not apply; the README's getting-started snippet links directly to the guide's
  fully-qualified URL.
- `libraries/libui/README.md` shows the descriptor registration form in its
  getting-started snippet.

## Scope

### In scope

- The `InvocationContext` JSDoc typedef, exported by both libui and libcli (or
  by a shared module they both import — design decides).
- Public API additions to `@forwardimpact/libui`: the route descriptor that
  builds an `InvocationContext` and dispatches to handlers, the top-bar
  component, and the JSON-LD helper.
- Public API change to `@forwardimpact/libcli`: subcommand handlers receive
  `InvocationContext` instead of `{ data, args, options }`. `args` becomes a
  named map keyed by the subcommand's declared positional names; runtime extras
  such as `dataDir` and `templateLoader` fold into `data`.
- Migration of pathway to consume the new APIs — the three pathway files named
  above are removed; web page handlers, presenters, and CLI command handlers are
  rewritten against `InvocationContext`; duplicate handler logic between CLI and
  web is collapsed to one presenter per capability.
- Catalog metadata updates and the new library guide(s).

### Out of scope

- **Backwards compatibility.** The migration is a clean break. No compatibility
  shims, no aliases, no parallel re-exports of the old `params`-only or
  `{ data, args, options }`-only handler shapes. Both surfaces ship with one
  shape after this change. libui and libcli have few consumers today; the cost
  of a shim layer outweighs the benefit.
- Adding the capability to Landmark or Summit web UIs. Those products are the
  future beneficiaries; landing the abstraction with one consumer (pathway) is
  sufficient proof.
- Changes to `libgraph`'s `RDF_PREFIXES` or to the underlying vocabulary at
  `https://www.forwardimpact.team/schema/rdf/`.
- Per-product CLI command strings, per-entity JSON-LD body shapes, or
  per-product `data` shape — the abstraction is the mechanism, not the values.
- Reverse mapping (from a CLI command back to a web URL, or from a graph IRI to
  a web URL). This spec is one-directional from input to handler.
- Renaming or restructuring of existing libui exports (`createRouter`,
  hyperscript helpers, reactive primitives, error boundary, YAML loader) beyond
  what the descriptor and context change requires.
- Server-side rendering of JSON-LD. The capability operates in the browser, the
  same as today.
- A graph-walking agent surface. The contract is shaped so a future surface
  could synthesize an `InvocationContext` from RDF without rendering, but this
  spec ships no such producer and the contract carries no enumeration reserving
  the value — the typedef extends when the producer lands.

## Success criteria

| Claim                                                                                                                                                 | Verifiable by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The `InvocationContext` JSDoc typedef exists and is documented as the shared handler input.                                                           | The typedef is defined in source (location decided in design) with the `data`, `args`, and `options` properties, the three invariants (no surface affordances, uniform value shapes, frozen at all levels), and the handler signature shown in this spec; both libui and libcli reference it from their public API surface.                                                                                                                                                                                                                                                                                                                                              |
| Both surfaces produce contexts that satisfy the contract's runtime invariants.                                                                        | A test (e.g. `libraries/libui/test/invocation-context.test.js` and a sibling under `libraries/libcli/test/`) constructs a context from a fixed URL pair and a fixed argv pair, then asserts: the context, its `args`, its `options`, and any array values inside `options` are all frozen; every `args` value's type is `string`; every `options` value's type is one of `string`, `boolean`, or `Array<string>`.                                                                                                                                                                                                                                                        |
| One presenter per capability is exercised by both surfaces.                                                                                           | For at least three pathway capabilities (e.g. skill detail, discipline detail, job detail), a single presenter file is imported by both the matching web page handler and the matching CLI command handler. A test invokes the same presenter from a synthesized web `InvocationContext` and a synthesized CLI `InvocationContext` against a shared fixture and asserts identical view objects.                                                                                                                                                                                                                                                                          |
| `@forwardimpact/libui` exposes a public route descriptor API that accepts a pattern, a page handler, and optional CLI and Graph formatters.           | Public exports of `@forwardimpact/libui` include the new API, and `libraries/libui/README.md`'s getting-started snippet shows it with all three channel slots.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@forwardimpact/libui` exposes a top-bar component that consuming products import rather than re-implement.                                           | Public exports of `@forwardimpact/libui` include the component; using it in a libui app with at least one CLI-bound route renders that route's command and a working copy button. A grep across the post-migration tree finds the component imported from `@forwardimpact/libui` in pathway and zero local re-implementations of equivalent behaviour.                                                                                                                                                                                                                                                                                                                   |
| `@forwardimpact/libui` exposes a JSON-LD helper that mints `@id` from the route descriptor and emits a `<script type="application/ld+json">` element. | Public exports include the helper; given a Graph formatter and a body, the helper produces a script element whose JSON content carries the formatter's IRI as `@id` and the body fields merged in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Pathway no longer holds its own copies of the three mechanisms.                                                                                       | `products/pathway/src/lib/cli-command.js` and `products/pathway/src/components/top-bar.js` are deleted; `products/pathway/src/formatters/json-ld.js` no longer constructs `<script>` elements or builds `@id` strings.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Pathway's handlers all consume `InvocationContext`.                                                                                                   | A test under `products/pathway/test/` imports every module in `products/pathway/src/pages/` and `products/pathway/src/commands/` and asserts, via `Function.prototype.length` plus AST inspection of each exported handler, that exactly one parameter is declared and that no handler body references `getState`, `window.location.hash`, or destructures `{ data, args, options }` at the top of the function. The test fails if any handler retains the old shapes.                                                                                                                                                                                                   |
| The migration is a clean break with no compatibility shims.                                                                                           | The PR diff itself is the verifier: any line introduced by this change that defines or exports a function whose first parameter has the historical shape (a bare `params` object on the web side, or a destructured `{ data, args, options }` literal on the CLI side) is treated as a failed criterion. Reviewers confirm by reading the diff; a CI ESLint rule added by this change rejects either pattern in `libraries/libui/`, `libraries/libcli/`, and `products/pathway/`.                                                                                                                                                                                        |
| Pathway's user-visible behaviour is unchanged after the migration.                                                                                    | A baseline fixture file at `products/pathway/test/fixtures/route-bindings.json` is committed in this PR. The fixture is generated, by a script also added in this PR, from the pre-migration build of pathway and contains one entry per route returned by `setupRoutes()` in `products/pathway/src/main.js` — every entry carries the route pattern, a representative concrete URL, the CLI command string the top bar shows, and the full JSON-LD payload (`@id` plus every body field) the page emits. A test replays the fixture against the post-migration build and asserts field-for-field equality; running it from a clean checkout of the merge commit passes. |
| The command bar handles routes without a CLI binding.                                                                                                 | The same test exercises at least one route that has no CLI binding (e.g. a builder step) and asserts the command bar neither throws nor renders a stale command from a previous route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| The libui catalog reflects the new capability.                                                                                                        | `libraries/libui/package.json` carries a new entry in `forwardimpact.needs` whose phrase names a route↔CLI↔graph-entity binding (the concept introduced by this spec, distinct from the existing "Build a reactive single-page web app"); `bun run lib:fix` followed by `bun run check` regenerates `libraries/README.md` and passes.                                                                                                                                                                                                                                                                                                                                    |
| External readers can learn the capability without cloning the monorepo.                                                                               | A guide exists under `websites/fit/docs/libraries/<task-slug>/index.md` (slug decided in design); it covers the `InvocationContext` contract, the route descriptor's three channels (Pages, CLI, Graph), and the libcli command builder, and shows an end-to-end example a Landmark or Summit author could follow.                                                                                                                                                                                                                                                                                                                                                       |
| The libui additions are independent of pathway.                                                                                                       | The new libui exports contain no hardcoded pathway-specific literals (no literal `fit-pathway` command name, no literal `forwardimpact.team/schema/rdf/` vocabulary base); product-specific CLI strings and vocabulary bases are passed in by the consumer at registration time.                                                                                                                                                                                                                                                                                                                                                                                         |

## Notes

- `libgraph`'s `RDF_PREFIXES` registers `fit:` as
  `https://www.forwardimpact.team/schema/rdf/` and pathway's `VOCAB_BASE`
  matches that string verbatim. The bridge is implicit today; the design phase
  decides whether libui makes the linkage explicit (e.g. by accepting a
  vocabulary base on the descriptor) or leaves it as a per-call argument.
- Two design questions are deferred: (a) whether the descriptor extends
  `router.on(...)` with an options argument or introduces a sibling registry
  primitive, and (b) whether the top-bar is a libui-owned component or a thinner
  "command provider" hook that consumers wrap into their own bar.
- Specs 0080 (Landmark) and 0090 (Summit) are the future consumers; this spec does
  not depend on either being in flight.
- The `InvocationContext` typedef is exported by both libui and libcli, but the
  design phase decides where it physically lives. Three options exist today: a
  new shared package, an existing utility package such as `libtype`, or
  duplicated typedef declarations in both libraries that document the same
  shape. JSDoc is documentation, so duplication is type-safe; the question is
  convention.
- The handler-convergence work assumes pathway's CLI and web today produce the
  same view shape per capability. This is verified once the spec lands by
  enumerating capabilities where the CLI and web presenters diverge — if any are
  found, the design phase notes the divergence and either reconciles the view or
  accepts surface-specific specialisation as a documented extension to the
  contract.
