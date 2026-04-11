# Plan A — Part 03: Services

Bring every service into conformance with the services template: **exactly
two** root-level source files (`index.js` and `server.js`), a `test/`
directory, and (optionally) `proto/` and `src/`. Nothing else.

## Scope

Only `services/pathway` has real work — the spec's sole service outlier. The
other eight services already conform. This part also documents the services
exception explicitly (the CLAUDE.md contract update itself happens in Part
08, but the behaviour is already in place after Part 03).

## Current state (from research)

| Service           | Root files                      | Root subdirs             | Notes |
| ----------------- | ------------------------------- | ------------------------ | ----- |
| services/agent    | index.js, server.js             | proto, test              | ✅ conforms |
| services/graph    | index.js, server.js             | proto, test              | ✅ conforms |
| services/llm      | index.js, server.js             | proto, test              | ✅ conforms |
| services/memory   | index.js, server.js             | proto, test              | ✅ conforms |
| services/pathway  | index.js, server.js             | proto, **src**, test     | ⚠️ needs pathway fix |
| services/tool     | index.js, server.js             | proto, test              | ✅ conforms |
| services/trace    | index.js, server.js             | proto, test              | ✅ conforms |
| services/vector   | index.js, server.js             | proto, test              | ✅ conforms |
| services/web      | index.js, server.js             | test                     | ✅ conforms (no proto by design) |

`services/web` has no `proto/` — it is an HTTP-only service. This is allowed
by the spec (proto/ is optional); no action required, noted so the Part 01
check does not flag it.

## Files modified

### services/pathway

The spec states:

> The pathway service is the one outlier in the services tier — it has
> already grown a lone `src/serialize.js` alongside the usual `index.js` and
> `server.js`. Under the new rules that is correct shape, but the service's
> `index.js` and `server.js` still reference code at the service root rather
> than at `src/`. Make the service match the services template exactly: root
> files load from `./src/...` and any stray source file at the service root
> moves into `src/`.

**Step 1: inspect.** Read these files to confirm current state:

- `services/pathway/index.js`
- `services/pathway/server.js`
- `services/pathway/src/serialize.js`

Look specifically for:

- Any import in `index.js` or `server.js` that reaches into the service root
  for helpers (e.g., `import { foo } from "./helpers.js"` where
  `helpers.js` sits at the service root — which would be a stray root source
  file).
- Any direct import of `./serialize.js` in `index.js` — this would be the
  import path that needs to become `./src/serialize.js`.

**Step 2: move any stray root source files into `src/`.** The inventory
shows `index.js` and `server.js` only at the root, but the spec hints at
"any stray source file at the service root moves into `src/`". Read the
directory again at execution time; if extra files exist, move them.

**Step 3: fix imports.** In `index.js` and `server.js`, rewrite any import
that currently points at `./<file>.js` (service root) to `./src/<file>.js`.
The two fixed-path files themselves stay at the root.

**Step 4: update `services/pathway/package.json`:** add `src/` to `files` if
not already present. The `main` field stays as `"./index.js"` because
`index.js` is at the service root (services exception).

**Step 5: run `bun run node --test services/pathway/test/*.test.js`.**

### services/web — no action, but verify

Confirm `services/web` has no root source files besides `index.js` and
`server.js`. The spec's rule applies to every service; web has no `proto/`
which is allowed.

### Other services — no action

`services/agent`, `graph`, `llm`, `memory`, `tool`, `trace`, `vector` already
conform. Touch them only if the layout check reports drift — otherwise leave
them alone.

## Ordering

1. Read the three `services/pathway/` files to confirm import targets.
2. Read each other service directory to confirm conformance (use
   `bun run layout` as a quick audit).
3. Fix `services/pathway/index.js` and `server.js` imports.
4. If any stray source file exists at a service root, move it to `src/`.
5. Run `bun run node --test services/pathway/test/*.test.js`.
6. Run `bun run layout` — services should no longer report any drift.
7. Run `bun run check` and `bun run test`.
8. Commit.

## Verification

- `services/pathway/index.js` and `server.js` import all non-trivial helpers
  from `./src/...`.
- `bun run layout` reports zero drift under `services/*`.
- `bun run node --test services/pathway/test/*.test.js` passes.
- All service tests at repo root pass: `bun run test`.
- `fit-rc start pathway` (spot check) launches the service without error —
  the `node --watch services/pathway/server.js` command in
  `config/config.example.json` still resolves because `server.js` is still
  at the service root. **No config change is needed.**

## Risks

1. **The service supervisor uses a fixed path.** `config/config.example.json`
   hardcodes `node --watch services/pathway/server.js` (and the same for
   every other service). Keep `server.js` at the service root exactly as it
   is — the services exception exists precisely because of this hardcoded
   path. Part 03 must not introduce any rewrite of `config.json`.

2. **`index.js` and `server.js` are both entry points.** Do not collapse them
   into one file or rename them. `index.js` exports the service class (used
   by the harness); `server.js` is the process entry point (used by the
   supervisor). Both paths are load-bearing.

3. **`services/pathway/src/` existing today is the correct shape, not an
   outlier.** Do not "clean up" by moving `src/serialize.js` back to the
   root. The spec explicitly preserves `src/` for services that need it —
   `src/` is allowed in the services template.

## Deliverable commit

```
refactor(layout): fix services/pathway imports to src/ (part 03/08)

services/pathway has the correct shape (index.js, server.js at root +
src/ for other source files) but the root files still import from ./
instead of ./src/. This rewrites those imports and brings pathway into
full conformance with the services template.

All other services already conform — no other changes.

Part 03 of 08 for spec 390.
```

— Staff Engineer 🛠️
