---
title: Gear
description: Shared libraries and services for platform builders and agents. Gear publishes CLIs, retrieval, evaluation, and infrastructure to npm.
layout: product
toc: false
hero:
  image: /assets/scene-gear.svg
  alt: An engineer in a hoodie, an AI robot, and a business professional wave hello
  subtitle: Carry the right gear. Shared libraries and services for platform builders and agents. Gear publishes CLIs, retrieval primitives, evaluation tools, and service infrastructure to npm and the forwardimpact/fit-skills skill pack.
  cta:
    - label: Browse the catalog
      href: https://github.com/forwardimpact/monorepo/tree/main/libraries
    - label: Library Guides
      href: /docs/libraries/
      secondary: true
---

Platform builders who compose agentic products need focused, interoperable
libraries and services. They do not need monolithic frameworks. Gear provides
individual capabilities that work standalone or together. Humans and agents
share the same interface and documentation.

## What becomes possible

### For Platform Builders

Give humans and agents shared capabilities through the same interface, with
tools to prove that changes improved outcomes. Every CLI prints grep-friendly
help and JSON output. Most libraries ship a matching skill in the
`forwardimpact/fit-skills` pack. Agents then land on the same docs as humans.

The pack ships these packages. All publish to npm under
`@forwardimpact/lib*` and `@forwardimpact/svc*`:

- <!-- enum:libraries-list:count -->41<!-- /enum --> libraries
- <!-- enum:services-tree:count -->15<!-- /enum --> services

Browse the full tables in
[libraries/README.md](https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md)
and
[services/README.md](https://github.com/forwardimpact/monorepo/blob/main/services/README.md).

<div class="grid">

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-coordinate-an-agent-team">

### Coordinate an Agent Team

Ship a chat or discussion adapter. Do not rebuild the intake skeleton, the
callback registry, and the durable thread state from scratch each time.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-enable-agents-on-every-surface">

### Enable Agents on Every Surface

Give agents and humans the same interface so capabilities ship once. Render
structured output across web and terminal from shared handler logic.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-ground-agents-in-context">

### Ground Agents in Context

Answer relationship questions. Look up context fast. Give agents typed,
retrievable knowledge with semantic search. You need no external database.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-integrate-with-the-engineering-standard">

### Integrate with the Engineering Standard

Distribute skill packs through the tools agents and engineers already use.
Turn engineering standard definitions into queryable, derivable data.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-keep-service-contracts-typed">

### Keep Service Contracts Typed

Generate types, clients, endpoints, and MCP tools from one proto source. A
published proto resolves on any external install. No consumer chases a
schema it never pulled in.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-prove-agent-changes">

### Prove Agent Changes

Build a deterministic entity graph from one DSL file. Render it to every
format an eval consumes and validate it before the run.

</a>

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-run-a-predictable-platform">

### Run a Predictable Platform

Check preconditions before heavy work runs. Supervise long-running processes.
Emit structured telemetry. Keep instruction files honest. A CLI
then prints your own version error instead of a confusing one from deep in a
dependency.

</a>

</div>

### For Empowered Engineers

Two libraries cover memory and measurement. `libwiki` keeps state that
survives across sessions. `libxmr` separates a real shift in a metric from
ordinary variation.

<div class="grid">

<a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#empowered-engineers-operate-a-predictable-agent-team">

### Operate a Predictable Agent Team

Keep state that survives across sessions. Chart a metric and see whether its
latest point sits inside expected variation.

</a>

</div>

---

## Getting Started

```sh
npm install @forwardimpact/libcli @forwardimpact/libstorage  # any subset
apm install forwardimpact/fit-skills
```

<div class="grid">

<!-- part:card:../docs/libraries -->

<a href="https://github.com/forwardimpact/monorepo/tree/main/libraries">

### Browse on GitHub

Source code and per-library README for every entry in the catalog.

</a>

</div>
