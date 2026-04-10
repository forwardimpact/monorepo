# Guide Status Flag

**Depends on:** [360 — CLI Library](../360-cli-library/spec.md) (libcli must
exist before this spec is implemented).

## Problem

After setting up Guide, users have no way to verify the system is ready before
asking their first question. Guide requires a stack of 8+ microservices (agent,
llm, memory, graph, vector, tool, trace, web), processed framework data loaded
into indexes and the graph store, and valid LLM credentials. Any missing piece
causes a cryptic gRPC or connection error that tells the user nothing about what
is actually wrong.

The getting-started documentation (issues #266, #268) can show expected output,
but users still cannot diagnose _why_ things are not working. Today the only
feedback path is: start a conversation, hit an error, guess which layer failed,
and repeat. This is especially painful for first-time users who have never seen
the system in a healthy state.

## Why this matters

Guide answers "How do I find my bearing?" --- a question that requires
confidence in the system before asking it. The 8-service dependency chain means
there are at least 8 distinct failure points, each with its own symptom. A
single missing service, an empty graph store, or an unset `LLM_TOKEN` variable
each produce different errors that are difficult to trace back to root cause
without inside knowledge.

Issues #194, #195, #252, #253, #254, #266, #267, and #268 all stem from
first-time user friction. A status command would collapse the "is it working?"
question into a single invocation, surfacing every configuration gap at once
rather than forcing users through a trial-and-error loop.

## Goal

Add a `--status` flag to `fit-guide` that checks system readiness and reports a
clear verdict: the health of each required service, the presence and quantity of
framework data, the validity of LLM credentials, and an overall ready/not-ready
summary.

## Scope

In scope:

- A `--status` flag declared in the libcli definition for
  `products/guide/bin/fit-guide.js`. Handled before the Repl starts — when
  `--status` is present, run the status checks, print the report, and exit
  without entering the interactive session (same early-exit pattern as
  `--version` and `--init`).
- Health checks against each required service: agent, llm, memory, graph,
  vector, tool, trace, web. Each check reports pass/fail with the service URL.
- Data inventory queries: resource counts from the resource index, triple counts
  from the graph store, and agent definition presence from config.
- LLM credential validation: confirm `LLM_TOKEN` is set and non-empty (do not
  make an LLM call --- just verify the credential is configured).
- A structured summary written to stdout using libcli's `SummaryRenderer` with a
  clear "ready" or "not ready" verdict line.
- Machine-readable output via `--status --json`, producing a JSON object with
  the same sections (services, data, credentials, verdict). This is standard
  libcli convention and essentially free when the status data is already
  structured.
- Exit code: 0 if all checks pass (ready), 1 if any check fails (not ready).
  Follows libcli's exit code convention (1 for runtime errors, 2 for usage
  errors).

Out of scope:

- Auto-repair of missing services, data, or credentials.
- GUI or web-based status display.
- Service restart or process management (that is `fit-rc`'s job).
- Health checks for optional services (supabase, tei).

## Behavioural requirements

1. **Service health checks.** For each of the 8 required services (agent, llm,
   memory, graph, vector, tool, trace, web), attempt a gRPC health check or
   lightweight RPC call. Report each service as "ok" or "unreachable" with the
   configured URL. Timeout per service should be short (2--3 seconds) so the
   full check completes quickly even when services are down.

2. **Data inventory.** Query the running services for framework data presence:
   - Resource count from the resource/storage layer (e.g. number of indexed
     pathway entities).
   - Graph triple count from the graph service.
   - Agent definition count from the config directory. Report counts so the user
     can see whether data has been loaded. Zero counts should be flagged as a
     warning (the system may technically run but will produce empty or unhelpful
     responses).

3. **LLM credential validation.** Check that `LLM_TOKEN` is available via the
   existing `libconfig` credential resolution (environment variable or `.env`
   file). Report present/missing. Do not attempt an actual LLM API call.

4. **Structured summary output.** Use libcli's `SummaryRenderer` to print
   each section (Services, Data, Credentials) as a summary group with aligned
   labels. End with a single verdict line: `Status: ready` or
   `Status: not ready`. Example:

   ```
   Services
     agent    grpc://localhost:3002   ok
     llm      grpc://localhost:3004   ok
     memory   grpc://localhost:3003   ok
     graph    grpc://localhost:3006   ok
     vector   grpc://localhost:3005   ok
     tool     grpc://localhost:3007   ok
     trace    grpc://localhost:3008   ok
     web      http://localhost:3001   ok

   Data
     resources   42 indexed
     triples     318 loaded
     agents      3 defined

   Credentials
     LLM_TOKEN   configured

   Status: ready
   ```

   When `--json` is also passed, output a JSON object instead:

   ```json
   {
     "services": {
       "agent":  { "url": "grpc://localhost:3002", "status": "ok" },
       "llm":    { "url": "grpc://localhost:3004", "status": "ok" },
       "memory": { "url": "grpc://localhost:3003", "status": "ok" },
       "graph":  { "url": "grpc://localhost:3006", "status": "ok" },
       "vector": { "url": "grpc://localhost:3005", "status": "ok" },
       "tool":   { "url": "grpc://localhost:3007", "status": "ok" },
       "trace":  { "url": "grpc://localhost:3008", "status": "ok" },
       "web":    { "url": "http://localhost:3001",  "status": "ok" }
     },
     "data": {
       "resources": 42,
       "triples": 318,
       "agents": 3
     },
     "credentials": {
       "LLM_TOKEN": "configured"
     },
     "verdict": "ready"
   }
   ```

5. **Exit code semantics.** Exit 0 when all services are reachable and LLM
   credentials are configured (the "ready" state). Exit 1 when any required
   service is unreachable or credentials are missing (the "not ready" state).
   This follows libcli's exit code convention (1 for runtime errors). Data
   warnings (zero counts) do not cause a non-zero exit on their own, since the
   system can technically operate without data --- it just will not be useful.

6. **Error handling.** Use `cli.error()` from libcli for error output and
   `logger.exception()` for caught exceptions, following the standard libcli
   error conventions. Errors are prefixed with `fit-guide: error:` and written
   to stderr.

## Success criteria

- `npx fit-guide --status` on a correctly configured and running system prints
  the structured summary (via `SummaryRenderer`) with all services showing "ok",
  non-zero data counts, credentials configured, and `Status: ready`. Exits 0.
- `npx fit-guide --status --json` on a correctly configured system outputs the
  JSON representation of the same status data. Exits 0.
- `npx fit-guide --status` on a system with missing services or credentials
  prints the structured summary with specific failures identified and
  `Status: not ready`. Exits 1.
- `bun run check` passes with the new code.
- Tests cover both the "ready" and "not ready" paths, injecting mock service
  clients to simulate healthy and unhealthy states. Tests follow the existing
  OO+DI pattern: bypass factories, inject mocks directly.
- The `--status` flag appears in `--help` output automatically via the libcli
  definition — no separate help text maintenance required.
- No new external dependencies are introduced. The implementation uses libcli
  (for flag definition, summary rendering, error formatting), librpc, libconfig,
  and libtelemetry.

## Integration with libcli (spec 360)

After spec 360 is implemented, fit-guide will use libcli for initial argument
parsing before entering the Repl session. The `--status` flag is declared in the
libcli definition alongside `--version`, `--init`, `--data`, `--streaming`,
`--help`, and `--json`. When `cli.parse()` returns values with `status: true`,
the entry point runs the status checks and exits without starting the Repl.

This mirrors the pattern described in spec 360 § "What this is not": "A
REPL-based CLI (fit-guide, fit-visualize) could use libcli for help formatting
and argument parsing of the initial invocation, and librepl for the interactive
session."

The `SummaryRenderer` from libcli renders each status section (Services, Data,
Credentials). The verdict line is appended after the summary sections. Logger is
used for operational output during checks (debug-level progress, exception
logging) per the spec 360 Logger decision matrix.

## Open questions

- **Health check mechanism.** Should this use gRPC health checking protocol
  (grpc.health.v1.Health/Check), a lightweight application-level RPC on each
  service, or a simple TCP connect? The plan should choose based on what the
  existing service implementations support.
- **Data count sources.** Which specific RPCs or queries yield resource counts
  and graph triple counts? The plan should identify the exact service methods to
  call.
- **Parallelism.** Should service health checks run in parallel (faster) or
  sequentially (simpler output ordering)? Parallel with `Promise.allSettled` is
  likely the right choice but the plan should confirm.
