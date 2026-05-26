# Plan 0760-a-01 — LibUI and LibCLI primitives

Spec: [`spec.md`](spec.md). Design: [`design-a.md`](design-a.md). Overview:
[`plan-a.md`](plan-a.md).

Adds `InvocationContext` (typedef + freeze helper) to both libraries, four new
libui exports, an amended libcli handler contract, and the ESLint rule that
rejects the legacy handler shapes. No product files change in this part.

## Step 1 — `freezeInvocationContext` and the typedef in libui

Adds the shared contract and runtime helper to libui.

| Action  | Path                                              |
| ------- | ------------------------------------------------- |
| Created | `libraries/libui/src/invocation-context.js`       |
| Created | `libraries/libui/test/invocation-context.test.js` |

`invocation-context.js` exports
`freezeInvocationContext(raw) → InvocationContext` that deep-freezes `ctx`,
`ctx.args`, `ctx.options`, and any `Array` value inside `ctx.options`. Body
sketch:

```js
/** @typedef {Object} InvocationContext
 *  @property {Object} data
 *  @property {Readonly<Object<string,string>>} args
 *  @property {Readonly<Object<string,string|boolean|string[]>>} options
 */
export function freezeInvocationContext({ data, args, options }) {
  for (const v of Object.values(options)) {
    if (Array.isArray(v)) Object.freeze(v);
  }
  return Object.freeze({ data, args: Object.freeze({ ...args }), options: Object.freeze({ ...options }) });
}
```

The full JSDoc typedef is the verbatim block from `spec.md` § 1, including the
three invariants. **Verification:**
`bun test libraries/libui/test/invocation-context.test.js` passes (frozen at all
levels for a fixed input; `'foo' in ctx.options` is the membership test).

## Step 2 — `defineRoute` and `RouteDescriptor`

Adds the pure data builder.

| Action  | Path                                            |
| ------- | ----------------------------------------------- |
| Created | `libraries/libui/src/route-descriptor.js`       |
| Created | `libraries/libui/test/route-descriptor.test.js` |

```js
/** @typedef {Object} RouteDescriptor
 *  @property {string} pattern
 *  @property {(ctx, opts: { vocabularyBase?: string }) => void} page
 *  @property {((ctx) => string)=} cli
 *  @property {((ctx, vocabularyBase: string) => string)=} graph
 */
export function defineRoute({ pattern, page, cli, graph }) {
  if (typeof pattern !== "string") throw new TypeError("pattern: string");
  if (typeof page !== "function") throw new TypeError("page: function");
  return Object.freeze({ pattern, page, cli, graph });
}
```

**Verification:** test asserts the descriptor is frozen, `cli`/`graph` are
optional, and `pattern`/`page` are required.

## Step 3 — `createBoundRouter`

Replaces today's `createRouter` for opt-in callers; produces an
`InvocationContext` on each match and exposes an `activeRoute` reactive plus a
`routes()` enumerator.

| Action  | Path                                        |
| ------- | ------------------------------------------- |
| Created | `libraries/libui/src/bound-router.js`       |
| Created | `libraries/libui/test/bound-router.test.js` |

Built on top of `router-core.js` (do not duplicate hash matching). The
implementer must export `parsePattern` from `router-core.js` so
`bound-router.js` can import it (today it is a private helper at lines 39-52);
no behaviour change to `createRouter` consumers. Public shape:

```js
import { createReactive } from "./reactive.js";
import { freezeInvocationContext } from "./invocation-context.js";
import { withErrorBoundary } from "./error-boundary.js";

export function createBoundRouter({
  data, vocabularyBase, onNotFound, onError, renderError,
} = {}) {
  const descriptors = [];
  const activeRoute = createReactive(null); // { descriptor, ctx } | null
  // ... compile pattern → regex once at register() time, same shape as router-core.parsePattern
  // ... handleRoute(): match path, parse query string from `path.split('?')[1]`, build args/options, freeze, set activeRoute, dispatch descriptor.page(ctx, { vocabularyBase })
  // ... start()/stop()/navigate() mirror router-core's API
  // ... patch history.replaceState in start() so activeRoute updates without hashchange (mirrors pathway/src/components/top-bar.js:42-48); restore in stop()
  return { register, routes, start, stop, navigate, currentPath, activeRoute };
}
```

Dispatch contract (matches `design-a.md` § Dispatch sequence):

1. parse `path.split("?")[0]` → match descriptor → `args` from `paramNames`
   zipped against capture groups (decoded);
2. parse `path.split("?")[1]` with `URLSearchParams` → `options`: each key that
   appears multiple times becomes `string[]`; an empty value becomes `true`;
   otherwise `string`;
3. `ctx = freezeInvocationContext({ data, args, options })`;
4. `activeRoute.set({ descriptor, ctx })`;
5. `descriptor.page(ctx, { vocabularyBase })` — wrapped in `withErrorBoundary`.

`onNotFound`/`onError`/`renderError` retain the same semantics `createRouter`
exposes today (router-core.js:60).

**Verification:** test exercises (a) a route with `:id`, query
`?json=1&tag=a&tag=b` producing `args.id`, `options.json === true`,
`options.tag === ["a","b"]`; (b) unmatched path triggers `onNotFound`; (c)
`activeRoute` subscribers fire on both `hashchange` and `history.replaceState`;
(d) `routes()` returns registered descriptors enumerable.

## Step 4 — `createCommandBar`

DOM component subscribing to `activeRoute`.

| Action  | Path                                       |
| ------- | ------------------------------------------ |
| Created | `libraries/libui/src/command-bar.js`       |
| Created | `libraries/libui/test/command-bar.test.js` |

```js
export function createCommandBar(router, { mountInto }) {
  // commandEl + copyButton built with createElement
  const unsubscribe = router.activeRoute.subscribe((entry) => {
    const text = entry?.descriptor.cli ? entry.descriptor.cli(entry.ctx) : "";
    commandEl.textContent = text;
    copyButton.disabled = text === "";
  });
  // copy click handler: navigator.clipboard.writeText(commandEl.textContent), with the same fallback as pathway/src/components/top-bar.js:84-96
  return { destroy() { unsubscribe(); mountInto.removeChild(root); } };
}
```

Routes without a `cli` slot render empty text (success-criterion: "command bar
neither throws nor renders a stale command from a previous route").

**Verification:** test mounts the bar with a synthetic router whose
`activeRoute` reactive emits a sequence (cli-bound → no-cli → cli-bound) and
asserts the displayed text and `copyButton.disabled` track the sequence.

## Step 5 — `createJsonLdScript`

Helper that mints `@id` through a descriptor's `graph` formatter.

**Plan-phase clarification of design D4.** Design D4 lists the helper signature
as `(graphFormatter, body, { vocabularyBase })` (design-a.md:46, 129) and the
dispatch sequence (design-a.md:74) shows the helper invoking
`graph(ctx, vocabularyBase) → IRI`. The 3-arg signature has no path for `ctx` to
reach the formatter — a mechanical incompleteness, not a re-litigated decision.
The plan adds `ctx` as the second positional argument:
`(graphFormatter, ctx, body, { vocabularyBase })`. The single-round-trip
contract D4 chose over caller-mints-IRI is preserved exactly: the helper still
invokes the formatter; the caller never assembles an IRI string. If a reviewer
wants the design re-opened to record the 4-arg form explicitly, file an issue
against design-a.md; this plan ships against the 4-arg form.

| Action  | Path                                          |
| ------- | --------------------------------------------- |
| Created | `libraries/libui/src/json-ld-script.js`       |
| Created | `libraries/libui/test/json-ld-script.test.js` |

```js
export function createJsonLdScript(
  graphFormatter,
  ctx,
  body,
  { vocabularyBase },
) {
  if (!graphFormatter) return null;
  const id = graphFormatter(ctx, vocabularyBase);
  const payload = { "@context": vocabularyBase, "@id": id, ...body };
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(payload);
  return script;
}
```

**Verification:** test asserts `null` when formatter is absent; given a
formatter `(ctx, base) => `${base}Skill/${ctx.args.id}``and a body with`{
"@type": "Skill", name: "Testing"
}`, asserts the returned element's `type`is`application/ld+json`, `JSON.parse(textContent)["@id"]`is the formatter's return value, body fields are merged, and`@context`carries`vocabularyBase`.

## Step 6 — Wire new exports into libui's public surface

| Action   | Path                           |
| -------- | ------------------------------ |
| Modified | `libraries/libui/src/index.js` |

Add at the end of the existing export block (after `getItemsByIds`):

```js
// Invocation context (shared with libcli — typedef duplicated, see design D1)
export { freezeInvocationContext } from "./invocation-context.js";
// Route descriptors and bound router
export { defineRoute } from "./route-descriptor.js";
export { createBoundRouter } from "./bound-router.js";
// UI helpers tied to the bound router
export { createCommandBar } from "./command-bar.js";
export { createJsonLdScript } from "./json-ld-script.js";
```

`createRouter` stays exported unchanged.

**Verification:**
`import { defineRoute, createBoundRouter, createCommandBar, createJsonLdScript, freezeInvocationContext } from "@forwardimpact/libui"`
from a sibling test file succeeds.

## Step 7 — `freezeInvocationContext` in libcli

Duplicates the helper into libcli (design D1 records the rejection of a shared
package).

| Action   | Path                                               |
| -------- | -------------------------------------------------- |
| Created  | `libraries/libcli/src/invocation-context.js`       |
| Created  | `libraries/libcli/test/invocation-context.test.js` |
| Modified | `libraries/libcli/src/index.js`                    |

`invocation-context.js` is a byte-for-byte copy of libui's file (typedef +
helper). `index.js` adds
`export { freezeInvocationContext } from "./invocation-context.js";`.

The "drift gate" test design D1 calls out is per-library and self-contained —
**no cross-package import**. Each library's `test/invocation-context.test.js`
runs the same fixture (a fixed `{ data, args, options }` triple including a
multi-value `options.tag = ["a","b"]`) through its own `freezeInvocationContext`
and asserts the same output shape. A small README note in each test file records
that the fixture is intentionally identical across the two libraries and points
to the other file by path so a contributor changing one is prompted to change
the other.

## Step 8 — libcli `createCli` produces an `InvocationContext` (additive)

Amends the handler dispatch so subcommand handlers MAY receive a single `ctx`.
The change is **additive**: existing CLIs (landmark, map, summit, plus pathway's
other consumers) keep their `args: "<usage string>"` definitions and their
manual `parse() → { values, positionals }` flow with **zero change**. New
behaviour kicks in only when both (a) the subcommand definition supplies
`args: string[]` and a `handler: (ctx) => …` field, and (b) the host calls the
new `Cli.dispatch(parsed, { data })` method instead of unpacking
`parsed.positionals`/`parsed.values` itself.

| Action   | Path                                |
| -------- | ----------------------------------- |
| Modified | `libraries/libcli/src/cli.js`       |
| Modified | `libraries/libcli/src/help.js`      |
| Modified | `libraries/libcli/test/cli.test.js` |

Subcommand definition gains two new optional fields (kept side-by-side with the
legacy ones):

```js
{
  name: "skill",
  args: ["id"],                        // NEW: array of declared positional names — opt-in
  argsUsage: "[<id>]",                 // legacy free-form usage string for help output
  // (definitions may carry either `args: string[]` + `argsUsage`, or the legacy
  // `args: "<usage>"` string alone — both shapes coexist after this commit)
  description: "Show skill",
  options: { validate: { type: "boolean" } },
  handler: (ctx) => runSkillCommand(ctx),  // NEW: optional, required only if host calls dispatch()
}
```

`help.js` is updated to read `argsUsage` when `args` is an array, and to keep
reading `args` directly when it is a string. Pathway's `bin/fit-pathway.js`
adopts the new shape in Part 02 Step 7; landmark/map/summit/etc. remain
untouched.

`Cli` gains a `dispatch(parsed, { data })` method. `createCli` returns the `Cli`
instance unchanged (existing callers keep using `.parse()`):

```js
dispatch(parsed, { data }) {
  const command = this.#findCommand(parsed.positionals);
  if (!command) {
    throw new Error(`${this.#definition.name}: no matching subcommand`);
  }
  if (typeof command.handler !== "function") {
    throw new Error(
      `${this.#definition.name}: subcommand "${command.name}" lacks a handler — ` +
      `dispatch() requires { args: string[], handler: (ctx) => any }`,
    );
  }
  const consumed = command.name.split(" ").length;
  const argv = parsed.positionals.slice(consumed);
  const argNames = Array.isArray(command.args) ? command.args : [];
  const args = Object.fromEntries(
    argNames.map((n, i) => [n, argv[i]]).filter(([, v]) => v !== undefined),
  );
  const ctx = freezeInvocationContext({ data, args, options: parsed.values });
  return command.handler(ctx);
}
```

`#findCommand` already exists at cli.js:112-124 — reuse it.

**Verification:** `bun test libraries/libcli/test/cli.test.js` covers (a)
positional names mapped to argv values, missing trailing positionals omitted
from `args`; (b) legacy string-shaped `args` fields construct without error and
`parse()` still returns `{ values, positionals }` — the existing
`fit-landmark`/`fit-map`/`fit-summit` shapes; (c) `dispatch()` on a definition
without `handler` throws a clear error (no silent fallthrough); (d) handler
receives a frozen `ctx`. Help output:
`bun test libraries/libcli/test/help.test.js` covers both `args: string` and
`args: string[] + argsUsage` rendering.

## Step 9 — Repo-root ESLint rule (libui + libcli only in this part)

Custom rule rejects either legacy handler shape. **Scope in Part 01 is
`libraries/libui/**`+`libraries/libcli/**` only.** Part 02 Step 11 adds
`products/pathway/**` to the rule's `files` array once pathway's migration is
complete; that ordering keeps `bun run lint` (the repo-root
`eslint . --max-warnings 0` script) green at every commit on every branch.

| Action   | Path                                                 |
| -------- | ---------------------------------------------------- |
| Created  | `tools/eslint-rules/no-legacy-handler-shape.js`      |
| Created  | `tools/eslint-rules/index.js`                        |
| Created  | `tools/eslint-rules/no-legacy-handler-shape.test.js` |
| Modified | `eslint.config.js`                                   |

Rule rejects any
`FunctionDeclaration | FunctionExpression | ArrowFunctionExpression` whose first
parameter is either:

- an `ObjectPattern` whose property-name set contains all three of `data`,
  `args`, `options` (CLI-side legacy — extra properties allowed so composite
  handlers e.g. `{ data, args, options, dataDir }` also fire), or
- a non-destructured single `Identifier` named `params` (web-side legacy —
  unconditional, no body inspection; the parameter is the giveaway).

`tools/eslint-rules/index.js` exports a flat-config plugin object:

```js
import noLegacyHandlerShape from "./no-legacy-handler-shape.js";
export default { rules: { "no-legacy-handler-shape": noLegacyHandlerShape } };
```

`eslint.config.js` (currently exports a flat array directly per the repo
convention) gains a new entry:

```js
import localRules from "./tools/eslint-rules/index.js";
// ... existing config blocks ...
{
  files: ["libraries/libui/**/*.js", "libraries/libcli/**/*.js"],
  plugins: { local: localRules },
  rules: { "local/no-legacy-handler-shape": "error" },
}
```

The rule's test file uses `RuleTester` from `eslint`. Test coverage: (a)
`function f({ data, args, options }) {}` → reported; (b)
`function f({ data, args, options, dataDir, templateLoader }) {}` → reported;
(c) `function f(ctx) {}` → clean; (d) `function f(params) {}` → reported; (e)
`function f({ id, name }) {}` → clean (not the matching set).

**Verification:** `bun run lint` (repo root) — green; the rule fires only on new
code introduced in Part 01 inside libui/libcli that mistakenly uses a legacy
shape; pre-migration pathway is **outside the rule's scope** in this part and
unaffected.

## Step 10 — Test-runner wiring for libui

libui has no `test/` directory today. Add one and wire scripts.

| Action   | Path                           |
| -------- | ------------------------------ |
| Modified | `libraries/libui/package.json` |

Add `"test": "bun test test/*.test.js"` to `scripts` (matches libcli's
package.json:38). Tests use `node:test` + `node:assert` (matches libcli's
existing tests). Since libui touches the DOM (command-bar, json-ld-script),
import a minimal DOM via `happy-dom` **only inside the test files that need it**
(`new Window()` then alias `document`/`HTMLElement`); add `happy-dom` to libui's
`devDependencies`. Pure-data tests (invocation-context, route-descriptor,
bound-router with a stubbed `window`) do not need the DOM dep.

**Verification:** `cd libraries/libui && bun test` reports all green.

## Libraries used

`@forwardimpact/libui` (creates new exports; reuses `router-core.js`,
`reactive.js`, `error-boundary.js`, `render.js`), `@forwardimpact/libcli`
(amends `cli.js` and `help.js`, adds `invocation-context.js`), `node:test`,
`node:assert`, `happy-dom` (test-only), `eslint@^10` + `RuleTester` (existing
dev dep at `package.json:50`).

## Risks

- **`happy-dom` API surface.** The two DOM-touching tests should construct
  `Window` per-test (no shared global) so concurrent test runs don't race on
  `document`. The libui `package.json` adds `happy-dom` to `devDependencies` in
  the same commit that adds the first DOM test.
- **`history.replaceState` patching from a library.** The patch in
  `bound-router.start()` must be reversed in `stop()`; if the host calls
  `start()` twice without `stop()`, the patch must detect re-entry and not
  double-wrap. Test asserts the original function is restored after `stop()`
  even after two `start()` calls.
- **`parsePattern` becomes a public-export-by-necessity.** Exporting it from
  `router-core.js` (Step 3) extends the libui surface for an internal helper.
  Mark it `@internal` in JSDoc and re-export from `bound-router.js` rather than
  from `index.js` — keeps the public surface unchanged for external consumers
  but makes the helper reachable inside the package.
- **ESLint plugin discovery in flat-config.** `eslint.config.js` is a flat
  array, not the `defineConfig` API. The plugin object is loaded by direct
  `import` from `tools/eslint-rules/index.js`; ESLint v10's flat config resolves
  it without further configuration.

## Verification (whole part)

- `cd libraries/libui && bun test` — green.
- `cd libraries/libcli && bun test` — green.
- `bun run lint` (repo root, `eslint . --max-warnings 0`) — green; the new
  rule's scope (`libui` + `libcli` only in this part) keeps every other path
  untouched.
- `bun run check` — green.
- Smoke a sibling consumer that did **not** opt into the new shape:
  `bun products/landmark/bin/fit-landmark.js --help` exits 0 (proves Step 8's
  additive amendment did not regress legacy `args: "<usage>"` definitions).
