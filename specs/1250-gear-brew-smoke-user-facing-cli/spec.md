# Spec 1250 — Gear brew smoke validates a user-facing CLI

## Problem

The `publish-brew.yml` workflow's `Smoke test` step runs `fit-svcgraph --help`
on the gear bundle for every `gear@v*` tag. `fit-svcgraph` is a service
binary, and **service binaries do not implement argv handling at all** —
the gear-bundled service entry points (`services/{graph,mcp,pathway,trace,vector}/server.js`)
each run an unconditional module-init sequence (load config, construct
tracer, start server) and never inspect `process.argv`. The current
smoke target is therefore testing a contract the binary does not
implement.

In CI the binary additionally fails before reaching `server.start()`
because module-init reads runtime configuration that the brew CI
environment does not provide. That failure is real, but it is not the
underlying defect — even if the runtime-config failure were fixed, the
binary would proceed to start a gRPC server rather than print help.

Two consequences:

1. **The gate has never produced a green gear release.** `gear@v0.1.1`
   and `gear@v0.1.2` both failed at module init (issue #1039,
   protobufjs `$util.Long`); the further failure documented in #1041
   was masked behind it. No release tag has ever reached the smoke
   step's success path. The brew smoke gate has never validated a
   gear bundle since the lane opened.

2. **The chosen target is not a user-facing CLI.** Service binaries
   are daemons brought up by `fit-rc` (see
   [`services/CLAUDE.md` § Running services](../../services/CLAUDE.md)).
   The gear bundle additionally packages many non-daemon CLIs (the
   full list lives in `justfile`'s `build-app-gear` recipe) whose
   entry points do implement `--help`. The smoke gate's job is to
   exercise the contract a brew-installing user relies on; today it
   exercises one the bundle does not advertise.

This is one of four brew-publish blockers filed the same day
2026-05-19 (#1036 outpost cdhash drift, #1038 pathway map
resolution, #1039 gear `$util.Long`, #1041 this issue). The other
three are mechanism choices triaged as fix-shape work; this one
is the success-criteria-shaped question: **what does the brew
smoke gate owe?**

## Why now

Spec 0600 SC1 commits the brew lane to the property *every `fit-*` CLI
surfaced by those bundles runs its `--help` successfully on a macOS
arm64 machine that has neither `node` nor `bun` on `PATH`* — a
no-toolchain environment contract. Spec 0600 does not distinguish
daemons from user-facing CLIs; its SC1 applies to whichever
binaries the bundle surfaces.

The `publish-brew.yml` smoke step is one CI implementation that
enforces a subset of that property per release. Today's
implementation enforces it on one daemon that does not implement
`--help`, so the gate is structurally guaranteed to be red or
false-green. Restoring the smoke gate to a CLI that does implement
`--help` produces a meaningful release signal and is a prerequisite
for any subsequent work that wants to rely on a green gear lane.
Closing the broader gap (service binaries do not yet satisfy SC1's
property) is separable from the smoke gate's release-time job and
is reopened as option (c) below.

## Persona and job

| Layer | Anchor |
|---|---|
| Persona | Platform Builders — [JTBD.md](../../JTBD.md) `goal="Build Agent-Capable Systems"` |
| JTBD Big Hire (verbatim) | *Help me give humans and agents shared capabilities through the same interface, with tooling to prove changes improved outcomes* |
| How this spec serves the job | A brew-installing user must be able to run at least one bundled CLI immediately after `brew install fit-gear` to learn what's available; if every gear release fails its smoke gate, the brew lane is not actually delivering "shared capabilities through the same interface" via brew |

## Strategic position

The brew smoke gate validates that **at least one user-facing CLI in
the gear bundle answers `--help` cleanly** — the contract a
brew-installing user exercises on day one. It does **not** validate
that every binary on `PATH` answers `--help` (that is spec 0600 SC1's
full scope, separable from the release-time gate), and it does
not claim full coverage of the bundle's CLI surface. Strengthening
coverage (sample size, representativeness from the bundle's
`--extra-exec` list) is a separable widening of the same gate that
the design can revisit if a wider sample becomes load-bearing.

Three options were sketched in issue #1041:

| Option | Verdict | Reason |
|---|---|---|
| (a) Smoke gate exercises a user-facing CLI from the bundle (one or more) | **Direction accepted** | Matches the contract brew-installing users exercise on day one; uses binaries the bundle already ships and that already implement `--help`. Identity and cardinality of the chosen binaries are design decisions |
| (b) Inject a dummy `SERVICE_SECRET` so `fit-svcgraph` proceeds past the auth check | Rejected | Does not solve the underlying defect (service binaries do not handle `--help`); allowing module-init to proceed pulls the gate forward past the auth wall and into `server.start()`, which calls `bindAsync` on a configured host/port — replacing a deterministic module-init throw with a flakier port-bind/network surface |
| (c) Extend service entry points to parse argv and answer `--help` before module-init runs | Out of scope (separable) | Real surface bug and the right path to bring service binaries into spec 0600 SC1's property; cross-cuts all five gear-bundled `services/*` entry points and is driven by a different product question (whether daemons should be self-describing without runtime config). Concrete reopen triggers: (i) the first inbound issue from a brew user reporting `fit-svc* --help` crash on `PATH`, or (ii) any `services/{graph,mcp,pathway,trace,vector}` binary being added to a `--primary-exec` slot or being documented as user-invokable outside `fit-rc` |

## Scope

| In | Out |
|---|---|
| The `Smoke test` step in `publish-brew.yml` for `kind=gear` | The same step for `kind=product` — product binaries are each their own product's CLI and answer `--help` by construction |
| What contract that step verifies (a user-facing CLI in the bundle answers `--help` cleanly in the brew CI environment) | Whether service-binary entry points should answer `--help` without runtime config (option (c) above; separable spec) |
| | Which specific CLI (or CLIs) become the smoke target — design decision; the spec constrains the property, not the identity or count |
| | The `primary-exec` choice in `build-app-gear`. The smoke step today reads `Contents/MacOS/fit-svcgraph` (the primary-exec). Whether the design realigns primary-exec to a user-facing CLI, or instead targets an extra-exec from elsewhere in the bundle layout, is a design decision |
| | Brew smoke patterns for non-gear shared bundles (none exist today; this contract would extend if they emerge) |
| | The cdhash determinism check in the same workflow. The check is already present; gear-bundle determinism is not the contract this spec restores. Spec 1170 is explicitly outpost-only; its closing note that non-outpost macOS bundles are "a separate effort if and when it becomes load-bearing" applies to all six non-outpost bundles (not gear specifically) and is paraphrased here only to confirm gear sits outside spec 1170's scope |

## Success criteria

1. The `Smoke test` step in `publish-brew.yml` for `kind=gear` invokes
   `--help` on a CLI whose entry point implements an argv-aware help
   handler and whose module-init does not depend on any runtime
   configuration environment variables. *Verified by:* the chosen
   binary exits zero and prints help when invoked as
   `env -i HOME=$HOME PATH=$PATH <binary> --help` from a working
   directory outside the monorepo. (The invocation starts from an
   empty environment and restores only `HOME` and `PATH`, which is
   what `env -i` already does — no other variables are implied.)
2. The first `Verify cdhash stability` step the workflow executes on
   a `kind=gear` branch (i.e. on the first `gear@v*` tag pushed after
   this change reaches `main`, on which the smoke step exits zero
   per SC1) exits zero. *Verified by:* the workflow run for that tag
   shows both `Smoke test` and `Verify cdhash stability` passing on
   `kind=gear`. (Pre-this-spec, the cdhash step never executed on
   `kind=gear` because `Smoke test` failed first — so this is the
   first executable observation of the existing check on gear, not
   a non-regression claim.)

### Design-phase checklist (not pre-merge gates)

The following are review-time decisions for the implementation,
listed here so the spec's "what the smoke gate owes" framing is
complete. They are not mechanically verifiable from a CI script and
should be checked during design or implementation review rather
than gated on.

- **D1.** The chosen smoke target satisfies the libraries audience
  contract in [`libraries/CLAUDE.md` § Audience](../../libraries/CLAUDE.md)
  — its `--help` output is self-contained, with no relative paths
  into the monorepo and no insider tooling references as user
  prerequisites. Reviewed against that section during the design
  or implementation phase.
- **D2.** The successful gear release that exercises SC1+SC2 is
  observable post-merge. *Tracked by:* `gh run list
  --workflow=publish-brew.yml --status=success` returning at least
  one run matching a `gear@v*` tag pushed after the merge. This is a
  release-time verification of the same property SC1 gates pre-merge,
  not a separate criterion.

## Risks

| Risk | Mitigation |
|---|---|
| The chosen CLI develops a module-init regression and the gear lane goes red on an unrelated release | This is the failure mode the smoke gate is supposed to catch — the gate stays useful and observable |
| Switching the smoke target leaves the `fit-svc*` subset uncovered on two fronts at once — the bundled-binary smoke surface no longer catches their regressions, and spec 0600 SC1's "every CLI surfaced by the bundle answers --help" property remains unsatisfied for them after this spec lands | Service-binary module-init is exercised by service tests on `main`; the unit/integration coverage does not fully substitute for the bundled-binary smoke surface. Both halves of the gap (regression-catching surface and the SC1 property) are recorded together as the reopen path option (c) closes |
| The chosen CLI is removed from the gear bundle in a future refactor, silently breaking the smoke step | The smoke step's binary name and the bundle's binary list must agree by construction. Coupling them (e.g. parameterising the smoke target from the bundle manifest) is a design decision; this risk row records the requirement |
| A brew user runs `fit-svc* --help` from `PATH` and observes a crash, since the gear cask's binary stanzas surface daemon binaries directly | Acknowledged; the bundle's documented contract is "run daemons via `fit-rc`", not "every binary on `PATH` is self-describing". Option (c)'s concrete triggers (first inbound report, or a daemon binary entering `--primary-exec`) are the reopen path if this failure mode becomes load-bearing |

## References

- [#1041](https://github.com/forwardimpact/monorepo/issues/1041) — bug report with the three-option sketch
- Cluster: [#1036](https://github.com/forwardimpact/monorepo/issues/1036), [#1038](https://github.com/forwardimpact/monorepo/issues/1038), [#1039](https://github.com/forwardimpact/monorepo/issues/1039) — brew-publish blockers filed the same day
- [Spec 0600 SC1](../600-native-binary-distribution/spec.md) — every `fit-*` CLI surfaced by the bundles answers `--help` in a no-toolchain environment (the broader property; this spec narrows the smoke-gate subset)
- [Spec 1170](../1170-outpost-cdhash-determinism/spec.md) — outpost cdhash determinism (explicitly outpost-only; cited only to confirm gear is out of its scope)
- [`publish-brew.yml`](../../.github/workflows/publish-brew.yml) — the workflow whose `Smoke test` step this spec scopes
- [`services/CLAUDE.md` § Running services](../../services/CLAUDE.md) — daemons are managed by `fit-rc`
- [`libraries/CLAUDE.md` § Audience](../../libraries/CLAUDE.md) — what a user-facing CLI looks like
- [`libraries/README.md`](../../libraries/README.md) — the catalog of CLIs the gear bundle packages
