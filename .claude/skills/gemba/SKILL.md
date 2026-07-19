---
name: gemba
description: >
  Stand up and operate an agent team on one platform. Use when a team wants
  to run coding agents continuously — bootstrap the environment, run
  sessions, inspect traces, persist memory, and measure outcomes — instead of
  reverse-engineering the runtime from CI plumbing. Composes the gemba-*
  capability skills into one loop.
---

# Gemba Platform

Gemba is the agent-runtime platform: the command family and CI actions a team
hires to stand up and operate an agent team. It ships one loop on two
surfaces — commands for a terminal, composite actions for CI — so what a team
rehearses locally is exactly what runs on every push. In Lean practice,
*gemba* is the actual place where the work happens.

## When to Use

**Stand up an agent team:**

- Bootstrapping the runtime in CI — the `forwardimpact/bootstrap` action
  installs the toolchain and the pinned platform binaries; its `fit-install.sh`
  installer runs the same way in any shell
- Installing the command family — `@forwardimpact/gemba` on npm carries all
  six `gemba-*` commands

**Operate the loop** (each step has its own skill with full command
documentation):

- **Run** — `gemba-harness` runs agents and captures NDJSON traces; the
  `forwardimpact/harness` action is the same run step in CI
- **See** — `gemba-trace` downloads, queries, and analyzes those traces
- **Remember** — `gemba-wiki` keeps team memory across sessions; the
  `forwardimpact/wiki` action pushes it from CI
- **Measure** — `gemba-xmr` charts metrics as XmR control charts;
  `gemba-benchmark` and the `forwardimpact/benchmark` action prove changes
  with pass@k evidence

**Guard the loop:**

- `gemba-selfedit` gives a sandboxed agent a narrow, audited path to write
  instruction files the project allowlist permits

## How the Capabilities Compose

The loop is **stand up → run → see → remember → measure**, and each step
feeds the next: bootstrap installs the binaries the harness runs; the harness
emits the traces the trace tools read; findings from traces land in wiki
memory so the next session starts oriented; metrics recorded per run land on
control charts that separate real change from noise. A team adopts the whole
loop or any prefix of it — running sessions without charts is fine; charts
without traces to explain them is guesswork.

The platform exposes commands and actions only — it has no importable API.
When you need the components behind the commands, import the runtime
libraries directly; the platform never wraps them.

## Documentation

- [Stand Up and Operate an Agent Team](https://www.forwardimpact.team/gemba/index.md)
  — The platform overview: both surfaces of the loop and the bring-up layer.
- [Coordinate an Agent Team](https://www.forwardimpact.team/docs/libraries/coordinate-team/index.md)
  — Run a lead and N participant agents in one async session.
- [Prove Agent Changes](https://www.forwardimpact.team/docs/libraries/prove-changes/index.md)
  — End-to-end workflow from dataset generation through evaluation to trace
  analysis.
- [Operate a Predictable Agent Team](https://www.forwardimpact.team/docs/libraries/predictable-team/index.md)
  — Wiki memory, XmR charts, and team coordination.
