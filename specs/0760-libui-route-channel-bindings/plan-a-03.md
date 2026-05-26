# Plan 0760-a-03 — Catalog and library guide

Spec: [`spec.md`](spec.md). Design: [`design-a.md`](design-a.md). Overview:
[`plan-a.md`](plan-a.md). Depends on Part 02 (`plan-a-02.md`) being on `main`.

Updates the libraries catalog and ships the external library guide for the new
capability. No source files in `libraries/libui/` or `libraries/libcli/` change;
this is metadata + documentation.

## Step 1 — `forwardimpact.needs` entry on libui

Adds the design's chosen phrase (D11).

| Action   | Path                           |
| -------- | ------------------------------ |
| Modified | `libraries/libui/package.json` |

In `forwardimpact.needs`, append the new entry alongside the existing one:

```json
"forwardimpact": {
  "capability": "agent-capability",
  "needs": [
    "Build a reactive single-page web app",
    "Bind a web route to its CLI command and graph entity"
  ]
}
```

**Verification:** `bun run context:fix` runs without "duplicate need" error (the
actual catalog generator command — `package.json:42` runs
`bun scripts/check-metadata.mjs --fix && bun scripts/check-catalog.mjs --fix`;
`libraries/CLAUDE.md`'s reference to `bun run lib:fix` is documentation drift
the implementer flags as a follow-up but does not fix in this PR).

## Step 2 — Regenerate the catalog

Catalog regeneration is mechanical; the change must land in this commit so
`bun run check` stays green.

| Action   | Path                  |
| -------- | --------------------- |
| Modified | `libraries/README.md` |

Run from the repo root:

```sh
bun run context:fix
```

The libui row in `libraries/README.md` updates to carry the new entry in the
flat index. `bun run check` (which runs `context:catalog`) verifies.

**Verification:** `git diff libraries/README.md` shows only the libui row
change; `bun run check` passes.

## Step 3 — libui README getting-started snippet

`libraries/libui/README.md` exists today (5 lines, with a `createRouter` import
in the getting-started snippet). Modify it to show the descriptor registration
form alongside the existing `createRouter` snippet — the existing snippet stays
for products that have not opted into bindings.

| Action   | Path                        |
| -------- | --------------------------- |
| Modified | `libraries/libui/README.md` |

Replace the existing single getting-started snippet with two named sub-sections
— "Reactive web app (no bindings)" keeps today's `createRouter` snippet
verbatim; "Route↔CLI↔graph bindings" adds the new shape. Body sketch for the new
sub-section (~30 lines):

````md
## Route↔CLI↔graph bindings (opt-in)

```js
import {
  createBoundRouter, defineRoute, createCommandBar,
  createJsonLdScript, freezeInvocationContext,
} from "@forwardimpact/libui";

const router = createBoundRouter({
  data: appData,
  vocabularyBase: "https://example.invalid/schema/rdf/",
});

router.register(defineRoute({
  pattern: "/skill/:id",
  page: (ctx, { vocabularyBase }) => {
    const view = present(ctx);
    mount(view.dom);
    document.head.appendChild(
      createJsonLdScript(graphSkill, ctx, view.body, { vocabularyBase })
    );
  },
  cli: (ctx) => `npx fit-pathway skill ${ctx.args.id}`,
  graph: (ctx, base) => `${base}Skill/${ctx.args.id}`,
}));

createCommandBar(router, { mountInto: document.getElementById("cli-bar") });
router.start();
```

See the [Web ↔ CLI ↔ graph bindings guide](https://www.forwardimpact.team/docs/libraries/web-cli-graph-bindings/index.md) for the full contract and the `InvocationContext` shape.
````

**Verification:** `bun run check` passes; the new sub-section's only outbound
link is the fully-qualified guide URL (matches `libraries/CLAUDE.md` audience
rule).

## Step 4 — External library guide

Adds the spec's required guide under
`websites/fit/docs/libraries/web-cli-graph-bindings/index.md`. Slug is fixed by
design D10.

| Action  | Path                                                          |
| ------- | ------------------------------------------------------------- |
| Created | `websites/fit/docs/libraries/web-cli-graph-bindings/index.md` |

Body covers, in order:

1. **What this is.** One paragraph naming the route↔CLI↔graph triangle and the
   `InvocationContext` it produces.
2. **The contract.** The verbatim `InvocationContext` JSDoc from spec § 1 plus
   the three invariants and the handler signature.
3. **Three channels.** Pages / CLI / Graph table from spec § 2 with role and
   absence behaviour for each.
4. **End-to-end example.** A Landmark- or Summit-style author registers one
   route with all three channels; shows `defineRoute`, `createBoundRouter`,
   `createCommandBar`, `createJsonLdScript` together.
5. **CLI side.** `createCli` definition with `args: ["id"]` and a handler taking
   `(ctx)` calling the same shared presenter the page calls.
6. **`vocabularyBase`.** One paragraph: where it is set (`createBoundRouter`),
   how it reaches the `graph` formatter, why the host reads `RDF_PREFIXES.fit`
   from `@forwardimpact/libgraph` rather than hardcoding.

Front-matter (matches existing guides' style):

```md
---
title: Web ↔ CLI ↔ graph bindings
description: Bind a web route to its CLI command and graph entity using @forwardimpact/libui's bound router and @forwardimpact/libcli's handler contract.
---
```

**Verification:** the guide renders in `bun run dev:website`; `bun run check`
passes (link checker runs).

## Libraries used

`@forwardimpact/libui` (referenced from the guide), `@forwardimpact/libcli`
(referenced), `@forwardimpact/libgraph` (referenced). No new code.

## Risks

- **Catalog regen drift.** `bun run context:fix` re-sorts the flat index. If the
  rerun changes any unrelated row, treat it as a separate concern — open a
  follow-up issue rather than absorbing the diff into this PR.
- **Guide title collision.** Confirm no existing guide carries "Web ↔ CLI ↔
  graph bindings" or a near variant before committing the front-matter.
- **`libraries/CLAUDE.md` script-name drift.** That file references
  `bun run lib:fix`, which does not exist in `package.json` (the actual command
  is `bun run context:fix`). The plan does not fix that drift in this PR; the
  implementer files a follow-up issue instead so the catalog/library policy doc
  and the actual scripts stay coupled.

## Verification (whole part)

- `bun run context:fix && bun run check` — green.
- The new guide is reachable from the libui README's hyperlink (Step 3) and from
  the catalog row in `libraries/README.md` (Step 2).
