---
title: Gear
description: Shared libraries and services for platform builders and agents — CLIs, retrieval, evaluation, and infrastructure published to npm.
layout: product
toc: false
hero:
  image: /assets/scene-gear.svg
  alt: An engineer in a hoodie, an AI robot, and a business professional wave hello
  subtitle: Carry the right gear. Shared libraries and services for platform builders and agents — CLIs, retrieval primitives, evaluation tooling, and service infrastructure published to npm and the forwardimpact/fit-skills skill pack.
  cta:
    - label: Browse the catalog
      href: https://github.com/forwardimpact/monorepo/tree/main/libraries
    - label: Library Guides
      href: /docs/libraries/
      secondary: true
---

Platform builders composing agentic products need focused, interoperable
libraries and services — not monolithic frameworks. Gear provides individual
capabilities that work standalone or together, with humans and agents sharing
the same interface and documentation.

## What becomes possible

### For Platform Builders

Give humans and agents shared capabilities through the same interface, with
tooling to prove changes improved outcomes. Every CLI prints
grep-friendly help and JSON output; every library ships a matching skill in the
`forwardimpact/fit-skills` pack so agents land on the same docs as humans.

39 libraries and 15 services, all published to npm under
`@forwardimpact/lib*` and `@forwardimpact/svc*`. Browse the full tables in
[libraries/README.md](https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md)
and
[services/README.md](https://github.com/forwardimpact/monorepo/blob/main/services/README.md).

<div class="grid">

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-bridge-threaded-channels-to-the-agent-team">

### Bridge Threaded Channels to the Agent Team

Ship a chat or discussion adapter without rebuilding the intake skeleton,
callback registry, and durable thread state from scratch each time.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-enable-agents-on-every-surface">

### Enable Agents on Every Surface

Give agents and humans the same interface so capabilities ship once. Render
structured output across web and terminal from shared handler logic.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-ground-agents-in-context">

### Ground Agents in Context

Answer relationship questions, look up context fast, and give agents typed,
retrievable knowledge with semantic search — no external database required.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-ground-service-contracts-in-one-source">

### Ground Service Contracts in One Source

Publish a service proto that resolves on any external install, so consumers
never chase a shared schema living in a package they never pulled in.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-integrate-with-the-engineering-standard">

### Integrate with the Engineering Standard

Distribute skill packs through the tools agents and engineers already use, and
turn engineering standard definitions into queryable, derivable data.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-keep-instruction-layers-honest">

### Keep Instruction Layers Honest

Enforce instruction-layer length caps and JTBD invariants automatically, so a
docs change cannot quietly drift the layered architecture.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-keep-service-contracts-typed">

### Keep Service Contracts Typed

Keep JavaScript types in sync with proto definitions and register gRPC services
as MCP tools from config, with no hand-written glue.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-keep-services-running-and-visible">

### Run a Predictable Platform

Preflight checks before anything heavy runs, supervised processes, structured
telemetry, and instruction layers that stay honest.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-prove-agent-changes">

### Prove Agent Changes

Get reproducible evidence for whether an agent change actually helped, and
generate complete eval datasets from a single DSL file.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-ship-predictable-clis">

### Ship Predictable CLIs

Enforce a runtime floor before any heavy import evaluates, so a CLI surfaces
your version error instead of a confusing one from deep in a dependency.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-ship-predictable-services">

### Ship Predictable Services

Fail fast at startup before a service constructs partially against an unsafe
default, turning a silent misconfiguration into a clear early error.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-ship-service-endpoints-without-boilerplate">

### Ship Service Endpoints Without Boilerplate

Stand up an HTTP or gRPC endpoint without reimplementing server lifecycle,
security headers, health checks, or transport every time.

</a>

</div>

### For Empowered Engineers

Run an agent team that remembers what it learned and acts on real signal. Give
the team memory that survives across sessions, and separate a genuine shift in a
metric from ordinary variation before anyone reacts to it.

<div class="grid">

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#empowered-engineers-operate-a-predictable-agent-team">

### Operate a Predictable Agent Team

Give agent teams memory that persists across sessions, and chart a metric to see
whether its latest move is a real change or just expected variation.

</a>

</div>

---

## Getting Started

```sh
npm install @forwardimpact/libcli @forwardimpact/libstorage  # any subset
npx skills add forwardimpact/fit-skills
```

<div class="grid">

<!-- part:card:../docs/libraries -->

<a href="https://github.com/forwardimpact/monorepo/tree/main/libraries">

### Browse on GitHub

Source code and per-library README for every entry in the catalog.

</a>

</div>
