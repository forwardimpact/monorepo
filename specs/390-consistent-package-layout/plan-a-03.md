# Plan A — Part 03: Services (verification only)

Verify that every service already conforms to the services template — **exactly
two** root-level source files (`index.js` and `server.js`), a `test/` directory,
and (optionally) `proto/` and `src/`. Nothing else.

## Scope

**Verification only. No file changes.** The spec describes services as a uniform
tier with `services/pathway` as the "one outlier" whose `index.js` and
`server.js` "still reference code at the service root rather than at `src/`."
Re-verified against the actual codebase:

- `services/pathway/index.js` line 20 imports **`./src/serialize.js`** — already
  correctly pointing at `src/`. No root-level imports remain.
- `services/pathway/server.js` line 10 imports `./index.js`, which is the
  services-exception root file. This is correct per spec rule 2.
- No stray source files exist at `services/pathway/` root besides `index.js` and
  `server.js`.

The spec inherited a stale observation — somebody already fixed pathway before
the spec landed. Part 03 is therefore a verification-only step that **makes no
file changes**, but it remains in the plan as an explicit gate: Part 01's
permissive layout check must report zero drift for all nine services before Part
04 begins.

## Current state (from research)

| Service          | Root files          | Root subdirs         | Notes                            |
| ---------------- | ------------------- | -------------------- | -------------------------------- |
| services/agent   | index.js, server.js | proto, test          | ✅ conforms                      |
| services/graph   | index.js, server.js | proto, test          | ✅ conforms                      |
| services/llm     | index.js, server.js | proto, test          | ✅ conforms                      |
| services/memory  | index.js, server.js | proto, test          | ✅ conforms                      |
| services/pathway | index.js, server.js | proto, **src**, test | ⚠️ needs pathway fix             |
| services/tool    | index.js, server.js | proto, test          | ✅ conforms                      |
| services/trace   | index.js, server.js | proto, test          | ✅ conforms                      |
| services/vector  | index.js, server.js | proto, test          | ✅ conforms                      |
| services/web     | index.js, server.js | test                 | ✅ conforms (no proto by design) |

`services/web` has no `proto/` — it is an HTTP-only service. This is allowed by
the spec (proto/ is optional); no action required, noted so the Part 01 check
does not flag it.

## Files modified

None. This part is verification-only.

If verification surfaces drift (a stray `.js` file at a service root, an import
from `./<file>.js` where `<file>` is no longer at the root, etc.), fix it in
Part 03 using the cross-cutting recipe in `plan-a.md` and document the surprise
in the commit message. Expected state on a clean main is zero drift.

### Optional documentation touch-up

If `services/pathway/package.json` is missing `src/**` from its `files` field,
add it now — it is published today without a `files` field (npm defaults). This
is a belt-and-braces cleanup, not a correctness issue. Skip if no `files` field
exists at all.

### Other services — verify only

- `services/web` — verify: no root `.js` files besides `index.js` and
  `server.js`; no `proto/` (HTTP-only service, allowed).
- `services/{agent,graph,llm,memory,tool,trace,vector}` — verify: exactly two
  root `.js` files + `proto/` + `test/`.

## Ordering

1. Run `bun run layout` — expect zero drift under `services/*`.
2. Spot-read `services/pathway/index.js` (line 20) and `server.js` (line 10) to
   confirm they already import from `./src/serialize.js` and `./index.js`
   respectively.
3. Spot-read one other service (e.g., `services/graph/`) to confirm the two-file
   root pattern.
4. Run `bun run check` and `bun run test`.
5. Commit only if any optional cleanup was applied; otherwise this part is a
   no-op gate and the plan advances to Part 04.

## Verification

- `bun run layout` reports zero drift under `services/*`.
- `services/pathway/index.js` already imports `./src/serialize.js` (confirmed on
  main at line 20).
- `services/pathway/server.js` already imports `./index.js` (confirmed on main
  at line 10) — correct per the services exception.
- All service tests at repo root pass: `bun run test`.
- `fit-rc start pathway` (spot check, if services are running locally) launches
  without error — the `node --watch services/pathway/server.js` command in
  `config/config.example.json` still resolves because `server.js` is still at
  the service root. **No config change is needed.**

## Risks

1. **The service supervisor uses a fixed path.** `config/config.example.json`
   hardcodes `node --watch services/pathway/server.js` (and the same for every
   other service). Keep `server.js` at the service root exactly as it is — the
   services exception exists precisely because of this hardcoded path. Part 03
   must not introduce any rewrite of `config.json`.

2. **`index.js` and `server.js` are both entry points.** Do not collapse them
   into one file or rename them. `index.js` exports the service class (used by
   the harness); `server.js` is the process entry point (used by the
   supervisor). Both paths are load-bearing.

3. **`services/pathway/src/` existing today is the correct shape, not an
   outlier.** Do not "clean up" by moving `src/serialize.js` back to the root.
   The spec explicitly preserves `src/` for services that need it — `src/` is
   allowed in the services template.

## Deliverable commit

Part 03 is verification-only on a clean main. It usually produces **no commit**
— the plan advances to Part 04 directly after the layout check passes for
`services/*`.

If optional cleanup is applied (e.g., adding `files` to
`services/pathway/package.json`), use:

```
refactor(layout): verify services tier conformance (part 03/08)

Verification step — all nine services already conform to the services
template (two root files, proto/, test/). services/pathway was the
spec's listed outlier but has already been fixed on main: index.js at
line 20 imports ./src/serialize.js and server.js at line 10 imports
./index.js (services exception).

Optional: add src/** to services/pathway/package.json files field.

Part 03 of 08 for spec 390.
```

— Staff Engineer 🛠️
