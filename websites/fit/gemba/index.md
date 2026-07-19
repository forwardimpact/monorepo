---
title: Gemba
description: Stand up and operate an agent team — one platform whose CLIs and CI actions run the same loop of bootstrapping the environment, running sessions, inspecting traces, persisting memory, and measuring outcomes.
layout: product
toc: false
hero:
  image: /assets/scene-gemba.svg
  alt: An engineer, an AI robot, and a business professional work a staked trail that loops from a tent past run, see, remember, and measure markers
  subtitle: Go to where the work happens. Gemba is the agent-runtime platform — the command family and CI actions a team uses to stand up coding agents, run sessions, read traces, keep memory, and measure outcomes.
  cta:
    - label: Get started
      href: "#getting-started"
    - label: Browse the actions
      href: https://github.com/forwardimpact/monorepo/tree/main/products/gemba/actions
      secondary: true
---

Teams that want to run coding agents continuously end up rebuilding the same
plumbing: a bootstrap script, a session harness, somewhere for traces to go,
somewhere for memory to live, and a way to tell real improvement from noise.
Gemba packages that loop as one platform. In Lean practice, *gemba* is the
actual place where the work happens — this platform is where your agent team
does.

## One loop, two surfaces

The runtime loop is **stand up → run → see → remember → measure**. Gemba
ships it twice — as commands for a terminal, and as composite actions for CI —
so what a team rehearses locally is exactly what runs on every push.

### The command family

| Step | Command | What it does |
| --- | --- | --- |
| Stand up | `fit-install.sh` / bootstrap | Install the pinned toolchain and the platform CLIs |
| Run | `gemba-harness` | Run agents and capture NDJSON traces — single agent or multi-agent sessions |
| See | `gemba-trace` | Download, query, and analyze the traces `gemba-harness` produced |
| Remember | `gemba-wiki` | Persistent wiki memory: boot digests, claims, memos, integrity audits |
| Measure | `gemba-xmr` | Wheeler/Vacanti XmR control charts over the team's metric CSVs |

Two more commands round out the family: `gemba-benchmark` proves whether an
agent change helped with pass@k evidence, and `gemba-selfedit` gives a
sandboxed agent a narrow, audited path to edit its own instruction files.

Every command installs with the platform package and runs standalone:

```sh
npx gemba-harness run --task-file=task.md --output=trace.ndjson
npx gemba-trace overview --file trace.ndjson
npx gemba-wiki boot --agent staff-engineer
npx gemba-xmr analyze wiki/metrics/team/2026.csv
```

### The CI actions

The same loop runs in GitHub Actions through four published composite
actions, each pinned by SHA in consuming workflows:

| Step | Action | What it does |
| --- | --- | --- |
| Stand up | [`forwardimpact/bootstrap`](https://github.com/forwardimpact/bootstrap) | The FIT environment: Bun, cached workspace, wiki checkout, pinned CLI binaries |
| Run | [`forwardimpact/harness`](https://github.com/forwardimpact/harness) | Execute an agent task via `gemba-harness` and upload the trace |
| Remember | [`forwardimpact/wiki`](https://github.com/forwardimpact/wiki) | Run a `gemba-wiki` memory command with a freshly minted token |
| Measure | [`forwardimpact/benchmark`](https://github.com/forwardimpact/benchmark) | Run `gemba-benchmark` families across machines and merge reports |

## What becomes possible

### For Teams Using Agents

Stand up and operate an agent team on one platform: bootstrap the
environment, run sessions, inspect traces, persist memory, and measure
outcomes. The evidence never evaporates — every session leaves a trace, every
finding lands in shared memory, and every metric lands on a control chart
that separates real change from fluctuation.

### For Platform Builders

The platform is a consumer of published runtime libraries, never a wrapper
around them. When you need the components rather than the commands, import
the libraries directly — `@forwardimpact/libharness` for sessions and
traces, `@forwardimpact/libwiki` for memory, `@forwardimpact/libxmr` for
control charts. Gemba adds no importable API of its own; see the
[library guides](/docs/libraries/) for the API surface.

## Kata: the reference tenant

[Kata](https://www.kata.team) — the autonomous agent team that plans specs,
ships features, studies its traces, and acts on findings — runs on exactly
this platform, daily. Kata proves the substrate is generic: its skills invoke
the same `gemba-*` commands and its workflows pin the same four actions any
other team would. Nothing in the platform knows Kata exists.

## Getting Started

The bring-up layer is the `bootstrap` action and its installer. In CI:

```yaml
- uses: forwardimpact/bootstrap@v1
  with:
    clis: gemba-harness gemba-trace gemba-wiki
```

On a workstation, the same installer bootstraps with one line — substitute
the newest `gear@v*` tag from the
[releases page](https://github.com/forwardimpact/monorepo/releases):

```sh
curl -fsSL https://github.com/forwardimpact/monorepo/releases/download/<gear-release>/fit-install.sh | bash
```

Or install the command family from npm:

```sh
npm install -g @forwardimpact/gemba
gemba-harness --help
```

Contributors working inside a Forward Impact-style monorepo get the same
environment from `scripts/bootstrap.sh`, which the bootstrap action also
runs in CI.
