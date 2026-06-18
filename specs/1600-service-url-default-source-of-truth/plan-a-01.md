# Plan 1600 — Part 01: Gate infrastructure

Build the registry, the expected-URL helper, the rule module, the audit script,
and the rule-module unit test. After this part the gate exists and runs; it will
report disagreements until Parts 02–03 land (expected).

Libraries used: libcoaligned (`lib/ast.mjs`, `lib/rg.mjs`), libconfig
(derivation reference), yaml.

## Step 1 — Registry file

Intent: declare each in-scope service's manifest module and per-surface consumer
locations.

Files created: `.coaligned/invariants/service-url-drift.registry.yml`

Shape (one entry per service; `manifest` is the file the producer AST-parses,
`consumers` lists each surface with a path and a `kind` the rule module knows
how to locate):

```yaml
# Each service's listen URL is declared in its createServiceConfig manifest
# (protocol+port; host stays the bind-default 0.0.0.0). Consumers restate it.
services:
  mcp:
    manifest: services/mcp/server.js
    consumers:
      - { kind: env, path: .env.local.example }
      - { kind: env, path: .env.docker-native.example }
      - { kind: env, path: .env.docker-supabase.example }
      - { kind: init, path: products/guide/src/commands/init.js }
      - { kind: docs, path: websites/fit/docs/services/typed-contracts/index.md }
  trace:
    manifest: services/trace/server.js
    consumers:
      - { kind: env, path: .env.local.example }
      # … docker-native, docker-supabase
  # … one block per in-scope service (Part 02 populates the full set from the
  #   live tree). docker-host rows that use a deployment hostname
  #   (embedding.local) are NOT listed — they are a deployment-host exception.
```

The `kind` values are `env` (`SERVICE_<NAME>_URL=` line, commented or not),
`init` (`SERVICE_<NAME>_URL:` object literal), `docs` (URLs/`curl` hosts on the
page). A `docs` consumer additionally carries a `pattern` field — a regex the
rule module hands to `rgMatches` (with `onlyMatching: true`) to pin the exact
restated URL on the page (e.g. `http://localhost:\d+` near a `curl`/`new URL`),
so only structurally anchored restatements are asserted, never free prose. The
full per-service consumer set is populated in Part 03 once the canonical values
are fixed; Part 01 seeds `mcp` and `trace` as worked examples.

Verification: `node -e "import('yaml').then(y=>y.parse(require('fs').readFileSync('.coaligned/invariants/service-url-drift.registry.yml','utf8')))"`
exits 0 (the `yaml` package, already a root dependency, is what the rule module
uses at runtime — `import { parse } from "yaml"`, per `ambient-deps.rules.mjs`).

## Step 2 — Expected-URL helper

Intent: one place that statically extracts a service's `createServiceConfig`
defaults and replays libconfig's derivation to produce the expected URL.

Files created: `.coaligned/invariants/lib/expected-url.mjs`

Concrete change:

- Export `expectedUrl(root, manifestPath, serviceName)`: resolve `manifestPath`
  against `root` and read it with node `fs` (matching the host's `{ root }`
  contract and `model-defaults`' own `fs`/`import` style — no injected `fs`
  param); `parseModule` (from `./ast.mjs`), `walkAst` to find the
  `CallExpression` whose callee is `createServiceConfig` and whose first arg
  string literal === `serviceName`. Read the second arg `ObjectExpression`
  properties `protocol`/`host`/`port`/`path` (string/number literals only).
  **The second arg may be absent** (`trace`/`vector`/`graph`/`map`/`tenancy`
  call `createServiceConfig("<name>")` with no defaults) — treat that as an
  empty defaults object.
- Apply libconfig's derivation exactly (`config.js:150-154`): default
  `protocol`→`"grpc"`, `host`→`"0.0.0.0"`, `port`→`3000`, `path`→`""`; return
  `` `${protocol}://${host}:${port}${path}` ``.
- Export `normalizeHost(host, serviceName)`: collapse `0.0.0.0`, `localhost`,
  `127.0.0.1`, and `${serviceName}.guide.local` to the single token `localhost`
  (matching `librpc/src/client.js:54-57`); leave any other host unchanged.
- Export `urlsEqual(a, b, serviceName)`: parse both with `new URL`, compare
  `protocol`, `port`, and `normalizeHost(hostname)`.
- Throw a named error if the `createServiceConfig` second arg is present but is
  not a static object literal (so Part 02 can detect a computed-defaults
  service).

Verification (Part-01-local): the Step 5 unit test exercises `expectedUrl`
against fixture manifests (absent-arg, `port`-only, `protocol`+`port`) and
`urlsEqual` across `0.0.0.0`/`localhost`/`127.0.0.1`/`<name>.guide.local`. The
real-tree `grpc://0.0.0.0:3001` assertion for `trace` is a Part-02 verification,
not a Part-01 gate.

## Step 3 — Rule module

Intent: the gate that fails CI on any consumer disagreement.

Files created: `.coaligned/invariants/service-url-drift.rules.mjs`

Concrete change — default export `{ name, build, rules }`:

- `name: "service-url-drift"`.
- `build({ root, runtime })`: load the registry (`import { parse } from "yaml"`
  + node `fs`), and for each service compute `expectedUrl(root, manifest,
  name)`. For each consumer, locate every restated URL with `rgMatches` (from
  `./lib/rg.mjs`, `onlyMatching: true`) using a per-`kind` pattern that matches
  the **value** (e.g. `(?<=SERVICE_<NAME>_URL[=:]\s*"?)\S+?(?="?$)` for
  env/init, the consumer's `pattern` for docs) so the returned `text` IS the
  restated URL — `rgMatches` exposes no capture groups, only `{ path, lineNo,
  text }`, so the pattern must isolate the value itself. Produce subjects
  `{ service, path, lineNo, restated: m.text, expected }`. Return
  `{ subjects: { "url-restatement": [...] } }`.
- `rules: [{ id: "service-url.drift", scope: "url-restatement",
  severity: "fail", check: (s) => urlsEqual(s.restated, s.expected, s.service)
  ? null : { restated: s.restated }, message: (s) =>
  `${s.service}: ${s.path}:${s.lineNo} restates ${s.restated}, expected ${s.expected}`,
  hint: "align the consumer to the service's createServiceConfig URL or update the manifest" }]`.
- `seed`: omitted — the audit is a standalone script (Step 4), keeping the gate
  and the audit independent per success-criterion 2.

Verification: `bunx coaligned invariants` discovers and runs the module (it
appears in the run; failures are expected until Parts 02–03).

## Step 4 — Audit script

Intent: success-criterion 2's independent table, not sharing the rules'
assertion code.

Files created: `scripts/audit-service-urls.mjs`

Concrete change: read the same registry, call `expectedUrl` per service, locate
each consumer's restated value with its own small reader, and print a
`service → path → restated → expected` table plus a trailing count of rows
where `restated ≠ expected` (using `urlsEqual`). Exit 0 always — it reports, it
does not gate.

Verification: `node scripts/audit-service-urls.mjs` prints the table; after Part
03 the mismatch count is 0.

## Step 5 — Rule-module unit test

Intent: lock the gate's behaviour (criteria 3–5 shapes).

Files created: `.coaligned/invariants/test/service-url-drift.test.mjs`

Concrete change: fixture manifests + a fixture registry; assert (a) a matching
consumer yields no finding; (b) a wrong-URL consumer yields a finding naming
service/path/restated/expected (criterion 3); (c) a manifest change with a
stale consumer yields findings for each stale consumer (criterion 4); (d) a
new fixture registry row with a seeded disagreement yields a finding identical
in shape (criterion 5); (e) `urlsEqual` sees through `0.0.0.0`/`localhost`.

Verification: `bun test .coaligned/invariants/test/service-url-drift.test.mjs`
passes.
