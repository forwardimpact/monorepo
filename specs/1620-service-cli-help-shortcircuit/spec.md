# Spec 1620 — Service CLIs Honour `--help`/`--version`

## Problem

[Spec 1420](../1420-single-source-native-binaries/spec.md) defined two
gates over the native binary channel: the *universal* gate, "every
published binary starts and produces output" (its second success
criterion), and the *cask-equivalence* gate, "a Homebrew cask built
through the new path is equivalent for the user … each answers `--help`
with a zero exit" (its tenth success criterion). The five service CLIs
in the gear bundle — `fit-svcgraph`, `fit-svcmcp`, `fit-svcpathway`,
`fit-svctrace`, `fit-svcvector` — cannot satisfy either gate today
because their `bin` entries start a long-running listener (gRPC for
four of them; HTTP/MCP for `fit-svcmcp`) before reading `process.argv`.
Any invocation, including `--help`, either crashes on missing service
configuration or boots the listener and never exits.

### Two compensating carve-outs live in CI, not in the binaries

| Surface | Carve-out | Cost |
|---|---|---|
| `build-binaries.yml` per-CLI smoke gate | The smoke step is skipped for manifest entries flagged as servers; the resulting binaries are built, checksummed, and uploaded without ever being invoked. | A compiled service binary that starts-and-crashes (the same failure mode the smoke gate exists to catch) ships unsmoked. Spec 1420's universal start-and-output gate is narrowed to "every published *non-server* binary starts and produces output." |
| `publish-brew.yml` gear `.app` smoke | The step picks the first non-server gear CLI from the manifest and runs *its* `--help` instead of the gear bundle's primary executable. | The gear bundle's primary executable is `fit-svcgraph` (its `CFBundleExecutable` per `build/build-app-gear.sh`), so a `brew`-installed user who runs the bundle's headline binary hits the failure this gate is supposed to catch. The gate proves a substitute CLI works, not the primary one. Spec 1420's cask-equivalence gate is unmet for the gear cask. |

The workflow source captures the deferral verbatim:

> The gear primary-exec (`fit-svcgraph`) is a long-running server with no
> `--help` short-circuit, so smoke the first non-server gear CLI instead;
> teaching the server entries to honour `--help` is tracked separately.
>
> — `.github/workflows/publish-brew.yml` § "Smoke test"

That "tracked separately" deferral is this spec.

### A user invoking the published binary cannot reach `--help`

`fit-svcgraph` ships in the published gear cask and is exposed on
`PATH` via the cask's binary stanzas. A user running
`fit-svcgraph --help` — the first thing anyone types against an
unfamiliar CLI — never reaches argv parsing because every one of the
five service binaries performs eager service initialization at module
top level. The user-visible result is: the binary does not answer
`--help`. The failure mode that produced that result the day it was
diagnosed in the brew-publish cluster — `fit-svcgraph` crashing during
auth setup with `SERVICE_SECRET environment variable is required` —
was Issue
[#1041](https://github.com/forwardimpact/monorepo/issues/1041). Issue
[#1347](https://github.com/forwardimpact/monorepo/issues/1347) framed
the broader gap (`--help` never reaches argv parsing on any of the five
binaries, regardless of which failure mode the environment produces) as
a spec-1420 follow-up the moment spec 1420 merged.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Platform Builders | "Give humans and agents shared capabilities through the same interface" — Gear distribution ([JTBD.md](../../JTBD.md#platform-builders-build-agent-capable-systems)) | Five of the gear cask's bundled CLIs fail on the first command a new user types; the channel cannot be trusted as the shared interface the persona is hiring for. |
| Teams Using Agents | "Run a continuously improving agent team" ([JTBD.md](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team)) | Agent runtimes consume the gear bundle; a bundled CLI that never answers `--help` cannot be introspected by the same agents the bundle exists to serve. |

## Scope

### In scope

| Component | What changes |
|---|---|
| The five service binaries in the gear bundle (one per gear-bundled service, named in the Problem above) | When the binary is invoked with first argument `--help`, `-h`, `--version`, or `-V`, it prints non-empty output and exits 0 without binding any port and without requiring `SERVICE_SECRET` or any other service environment variable to be set. Any other invocation runs the existing server-start path with no observable change. |
| `build-binaries.yml` per-CLI smoke gate | The gate runs against every CLI in `build/cli-manifest.json` uniformly; no entry is exempted from the start-and-output check. |
| `publish-brew.yml` gear `.app` smoke | The gear `.app` smoke step runs `--help` against the bundle's primary executable; no substitute CLI is selected. |

### Out of scope

- Behaviour of any service binary when its first argument is not one
  of `--help`/`-h`/`--version`/`-V`. The existing server-start path is
  unchanged — same ports, same configuration, same initialization
  order, same error surface. This spec does not refactor the
  server-start path.
- Any CLI surface beyond the four listed tokens on the five service
  binaries (status, diagnostics, dump-config, subcommands, etc.). A
  richer service-CLI surface is a separate spec.
- The `"server": true` flag on the five gear-manifest entries. After
  this spec lands, the flag has no callers; a follow-up cleanup will
  remove it under a separate issue
  ([#1347 follow-up note](https://github.com/forwardimpact/monorepo/issues/1347)).
  This spec does not gate on that cleanup.
- The `fit-codegen` / `fit-wiki` / `fit-outpost` compile-readiness
  gaps already closed by spec 1420 (`--help` for those binaries
  already exits 0).
- Any change to how `librpc`, `libconfig`, `libtelemetry`, or other
  shared libraries are wired into the service binaries. The
  short-circuit runs ahead of those wires; the wires themselves are
  untouched.

## Success Criteria

| Claim | Verification |
|---|---|
| Each of the five service binaries answers `--help` with a zero exit and non-empty output. | Build each via the shared mechanism; run `<bin> --help`; observe exit 0 within the smoke-step's existing run window (the run-and-capture step that already gates every non-server CLI) and non-empty captured output. |
| Each of the five service binaries answers `--version` with a zero exit and non-empty output. | Same as the previous row with `--version`. |
| `--help` and `--version` exit successfully in the environment a freshly-installed cask user has, with no service environment variables set. | Run each binary on a host where no `SERVICE_*` environment variable is set (matching the env of a user who just ran `brew install fit-gear`); observe `--help` and `--version` exit 0 with non-empty output. (Today the binaries fail before reaching argv parsing — Issue #1041 captured one shape of that failure.) |
| The build-binaries per-CLI smoke gate runs against every CLI in `build/cli-manifest.json`. | Inspect `.github/workflows/build-binaries.yml`; observe no manifest-entry filter guards the smoke step. |
| The publish-brew gear `.app` smoke runs against the gear bundle's primary executable. | Inspect `.github/workflows/publish-brew.yml`; observe the gear smoke step invokes `--help` on the bundle's primary executable, with no per-bundle substitution. |
| The no-argument behaviour of each service binary — running through the existing server-start path — is preserved. | For each of the five services, `bun test services/<svc>/test` passes against the post-change `server.js`. |
