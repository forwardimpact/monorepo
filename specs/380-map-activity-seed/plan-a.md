# Plan A — Map Activity Seed

Implements spec 380: a single `fit-map activity seed` command that populates the
activity database from synthetic data, plus parser consolidation, DSL
validation, and an integration test.

## Approach

The seed command is a thin orchestrator — it reads local files, uploads them to
Supabase Storage via the existing `storeRaw()` function, then runs the existing
transform and verify pipeline. No new database logic; we reuse the ELT pipeline
end-to-end.

Parser consolidation extracts the duplicated `parseYamlPeople`/`parseCsv` into a
new shared module under `products/map/activity/`. Both the CLI validator and the
Supabase edge function import from it. The shared module avoids Node-only imports
(`fs`) so it works under Deno.

DSL validation is a parse-time check: when `framework.levels` and
`people.distribution` both exist, distribution keys must be a subset of level
IDs.

## Parts

This plan is decomposed into four independently executable parts:

| Part | Scope | Dependencies |
|------|-------|--------------|
| [01](plan-a-01.md) | Parser consolidation | None |
| [02](plan-a-02.md) | DSL distribution key validation | None |
| [03](plan-a-03.md) | `seed` command and `just` targets | Part 01 (uses shared parser) |
| [04](plan-a-04.md) | Integration test | Part 01, 03 |

## Cross-cutting concerns

- **Deno compatibility**: The shared parser module must not import `fs` or other
  Node-only modules. It receives content strings, not file paths. The edge
  function's `deno.json` already maps `yaml` → `npm:yaml@2`, so the bare `yaml`
  import works in both runtimes.
- **Idempotency**: `storeRaw()` already uses `upsert: true`. The transform
  pipeline uses upsert with `onConflict` keys. Running seed twice produces the
  same state.
- **Error reporting**: Follow the existing `{count, errors}` pattern used by all
  transform functions. The seed command collects results from each phase and
  reports them together.

## Open question resolutions

- **Seed in `--help`**: Show the command in help output with a clear description
  that it populates the activity database from synthetic data. No `[internal]`
  label — external users exploring Map should be able to discover and use it.
- **Getting-started documentation**: The spec listed the getting-started
  leadership guide as out of scope, but the seed command is useful for external
  users who want to try the activity layer without real data sources. Part 03
  adds an informational note to `website/docs/getting-started/leadership/` after
  the activity verify section, explaining how to seed with synthetic data.
- **Docker detection**: Use `docker info --format '{{.ID}}' 2>/dev/null` with a
  3-second timeout. Fast, silent on failure, returns exit 1 when Docker daemon is
  not running.
- **Shared parser import path**: The Supabase edge function at
  `supabase/functions/_shared/activity/transform/people.js` imports the shared
  module via a relative path (`../../../../activity/parse-people.js`). The
  `deno.json` already maps `yaml` to `npm:yaml@2`, so the shared module's
  `import { parse } from "yaml"` resolves in both Node and Deno.

## Execution

Parts 01 and 02 are independent — launch as concurrent `staff-engineer`
sub-agents. Part 03 depends on 01 (the seed command uses the shared parser to
validate the roster locally before uploading). Part 04 depends on 01 and 03.

```
01 ──┐
     ├── 03 ── 04
02 ──┘
```

All parts are `staff-engineer` work (code and infrastructure). The operations
doc update in part 03 is minimal (adding a `seed` entry to the existing activity
section) and does not need a separate documentation agent.
