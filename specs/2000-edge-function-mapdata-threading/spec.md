# Spec 2000: Hosted transform path runs the artifact-driven evidence producer

## Problem

The fit-map activity database has two import surfaces: the
`fit-map activity transform` / `fit-map activity seed` CLI commands, and the
hosted Supabase Edge Functions (`transform`, `getdx-sync`, `github-webhook`,
`people-upload`). Both surfaces run the same transform code — the Edge Functions
re-export it through a shared shim; `transform` calls the orchestrator, while
the other three call individual transforms directly — but only the CLI surface
supplies the injected collaborators. Issue
[#1599](https://github.com/forwardimpact/monorepo/issues/1599) records the
consequence, observed as a follow-on during spec 1210's implementation:

- The transform orchestrator requires standard data (`mapData`, the consuming
  project's pathway YAML) to run the artifact-driven evidence producer
  introduced by spec 1210. When standard data is omitted, the orchestrator skips
  that producer by design.
- The `transform` Edge Function invokes the orchestrator with neither standard
  data nor a runtime. Imports triggered through it therefore produce round-robin
  `synthetic_placeholder` evidence rows only; `artifact_interpreted` rows — the
  highest-fidelity provenance tier — appear only when the same import runs
  through the CLI.
- The omission is structural, not an oversight to patch at the call site: the
  CLI loads standard data from the consuming project's installed standard data
  directory, a local filesystem that does not exist in the hosted Deno runtime.
  Where the hosted path obtains standard data is an open decision.
- The same structural gap already keeps the runtime collaborator unthreaded, and
  on one surface it fails today, not latently. The clock-dependent transforms
  (people, GetDX snapshot comments) read the injected clock unconditionally on
  their write paths; no Edge Function supplies one. The `people-upload` Edge
  Function stores a people file and immediately runs the people transform, so
  its clock read is reached — and throws — on every successful upload. The
  `transform` and `getdx-sync` functions reach the same reads as soon as people
  files or snapshot comments exist in storage.
- The skip guard for the artifact-driven producer lives in the orchestrator,
  which only the `transform` Edge Function calls; the other functions import
  individual transforms directly. Collaborator availability is therefore a
  property the hosted surface as a whole must provide, not something a single
  call-site change can restore.
- The skip is silent at the hosted boundary. The Edge Function response reports
  the artifact producer's result with inserted/skipped counts, but a producer
  that never ran returns the same zero-shape as a producer that ran and matched
  nothing. A reader of the response cannot distinguish "no artifacts matched any
  marker" from "the producer was disabled on this path."

Downstream, the gap is visible rather than silent — `fit-landmark coverage`
breaks evidence out per provenance tier — but visibility does not restore the
missing rows: a deployment that imports exclusively through the hosted path
holds a coverage ceiling at whatever the round-robin placeholder producer
yields, which is the measurement floor spec 1210 was written to lift.

## Persona and job

**Engineering Leaders → Measure Engineering Outcomes** and **Empowered Engineers
→ Find Growth Areas** ([JTBD.md](../../JTBD.md)). Both jobs hire Landmark for
evidence grounded in the organization's standard; `artifact_interpreted` rows
are that grounding. Spec 1210 established the strategic position: the readiness
verdict must reflect a representative view of recent work, and coverage must not
degrade silently. The hosted import path is where a team's continuous signal
arrives (webhooks, scheduled syncs) — precisely the deployments where leaders
expect the system-level trends they hired for. A hosted-only deployment today
re-creates the 1210 failure mode ("the tool can't see your work") while the CLI
path, which the same deployment may never run, holds the fix.

## Scope

In scope — the hosted transform surface reaches parity with the CLI surface for
the same inputs:

| Surface                       | Today                                                                                         | Required                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `transform` Edge Function     | Orchestrator invoked with no standard data and no runtime                                     | Invoked with standard data and a runtime; artifact-driven producer runs                                                |
| `getdx-sync` Edge Function    | GetDX transform invoked with no runtime                                                       | Invoked with a runtime; clock-dependent branches usable                                                                |
| `people-upload` Edge Function | People transform invoked with no runtime; throws on the clock read on every successful upload | Invoked with a runtime; uploads import cleanly                                                                         |
| Hosted responses              | Producer-skipped and producer-empty are indistinguishable                                     | A skipped producer is explicitly reported as skipped, with the missing collaborator named                              |
| Standard-data availability    | None in the hosted runtime                                                                    | A defined source the hosted path loads standard data from; its absence is a reported condition, not a silent downgrade |

Excluded:

- **Which** standard-data source the hosted path uses (bundle at deploy, persist
  in the database, accept in the request, fetch from a service) — that
  selection, its freshness/invalidation story, and its trust boundary are the
  design's first decision.
- The artifact-driven producer's interpretation algorithm, the provenance
  taxonomy, and the coverage surfaces — owned by spec 1210.
- The round-robin placeholder producer's behaviour and its GetDX evidence file
  input — unchanged on every path.
- The `github-webhook` Edge Function's extract/transform pair — it takes no
  clock and no standard data today; it changes only if the design routes
  artifact interpretation through it.
- CLI surface behaviour — already correct; it is the parity reference.

## Success criteria

| #   | Claim                                                                                                                                                                                                   | Verification                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An import triggered through the `transform` Edge Function, against a database holding GitHub artifacts and with standard data available to the hosted path, writes `artifact_interpreted` evidence rows | Test asserting non-zero artifact-producer inserts through the function's handler; `fit-landmark coverage` per-provenance breakdown shows the tier populated |
| 2   | The same import yields the same evidence rows as `fit-map activity transform all` over the same inputs                                                                                                  | Parity test comparing row content (artifact, marker, provenance) across the two surfaces, not counts alone                                                  |
| 3   | Clock-dependent transforms invoked through any hosted function — including a `people-upload` round-trip — do not throw for want of a runtime                                                            | Tests covering the people and GetDX snapshot-comment write paths through the hosted entry points                                                            |
| 4   | When the hosted path cannot obtain standard data, the response names the artifact producer as skipped and why, distinct from a zero-match run                                                           | Test asserting the skipped-shape on a standard-data-less invocation                                                                                         |
| 5   | CLI transform and seed behaviour is unchanged                                                                                                                                                           | Existing `products/map` transform and seed tests pass unmodified                                                                                            |

`products/map` has no hosted-function test harness today; criteria 1–4 commit
the work to exercising the hosted entry points, and standing up whatever minimal
harness that requires is in scope.

## Alternatives considered

| Alternative                                                  | Why not                                                                                                                                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patch `mapData` threading alone at the `transform` call site | No data source exists in the hosted runtime to thread; and it leaves the runtime half of the same structural gap open, to be re-discovered the first time a clock-dependent branch executes hosted |
| Document the hosted path as placeholder-tier only            | Locks hosted deployments into the measurement floor spec 1210 lifted; concedes the Competes-With position 1210's strategic analysis rejected                                                       |
| Remove the hosted transform surface                          | Webhook- and schedule-driven imports are the continuous-signal path the Measure Engineering Outcomes job depends on; the CLI cannot replace them without a human in the loop                       |

## Relations

- Follow-on recorded by spec 1210's implementation (plan part 3, transform
  orchestration step); authored against the post-1210 surface per the triage on
  [#1599](https://github.com/forwardimpact/monorepo/issues/1599).
- Refs #1599 — the issue closes when the implementation lands, not when this
  spec merges.
