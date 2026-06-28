# Plan 1600 — Part 03: Consumer sweep and activation

Align the divergent consumer surfaces to the canonical scheme, populate the
registry's full consumer set, and confirm the gate's first run is green.
Depends on Parts 01 (helper, rule module, registry skeleton) and 02 (manifest
declarations).

Libraries used: none.

## Step 1 — Sweep `init.js`

Intent: bring the bootstrap CLI env block onto the canonical scheme.

Files modified: `products/guide/src/commands/init.js`.

Concrete change (the `env:` block, lines ~52-59): correct the diverging values
to the canonical table — `SERVICE_PATHWAY_URL` `3004`→`3005`, `SERVICE_MAP_URL`
`3006`→`3004`, `SERVICE_MCP_URL` `3005`→`3011`, `SERVICE_EMBEDDING_URL`
`3007`→`3015`. `init.js` writes a deliberate 7-service core subset (trace,
vector, graph, pathway, map, mcp, embedding); **do not add the other eight** —
instead scope the registry's `init` consumer rows to exactly those seven
services (Step 4), so the gate asserts only the URLs init actually writes and
no `init` locator misses.

Verification: `node scripts/audit-service-urls.mjs` shows zero mismatches on the
seven `init` rows; `bun test products/guide` passes.

## Step 2 — Sweep the MCP `typed-contracts` docs

Intent: the docs page advertises `3008` for MCP; canonical MCP is `3011`.

Files modified: `websites/fit/docs/services/typed-contracts/index.md`.

Concrete change: replace the three MCP-URL restatements with `3011` —
`curl http://localhost:3008/health` (`:118`) and
`new URL("http://localhost:3008")` (`:137`) are code-block/`curl` forms the gate
asserts via the `docs` consumer's `pattern` (e.g. `http://localhost:\d+`
scoped to this page); the prose "listens on port 3008 by default" line (`:114`)
is free-prose (spec § Excluded — sentence form, no parseable anchor), so it is
**not** registered but is corrected by hand for consistency.

Verification: `node scripts/audit-service-urls.mjs` shows zero mismatches on the
`docs` rows.

## Step 2b — Sweep the embedding `internals/vectors` docs

Intent: `websites/fit/docs/internals/vectors/index.md:79-80` states the
embedding gRPC server "listens on `SERVICE_EMBEDDING_URL` (default
`grpc://localhost:3015`)" — the spec's named recurrence evidence (PR #1318 →

## 1454 drifted this exact value). It already reads `3015` (canonical), so this is

a register-don't-churn step: add it as an embedding `docs` consumer so the gate
protects it going forward.

Files modified: none (value already canonical); the registry entry lands in
Step 4.

Concrete change: in Step 4, add an embedding `docs` consumer
`{ kind: docs, path: websites/fit/docs/internals/vectors/index.md, pattern:
"grpc://localhost:\\d+" }`. The TEI backend port `8090` (`:80`, `:93`, `:169`)
is the embedding backend, not `SERVICE_EMBEDDING_URL`, and is not matched.

Verification: `node scripts/audit-service-urls.mjs` shows the embedding
`internals/vectors` row at `restated == expected` (zero mismatch).

### Step 3 — Confirm the three env files

Intent: the `.env.*.example` files already use the canonical scheme
(`trace` 3001 … `embedding` 3015); confirm, do not churn.

Files modified: none expected. The `docker-native`/`docker-supabase` embedding
row uses `grpc://embedding.local:3015` (deployment hostname); this row is a
deployment-host exception and is NOT a registry consumer (registry comment
records why), so it is not swept.

Verification: `node scripts/audit-service-urls.mjs` shows zero mismatches on
every `env` row that is in the registry.

### Step 4 — Populate the full registry

Intent: expand the Part 01 registry skeleton (`mcp`, `trace`) to every in-scope
service with its complete on-disk consumer set.

Files modified: `.coaligned/invariants/service-url-drift.registry.yml`.

Concrete change: add a block per service from the canonical table, listing only
the consumer surfaces that service actually has on disk:

- every service: its in-registry `.env.*.example` rows (the `embedding.local`
  docker-host rows excluded as a deployment-host exception);
- `init` rows for exactly the seven services init writes (trace, vector, graph,
  pathway, map, mcp, embedding);
- `docs` rows for mcp (`typed-contracts`, code-block/`curl` URLs) and embedding
  (`internals/vectors`, the `grpc://localhost:\d+` line).
Read the live tree to confirm each service's exact surface set.

Verification: registry parses; the rule module's `build()` runs over every row
without a locator miss.

### Step 5 — Activation: green first run

Intent: success-criterion 6 — the gate passes on every registered row.

Files modified: none.

Concrete change: run the full gate.

Verification:

- `bunx coaligned invariants` is green (the `service-url-drift` module reports
  no findings).
- `node scripts/audit-service-urls.mjs` prints `0` mismatches.
- `bun run check` passes (format, lint, jsdoc, invariants, context, wiki as the
  environment allows).
- Manual criteria 3/4/5 spot-check: temporarily edit one consumer to a wrong
  URL and confirm `bunx coaligned invariants` fails naming the service, file,
  restated, and expected; revert.
