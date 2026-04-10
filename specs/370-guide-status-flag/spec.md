# Guide Status Flag

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

- A `--status` CLI flag in `products/guide/bin/fit-guide.js`, registered as a
  Repl command that exits after running (like `--version` and `--init`).
- Health checks against each required service: agent, llm, memory, graph,
  vector, tool, trace, web. Each check reports pass/fail with the service URL.
- Data inventory queries: resource counts from the resource index, triple counts
  from the graph store, and agent definition presence from config.
- LLM credential validation: confirm `LLM_TOKEN` is set and non-empty (do not
  make an LLM call --- just verify the credential is configured).
- A structured text summary written to stdout with a clear "ready" or "not
  ready" verdict line.
- Exit code: 0 if all checks pass (ready), non-zero if any check fails (not
  ready).

Out of scope:

- Auto-repair of missing services, data, or credentials.
- GUI or web-based status display.
- Service restart or process management (that is `fit-rc`'s job).
- Health checks for optional services (supabase, tei).
- Machine-readable output formats (JSON, YAML). Text is sufficient for v1; a
  `--json` modifier can be added later if needed.

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

4. **Structured summary output.** Print a human-readable report to stdout with
   sections for services, data, and credentials. End with a single verdict line:
   `Status: ready` or `Status: not ready`. Example:

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

5. **Exit code semantics.** Exit 0 when all services are reachable and LLM
   credentials are configured (the "ready" state). Exit non-zero when any
   required service is unreachable or credentials are missing (the "not ready"
   state). Data warnings (zero counts) do not cause a non-zero exit on their
   own, since the system can technically operate without data --- it just will
   not be useful.

## Success criteria

- `npx fit-guide --status` on a correctly configured and running system prints
  the structured summary with all services showing "ok", non-zero data counts,
  credentials configured, and `Status: ready`. Exits 0.
- `npx fit-guide --status` on a system with missing services or credentials
  prints the structured summary with specific failures identified and
  `Status: not ready`. Exits non-zero.
- `bun run check` passes with the new code.
- Tests cover both the "ready" and "not ready" paths, injecting mock service
  clients to simulate healthy and unhealthy states. Tests follow the existing
  OO+DI pattern: bypass factories, inject mocks directly.
- The `--status` flag appears in `--help` output with a clear description.
- No new dependencies are introduced. The implementation uses existing libraries
  (librpc, libconfig, libtelemetry) for service communication and configuration.

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
