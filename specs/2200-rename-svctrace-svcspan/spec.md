# Spec 2200: Rename `svctrace` to `svcspan`

**Classification:** product-aligned — the change lands on the `services/` tree
and its documentation under `websites/fit/docs/services/`.

## Problem

The span-ingestion service ships as `@forwardimpact/svctrace` with the bin
`fit-svctrace` and lives at `services/trace/`. Its name collides with the
`fit-trace` library, which is an unrelated component: `fit-trace` reads and
analyzes NDJSON agent-behaviour traces on the command line, while this service
ingests and stores OpenTelemetry spans over gRPC for the Platform Builders job
"Prove Agent Changes". The two share no code, no data, and no purpose.

Evidence of the confusion:

- Both names sort adjacent in every gear bundle listing (`fit-svctrace` next to
  `fit-trace`), and the CI teardown in `eval-guide.yml` lumps `svctrace` into a
  process-kill pattern beside unrelated services.
- The service's own proto, RPCs (`RecordSpan`, `QuerySpans`), and message
  (`Span`) already speak in spans, yet the package, directory, class, proto
  package, config key, and container all say "trace" — the one word that names a
  different product.

The service stores **spans**. Naming it `svcspan` removes the collision and
makes the identifier describe what the service does.

## What changes

A complete, evergreen clean-break rename. No shims, no dual-publish, no wire
back-compat — there is no meaningful installed base to migrate.

### Service surface (renamed by hand)

| Surface                         | From                                                      | To                                   |
| ------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| Directory                       | `services/trace/`                                         | `services/span/`                     |
| Package                         | `@forwardimpact/svctrace`                                 | `@forwardimpact/svcspan`             |
| Bin                             | `fit-svctrace`                                            | `fit-svcspan`                        |
| Service class                   | `TraceService`                                            | `SpanService`                        |
| Proto file / package / service  | `proto/trace.proto` · `trace` · `Trace`                   | `proto/span.proto` · `span` · `Span` |
| Config key                      | service config `trace`                                    | `span`                               |
| Runtime data                    | storage bucket `traces`, log dir `trace`                  | `spans`, `span`                      |
| Package metadata, README, tests | `trace`-worded name/keywords/jobs/description/test labels | span-worded                          |

A pre-existing JSDoc typo in the service (`RecordSpanResponse`, while the proto
message is `RecordResponse`) is corrected to the real `span.RecordResponse`
rather than carried forward.

### Generated artifacts (regenerated from the proto)

Renaming the proto package and service regenerates the code-generation output
and the shared `libtype` type namespace. These follow the proto by construction,
in **both** generated trees (`generated/` and the librpc-local generated copy):

| Generated artifact       | From                             | To                      |
| ------------------------ | -------------------------------- | ----------------------- |
| Service definition       | `TraceServiceDefinition`         | `SpanServiceDefinition` |
| Generated client         | `TraceClient`                    | `SpanClient`            |
| Generated base           | `TraceBase`                      | `SpanBase`              |
| gRPC path prefix         | `/trace.Trace/`                  | `/span.Span/`           |
| `libtype` type namespace | `trace.*`                        | `span.*`                |
| Generated proto copies   | `generated/**/proto/trace.proto` | `.../span.proto`        |

### Coupled shared-library references (references move, class names stay)

The regeneration cascades into a small set of references in shared libraries.
These move to the new names; the surrounding hand-written class names stay:

- The tracer factory `createTracer` in the rpc library resolves the service
  address by config key and constructs the generated client — the config key
  `trace`→`span` and the `TraceClient`→`SpanClient` reference both move here.
- The telemetry library modules that consume the generated type namespace
  (`import { trace }`→`{ span }` from `libtype`) and the shared trace-visualizer
  bin that opens the renamed storage bucket.
- The `libtype` index that re-exports the generated namespace (`trace`→`span`).
- The mock client factory `createMockTraceClient`→`createMockSpanClient`.
- Identifiers naming an instance of the client (`traceClient`, `#traceClient`)
  follow the client rename to the `span` form.

### Consumers, data, and documentation

| Surface                               | What it names                                                                                                                                                                                           | Change                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Product dependents                    | dependency on the package (guide, gear)                                                                                                                                                                 | new package name                                                        |
| Guide status probe                    | hard-coded config key `"trace"` in the service-name arrays and its test                                                                                                                                 | `span`                                                                  |
| Guide init                            | config the guide generates naming the service (`init.js` and its test)                                                                                                                                  | span-worded                                                             |
| Environment examples                  | `SERVICE_TRACE_*` env vars and the `trace.local` service host in the `.env.*.example` files                                                                                                             | `SERVICE_SPAN_*`, `span.local`                                          |
| Container orchestration               | `docker-compose.yml` service block, build path, `fi/trace:latest` image, `container_name`, `trace.local` alias                                                                                          | `span`                                                                  |
| Service-URL invariant registry        | the `trace:` entry and its `services/trace/server.js` manifest path in the service-URL-drift registry                                                                                                   | `span`                                                                  |
| Starter config                        | launches the service by name and module path                                                                                                                                                            | new name + module                                                       |
| CI workflow                           | service-launch line (`services/trace/server.js`), log-tail (`data/logs/trace.log`), and the process-kill pattern                                                                                        | new dir/log/bin                                                         |
| Repo bootstrap                        | `justfile` `data/traces` mkdir/rm lines                                                                                                                                                                 | `data/spans`                                                            |
| Contributor refs                      | service-list examples in `config/CLAUDE.md` and the rc-library README, the release bundle listing in the internals release guide, and the tracked, hand-edited CLI manifest (`build/cli-manifest.json`) | `svcspan`                                                               |
| Service guides (`.../prove-changes/`) | the service by name, its client key `createClient("trace")`, data path `data/traces/…`, and RPC type identifiers `trace.Span` etc.                                                                      | rename identity refs; keep OTel span/`trace_id` prose; keep guide slugs |
| Docs & skill refs                     | the service by name or its data path outside `prove-changes/` (library lifecycle guide, published skill data-layout reference)                                                                          | span-worded                                                             |

## Out of scope

- **Genuine OpenTelemetry vocabulary.** The hand-written telemetry classes
  `Tracer`, `TraceIndex`, `TraceVisualizer`, and `Span`, the `trace_id` field on
  a span, and all distributed-tracing terminology stay. In OpenTelemetry a trace
  is a set of spans; `trace_id` is a real field distinct from `span_id`. The
  confusable thing is the service identifier, not the data model.
- **The harness NDJSON trace directory.** The `trace-dir` default in the harness
  library belongs to the `fit-trace` domain and is untouched — a blanket sweep
  for the bare string `traces` must not drag it in.
- **Historical records.** Prior `specs/**` documents that mention `svctrace` are
  immutable records of past work and are not rewritten.
- **Behaviour and API shape.** RPCs, message fields, and query semantics are
  unchanged. This is a rename, not a redesign.

## Success criteria

Each command runs from the repository root. `--hidden` is required so a sweep
reaches `.github/`, but it also reaches `.git/` — and this branch's own name
contains `svctrace`, so every absence sweep excludes the same three paths:

```sh
X="-g !specs/** -g !.git/** -g !*.lock"   # immutable records, VCS internals, lockfiles
```

`$X` stands for that exclusion set below. Each pattern is single-quoted, so the
shell passes a bare `|` to ripgrep as regex alternation (never `\|`, which
ripgrep reads as a literal pipe); `\(`, `\"`, and `\b` are literal-paren,
literal-quote, and word-boundary tokens.

| Criterion                                                                    | Verification                                                                                                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `svctrace` / `fit-svctrace` identifier remains                            | `rg --hidden $X 'svctrace'` → no output                                                                                                                                    |
| No service-identity `trace` path, image, container, or compose block remains | `rg --hidden $X 'services/trace                                                                                                                                            | data/traces                 | data/logs/trace\b                                                                                                                                           | fi/trace:             | container_name: trace | trace\.local                             | ^ trace:'`→ no output;`test ! -d services/trace && test -d services/span`                                                                                                                   |
| Package and bin published under the new name                                 | `services/span/package.json` `name` is `@forwardimpact/svcspan`, `bin` is `fit-svcspan`; `fit-svcspan --help` runs; `rg --hidden $X '@forwardimpact/svctrace'` → no output |
| Proto renamed                                                                | `rg 'package span;' services/span/proto/span.proto` matches; `rg --hidden $X 'package trace;                                                                               | service Trace'` → no output |
| Generated + coupled trace symbols gone, span symbols present                 | `rg --hidden $X 'TraceServiceDefinition                                                                                                                                    | TraceClient                 | TraceBase                                                                                                                                                   | createMockTraceClient | traceClient           | traceConfig'`→ no output;`rg 'SpanClient | SpanBase'` matches; the repository codegen command runs clean with no uncommitted diff (the generated trees are gitignored, so the diff — not the grep — is what guards regenerated output) |
| Config key resolves as `span` everywhere it is read                          | `rg --hidden $X 'createServiceConfig\("trace"\)                                                                                                                            | createStorage\("traces"\)   | SERVICE*TRACE*'`→ no output;`rg '"trace"' products/guide/src/lib/status.js`→ no output; the service-URL-drift registry entry names`services/span/server.js` |
| Shared OpenTelemetry classes preserved                                       | `rg 'class Tracer                                                                                                                                                          | class TraceIndex            | class TraceVisualizer'`matches;`rg 'trace_id' services/span/proto/span.proto` matches                                                                       |
| Service guides name the span service, keep OTel terms                        | `rg 'svctrace                                                                                                                                                              | the trace service           | createClient\("trace"                                                                                                                                       | trace\.(Span          | Query                 | Record)                                  | data/traces' websites/`→ no output;`rg 'createClient\("span"' websites/` matches                                                                                                            |
| Affected test suites pass                                                    | span-service, telemetry-library, rpc-library, and guide (`products/guide`) suites are green                                                                                |
