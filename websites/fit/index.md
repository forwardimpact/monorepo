---
title: Forward Impact Engineering
description: An open-source suite built on one idea — define your engineering standard once, then derive roles, agent profiles, career guidance, measurement, and staffing from it.
toc: false
layout: home
hero:
  image: /assets/scene-concept.svg
  alt: An engineer in a hoodie, an AI robot, and a business professional wave hello
  title: One standard.<br>Engineers grow by it.<br>Agents follow it.
  subtitle: Define what good engineering looks like once, then derive everything else from it — job definitions, agent profiles, career guidance, measurement, and staffing decisions you can defend. Same standard, different outputs.
  cta:
    - label: Explore the suite
      href: /docs/
    - label: View on GitHub
      href: https://github.com/forwardimpact/monorepo/
      secondary: true
---

<div class="section section-warm">
  <div class="page-container">
    <div class="grid">

<a class="product-card" href="/map/">

![Map](/assets/icon-map.svg)

### Map — define the standard

Two managers shouldn't disagree on what 'senior' means. Map turns implicit
expectations into a validated, plain-text standard that the rest of the suite
derives from.

<div class="btn btn-ghost">Learn more</div>
</a>

<a class="product-card" href="/pathway/">

![Pathway](/assets/icon-pathway.svg)

### Pathway — derive roles and agents

The compiler for your standard. Feed it a discipline, track, and level and get
a complete job definition. Drop the level and get an agent profile instead.

<div class="btn btn-ghost">Learn more</div>
</a>

<a class="product-card" href="/guide/">

![Guide](/assets/icon-guide.svg)

### Guide — ask the standard

Career guidance for engineers and second opinions on agent work, grounded in
your standard instead of generic best practice.

<div class="btn btn-ghost">Learn more</div>
</a>

<a class="product-card" href="/landmark/">

![Landmark](/assets/icon-landmark.svg)

### Landmark — measure without surveillance

Track progress with evidence, trends, and engineer voice instead of ticket
counts. Nobody gets singled out.

<div class="btn btn-ghost">Learn more</div>
</a>

<a class="product-card" href="/summit/">

![Summit](/assets/icon-summit.svg)

### Summit — staff with evidence

Model the team as a system. See capability coverage, structural risks, and
what-if scenarios before you make the staffing decision.

<div class="btn btn-ghost">Learn more</div>
</a>

</div>
  </div>
</div>

<div class="section">
  <div class="page-container content-product">

## Companions

### Outpost

Outpost syncs your email, calendar, and notes into briefings, so you walk into
every meeting already oriented.

<a href="/outpost/" class="btn btn-ghost">Learn more</a>

### Kata

An autonomous agent team that runs a daily Plan-Do-Study-Act cycle: it plans
specs, ships features, studies its own traces, and acts on what it finds.

<a href="https://www.kata.team" class="btn btn-ghost">Visit kata.team</a>

### Gemba

For teams using agents: the runtime platform. Stand up the environment, run
sessions, inspect traces, persist memory, and measure outcomes — one command
family and the same loop as CI actions.

<a href="/gemba/" class="btn btn-ghost">Learn more</a>

### Gear

For platform builders: the libraries and services the suite is built from,
published to npm. Humans and agents share the same interface and docs.

<a href="/gear/" class="btn btn-ghost">Learn more</a>

  </div>
</div>

<div class="section section-contour section-philosophy">
  <div class="page-container">

![An engineer, an AI robot, and a business professional kneel around a large unfolded map, tracing routes together](/assets/scene-map.svg)

> "The aim of leadership should be to improve the performance of man and
> machine, to improve quality, to increase output, and simultaneously to bring
> pride of workmanship to people."
>
> — W. Edwards Deming

Forward Impact Engineering puts this into practice. Engineering leaders define
what great engineering looks like. Engineers see exactly what's expected, find
growth areas with real evidence, and configure agents to the same standard
they're measured by. Leaders demonstrate progress and staff teams without
blaming individuals or relying on guesswork. When expectations are clear and
progress is visible, engineers deliver with confidence and pride.

  <div class="hero-cta" style="margin-top: var(--space-6);">
    <a href="/about/" class="btn btn-secondary">Read our philosophy</a>
  </div>
  </div>
</div>

<div class="section">
  <div class="page-container content-product">

## Get Started

### For Engineering Leaders

Define your engineering standard and publish it for the whole organization:

```sh
npx fit-map init
npx fit-pathway build --url=https://pathway.myorg.com
```

### For Empowered Engineers

See what's expected at your level, then generate an agent profile from the
same standard:

```sh
npx fit-pathway skill --list
npx fit-pathway agent software-engineering --track=platform
```

### For Platform Builders

Install the shared skill pack and browse the library catalog:

```sh
apm install forwardimpact/fit-skills
```

  </div>
</div>
