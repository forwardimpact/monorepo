# Plan 2200-a: Rename `svctrace` to `svcspan`

Implements [spec.md](spec.md) per [design-a.md](design-a.md).

## Approach

Do every hand edit first — the proto and service surface (Step 1), the coupled
shared-library references (Step 2), the consumers/orchestration/config (Step 3),
and the docs (Step 4) — so that when the single regeneration gate (Step 5:
`bun install` → `just codegen` → `bun run context:fix`) runs, every
`package.json` name and dependency already agrees. The gate rewrites the
gitignored generated trees and the generated catalog rows from the renamed proto
and metadata; the proto filename drives their `span/` subdirectory and the proto
`package span` / `service Span` drive the `Span*` symbol names. The generated
trees are never hand-edited. Verification (Step 6) is the spec's `--hidden` sweep
set plus the four affected test suites — no behaviour changes, so a green rename
is a correct rename.

Libraries used: none (rename only).

## Step 1: Rename the proto and service surface by hand

Move the directory and proto, and rewrite the service's own identifiers. The
proto is the source that drives regeneration in Step 5.

Files:

- Moved: `services/trace/` → `services/span/`;
  `services/span/proto/trace.proto` → `services/span/proto/span.proto`;
  `services/span/test/trace.test.js` → `services/span/test/span.test.js`
- Modified: `services/span/proto/span.proto`, `services/span/package.json`,
  `services/span/index.js`, `services/span/server.js`,
  `services/span/README.md`, `services/span/test/span.test.js`,
  `services/span/test/bin-smoke.integration.test.js`

```sh
git mv services/trace services/span
git mv services/span/proto/trace.proto services/span/proto/span.proto
git mv services/span/test/trace.test.js services/span/test/span.test.js
```

| File | From | To |
| --- | --- | --- |
| `proto/span.proto` | `package trace;` · `service Trace {` | `package span;` · `service Span {` |
| `package.json` | `name` `@forwardimpact/svctrace`; `bin` `fit-svctrace`; `repository.directory` `services/trace`; `keywords[0]` `"trace"`; all three `jobs[]` fields wording "trace" — `bigHire` "collect trace spans", `trigger` "store and compare trace spans" (24), `competesWith` "per-product trace files" (27) | `@forwardimpact/svcspan`; `fit-svcspan`; `services/span`; drop the `"trace"` keyword (leaves `opentelemetry`/`spans`/`grpc`/`agent` — avoids a `span`/`spans` pair); jobs span-worded ("collect spans", "store and compare spans", "per-product span files"); leave `description` (already "span ingestion") |
| `index.js` | `const { TraceBase } = services` (line 4); `TraceService`, `class TraceService extends TraceBase`; "Trace service" identity prose in the class/JSDoc comments (lines 7, 13, 14); every `.trace.*` JSDoc namespace ref — `.trace.Span` (27), `.trace.RecordSpanResponse` (28), `.trace.QueryRequest` (40), `.trace.QueryResponse` (41) | `const { SpanBase } = services`; `SpanService extends SpanBase`; "Span service"; `.span.Span`, correct the typo to `.span.RecordResponse`, `.span.QueryRequest`, `.span.QueryResponse` |
| `server.js` | `import { TraceService }`; `name: "fit-svctrace"`; `description: "Trace index gRPC service"` (15); `createServiceConfig("trace", …)`; `createStorage("traces")`; `traceStorage` local (28, 31) + "Initialize storage for traces" / "Create trace index" comments (27, 30) | `SpanService`; `"fit-svcspan"`; `"Span index gRPC service"`; `createServiceConfig("span", …)`; `createStorage("spans")`; `spanStorage` + span-worded comments |
| `README.md` | `# Trace Service`; `bun services/trace/server.js` | `# Span Service`; `bun services/span/server.js` |
| `test/span.test.js` | `import { TraceService }`; `import { trace }`; `createMockConfig("trace")`; `describe("trace service"`; every `trace.Span` / `trace.Code` | `SpanService`; `import { span }`; `createMockConfig("span")`; `"span service"`; `span.Span` / `span.Code` |
| `test/bin-smoke…js` | `describe("fit-svctrace bin smoke"` | `"fit-svcspan bin smoke"` |

Keep: `TraceIndex` (imported from libtelemetry, hand-written OTel class) and its
instance local `traceIndex` (the `index.js` constructor param and the `server.js`
local), `trace_id` field, and test data strings (`trace123`). `index.js` keeps
its `#index` field. The storage-bucket local follows the bucket rename:
`traceStorage`→`spanStorage`.

Verify: `rg 'package span;|service Span' services/span/proto/span.proto` matches;
`test ! -d services/trace && test -d services/span`.

## Step 2: Move the coupled shared-library references

The fourth zone is the crux (design-a.md § "The fourth zone"). Reference,
string, comment, and JSDoc moves only. **Two rules apply to every row and
override the kept-class exception:**

1. **Kept classes still shed the client-instance identifier.** `Tracer`,
   `TraceIndex`, `TraceVisualizer`, and `Span` keep their names, but their
   internal `traceClient` field/param/key and `traceConfig` local move to the
   `spanClient` / `spanConfig` form — the spec's `traceClient`/`traceConfig`
   sweep (spec.md:141) must reach zero.
2. **A namespace rename moves every `trace.` reference, not just imports.**
   Renaming `import { trace }`→`{ span }` from libtype forces every `.trace.*`
   JSDoc **and** every runtime `trace.Span` / `trace.Code` / `trace.Kind` in the
   same file to `span.*`, or the module throws at runtime. Keep the OTel
   vocabulary: `trace_id`, `span_id`, the class names above, the
   `index/trace.js` filename, the `--trace` flag, and distributed-tracing prose
   (trace context, trace ID, stack trace). Rename service-identity prose
   ("Trace service" / "the trace service") to the span form.

After editing each file, `rg -n 'trace|Trace' <file>` and confirm every
remaining hit is a kept OTel term above — the per-file cells below are the
complete site list, not a sample.

| File | From | To |
| --- | --- | --- |
| `libraries/librpc/src/index.js` | `createServiceConfig("trace")`; `const { TraceClient } = clients`; `const traceConfig`; `new TraceClient(traceConfig, …)`; `const traceClient`; the `TraceClient` mention in the comment (35) and "trace service configuration" JSDoc (29) | `createServiceConfig("span")`; `const { SpanClient }`; `spanConfig`; `new SpanClient(spanConfig, …)`; `spanClient`; span-worded comment + JSDoc (keep `Tracer` import/return, `Span` in the comment) |
| `libraries/libtype/src/index.js` | destructure `trace = {}` (19); re-export `trace,` (179) | `span = {}`; `span,` |
| `libraries/libtype/README.md` | import example lists `trace` namespace (13) | `span` |
| `libraries/libtelemetry/src/tracer.js` | `#traceClient` (11); `traceClient` param (25) + guard (27) + assignment (32); `traceClient:` threaded into `Span` (65); "Trace service client" JSDoc (20) | `#spanClient`, `spanClient`, `spanClient:`, "Span service client" (keep `class Tracer`, `serviceName`, `grpcMetadata`, `clock`) |
| `libraries/libtelemetry/src/span.js` | `import { trace }` (1); runtime `trace.Code` (72, 106, 117) + `trace.Span.fromObject` (128); `#traceClient` (34); `traceClient` param (57) + assignment (74); `this.#traceClient.RecordSpan` (129); "Trace service client" (46) + "sends it to trace service" (122) JSDoc | `import { span }`; `span.Code` / `span.Span.fromObject`; `#spanClient`; `spanClient`; `this.#spanClient.RecordSpan`; span-worded JSDoc (keep `class Span`, `trace_id`, `span_id`) |
| `libraries/libtelemetry/src/visualizer.js` | `import { trace }` (1); runtime `trace.Kind` (112, 227, 260) + `trace.Code` (192, 194, 195); all `.trace.Span` JSDoc | `import { span }`; `span.Kind` / `span.Code`; `.span.Span` (keep class `TraceVisualizer`, `trace_id`, trace-grouping prose) |
| `libraries/libtelemetry/src/index/trace.js` | `import { trace }` (3); runtime `trace.Span.fromObject` (32); all `.trace.Span` JSDoc | `import { span }`; `span.Span.fromObject`; `.span.Span` (keep `class TraceIndex`, filename, `trace_id`) |
| `libraries/libtelemetry/bin/fit-visualize.js` | `createStorage("traces")` + `traceStorage` local (105) | `createStorage("spans")`, `spanStorage` (keep `state.traceIndex` as a `TraceIndex` instance, `--trace` flag, `values.trace`, `trace_id` output) |
| `libraries/libtelemetry/test/*.test.js` | `import { trace }` + `trace.Span`/`trace.Code`/`trace.Kind` in `index-core`, `index-resource`, `visualizer-attributes`, `visualizer-basics`, `visualizer-timeline`, `visualizer-edge-cases-basic`, `visualizer-edge-cases-complex`; `mockTraceClient` + `traceClient:` key in `tracer.test.js` (39/42/93/96/126/129) and `error.test.js` (8/38/73/103/141/171/198/228) | `import { span }`; `span.Span`/`span.Code`/`span.Kind`; `mockSpanClient`; `spanClient:` |
| `libraries/libmock/src/mock/clients.js` | `createMockTraceClient`; "mock trace client" JSDoc | `createMockSpanClient`; "mock span client" |
| `libraries/libmock/src/mock/index.js` | export `createMockTraceClient` (21) | `createMockSpanClient` (keep `createMockTracer`, 12) |

Verify (after Step 5 regenerates the symbols these reference):
`rg --hidden $X 'TraceClient|traceClient|traceConfig|createMockTraceClient'` →
no output; `rg 'createMockTracer|class Tracer|class TraceIndex|class TraceVisualizer'`
still matches; the libtelemetry suite (Step 6) resolves `span` from libtype.

## Step 3: Update consumers, orchestration, and config

Config key `trace`→`span` moves in every consumer at once (clean break — no
alias). The `package.json` dependency renames here must land before the Step 5
`bun install`, so this step precedes the regeneration gate.

| File | From | To |
| --- | --- | --- |
| `products/guide/package.json` | dep `@forwardimpact/svctrace` (72) | `@forwardimpact/svcspan` |
| `products/gear/package.json` | dep `@forwardimpact/svctrace` (43) | `@forwardimpact/svcspan` |
| `products/guide/src/lib/status.js` | `SERVICE_NAMES = ["trace", …]`; `GRPC_SERVICES = ["trace", …]` | `"span"` in both arrays |
| `products/guide/test/status.test.js` | mock config `trace:` block, `name: "trace"` | `span:`, `name: "span"` |
| `products/guide/src/commands/init.js` | `SERVICE_TRACE_URL: "grpc://localhost:3001"` | `SERVICE_SPAN_URL: …` |
| `products/guide/test/init.integration.test.js` | `"SERVICE_TRACE_URL"` | `"SERVICE_SPAN_URL"` |
| `.env.local.example`, `.env.docker-native.example`, `.env.docker-supabase.example` | `SERVICE_TRACE_URL=…` | `SERVICE_SPAN_URL=…` |
| `docker-compose.yml` | `trace:` block, `TARGET_PATH: services/trace`, `image: fi/trace:latest`, `container_name: trace`, alias `trace.local` | `span:`, `services/span`, `fi/span:latest`, `span`, `span.local` |
| `.coaligned/invariants/service-url-drift.registry.yml` | the `trace:` service key + `manifest: services/trace/server.js` (21-22); the consumer `path:` values do not change | `span:` + `services/span/server.js` (keep the consumer entries and other services) |
| `products/guide/starter/config.json` | `"name": "trace"`, `import('@forwardimpact/svctrace/server.js')` | `"span"`, `@forwardimpact/svcspan/server.js` |
| `.github/workflows/eval-guide.yml` | `services/trace/server.js` + `data/logs/trace.log` launch (147), log-tail `data/logs/trace.log` (191), pkill `svctrace` (199) | `services/span/server.js`, `data/logs/span.log`, `svcspan` (keep `fit-trace` library refs, lines 112/114) |
| `justfile` | `data/traces` in mkdir (118) + rm (122) | `data/spans` |
| `config/CLAUDE.md` | `{ "name": "trace", … svctrace/server.js }` (45) | span-worded |
| `libraries/librc/README.md` | `{ "name": "trace", … svctrace/server.js }` (33) | span-worded |
| `websites/fit/docs/internals/release/index.md` | `fit-svctrace` in the `fit-gear` bundle list (123) | `fit-svcspan` (keep `fit-trace`) |
| `build/cli-manifest.json` | `"name": "fit-svctrace"` (52) | `"fit-svcspan"` (keep `fit-trace`, 125) |

Verify: `rg --hidden $X 'svctrace|@forwardimpact/svctrace|SERVICE_TRACE_|services/trace|data/traces|fi/trace:|container_name: trace|trace\.local|^trace:'`
→ no output; `rg '"trace"' products/guide/src/lib/status.js` → no output.

## Step 4: Update service guides and skill data-layout reference

Rename service-identity references; keep genuine OpenTelemetry prose (trace
context, trace span, trace ID, `trace_id`, `span_id`, stack trace) and guide
slugs.

| File | Rename | Keep |
| --- | --- | --- |
| `websites/fit/docs/services/prove-changes/index.md` | "the trace service"→"the span service"; `createClient("trace")`→`("span")`; `traceClient`→`spanClient`; `trace.Span`/`trace.QueryRequest`/`trace.RecordResponse`→`span.*`; `data/traces/index.jsonl`→`data/spans/…`; "trace index"→"span index" | `trace_id` filter values, OTel trace prose, `/prove-changes/` slug |
| `websites/fit/docs/services/prove-changes/send-spans/index.md` | `createClient("trace")`→`("span")`; `traceClient`→`spanClient`; `trace.Span`/`trace.QueryRequest`→`span.*`; "the trace service"→"the span service" | `trace_id`, span/OTel prose, slug |
| `websites/fit/docs/libraries/service-lifecycle/add-observability/index.md` | "the trace service" (lines 10, 90, 98)→"the span service"; `traceClient`→`spanClient` (98) | `Tracer`, spans, "trace context", "trace span", "trace index", `trace_id`, `--trace` flag — all OTel |
| `websites/fit/docs/libraries/typed-contracts/index.md` | `libtype` namespace token `trace`→`span` in the namespace table (175), the import example (180), and the reused-namespaces prose list (183) | the "Distributed-tracing span and event types" OTel description, `tracer` mention (284) |
| `.claude/skills/fit-guide/references/data.md` | `traces/` data-layout row → `spans/` | "Distributed traces" description prose |

The `.claude/**` edit may be blocked by the settings gate; if a normal write is
denied, apply it via `echo … | bunx fit-selfedit .claude/skills/fit-guide/references/data.md`
(CLAUDE.md § Contributor Workflow).

Verify: `rg 'svctrace|the trace service|createClient\("trace"|trace\.(Span|Query|Record)|data/traces' websites/`
→ no output; `rg 'createClient\("span"' websites/` matches; `rg 'traceClient' websites/ .claude/`
→ no output.

## Step 5: Regenerate the generated trees and catalogs

Runs after every `package.json` edit (Steps 1 and 3), so the workspace graph is
internally consistent. `bun install` (not `--frozen-lockfile` — the package
name and two consumer deps changed) relinks the `@forwardimpact/svcspan`
workspace symlink so codegen discovers `proto/span.proto`; commit the updated
lockfile.

Files: none hand-edited (regenerated — `generated/**` and
`libraries/librpc/src/generated/**` are gitignored; `services/README.md`,
`libraries/README.md` catalog rows regenerated).

```sh
bun install
just codegen                # bunx --workspace=@forwardimpact/libcodegen fit-codegen --all
bun run context:fix         # regenerates catalog rows + jobs from package.json
```

Verify: `rg --hidden $X 'TraceServiceDefinition|TraceBase|package trace;|/trace\.Trace/'`
→ no output; `rg 'SpanClient|SpanBase'` matches; no untracked `generated/` churn
(trees are gitignored); `rg 'svctrace|trace' services/README.md` → span-worded
catalog row + jobs only.

## Step 6: Full verification

Run the spec's success-criteria sweeps and the affected suites. `$X` is the
spec's exclusion set: `-g '!specs/**' -g '!.git/**' -g '!*.lock'`.

- `rg --hidden $X 'svctrace'` → no output.
- `rg --hidden $X 'services/trace|data/traces|data/logs/trace\b|fi/trace:|container_name: trace|trace\.local|^trace:'` → no output; `test ! -d services/trace && test -d services/span`.
- `rg --hidden $X 'TraceServiceDefinition|TraceClient|TraceBase|createMockTraceClient|traceClient|traceConfig'` → no output; `rg 'SpanClient|SpanBase'` matches.
- `rg --hidden $X 'createServiceConfig\("trace"\)|createStorage\("traces"\)|SERVICE_TRACE_'` → no output; `rg '"trace"' products/guide/src/lib/status.js` → no output.
- `rg 'package span;' services/span/proto/span.proto` matches; `rg --hidden $X 'package trace;|service Trace'` → no output.
- Registry names the new manifest: `rg 'services/span/server.js' .coaligned/invariants/service-url-drift.registry.yml` matches.
- Docs sweep: `rg 'svctrace|the trace service|createClient\("trace"|trace\.(Span|Query|Record)|data/traces' websites/` → no output; `rg 'createClient\("span"' websites/` matches.
- `rg 'class Tracer|class TraceIndex|class TraceVisualizer'` matches; `rg 'trace_id' services/span/proto/span.proto` matches (OTel preserved).
- No untracked `generated/` churn; a second `just codegen` leaves no diff.
- `fit-svcspan --help` runs (after the Step 5 `bun install` relinks the bin).
- Suites green: `cd services/span && bun test test/*.test.js`;
  telemetry (`libraries/libtelemetry`), rpc (`libraries/librpc`), and guide
  (`products/guide`) suites.

## Risks

- **`--frozen-lockfile` in `just install`.** The package rename plus the two
  consumer dep renames change the lockfile, so the frozen install used by
  `just install`/CI fails until it is regenerated. Run a plain `bun install` in
  Step 5 (after Step 3's dep edits) and commit the updated lockfile.
- **Two generated trees.** `generated/` and `libraries/librpc/src/generated/`
  both regenerate; a codegen run that only refreshes one leaves stale `Trace*`
  symbols that the Step 6 sweep catches. Re-run `just codegen` from repo root.
- **OTel false positives vs. missed sites.** A repo-wide blind `trace`→`span`
  replace would wrongly hit `trace_id`, `Tracer`, `TraceIndex`,
  `TraceVisualizer`, the harness `trace-dir`, and the `fit-trace` library refs
  in `eval-guide.yml` and the release bundle. But treating the per-file tables
  as a sample rather than the full site list leaves `traceClient`/namespace
  occurrences that trip the Step 6 sweep or break a suite. Reconcile both:
  rename per file, then `rg -n 'trace|Trace' <file>` and confirm every survivor
  is a kept OTel term (Step 2 rules) before moving on. Do not run one
  substitution across the repo.

## Execution

One engineering agent executes Steps 1–3, 5, and 6 (code, config, regeneration,
verification) as a single sequence — the regeneration gate and test suites
couple them, and Step 5 must follow every `package.json` edit. Step 4 (docs) may
be handed to `technical-writer` and run in parallel with Steps 2–3, but the
Step 6 docs sweep is the shared gate, so the engineering agent confirms it last
regardless of who edits the docs.
