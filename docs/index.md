---
title: Forward Impact Team
description: An open-source suite that helps organizations empower engineers with clear expectations, career growth, and the clarity to do their best work.
toc: false
layout: home
hero:
  image: /assets/heros/welcome.svg
  alt: An engineer in a hoodie, an AI robot, and a business professional wave hello
  title: Empowered engineers<br>deliver lasting impact.
  subtitle: Map, Pathway, Guide, and Basecamp — an open-source suite that helps organizations define great engineering, support career growth, and give every engineer the clarity to do their best work in the field.
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

![Map](/assets/icons/map.svg)

### Map

Chart the territory. Define your engineering skills, behaviours, and career levels in plain YAML — the single source of truth.

<div class="btn btn-ghost">Learn more</div>
</a>

<a class="product-card" href="/pathway/">

![Pathway](/assets/icons/pathway.svg)

### Pathway

Navigate the trail. Browse career paths, generate agent teams, and build progression plans — in the browser or from the CLI.

<div class="btn btn-ghost">Learn more</div>
</a>

<a class="product-card" href="/guide/">

![Guide](/assets/icons/guide.svg)

### Guide

Find your bearing. AI-powered onboarding and career advice that helps engineers orient in unfamiliar terrain.

<div class="btn btn-ghost">Learn more</div>
</a>

<a class="product-card" href="/basecamp/">

![Basecamp](/assets/icons/basecamp.svg)

### Basecamp

Set up camp. A personal knowledge system with scheduled AI tasks that keeps you briefed, organized, and field-ready.

<div class="btn btn-ghost">Learn more</div>
</a>

</div>
  </div>
</div>

<div class="section">
  <div class="page-container">
    <div class="grid">

<div>

#### One Source of Truth

Skills, behaviours, and grades defined once in YAML — used everywhere, by humans and machines alike.

</div>

<div>

#### Human + Machine

Career frameworks and AI agent profiles derived from the same foundation. Co-located in the same files.

</div>

<div>

#### Data-Driven

Plain YAML files. No vendor lock-in. Your data, your way. Different installations use the same model.

</div>

<div>

#### Ready to Deploy

Works at the command line, in VS Code, and on the web — meeting engineers where they already work.

</div>

</div>
  </div>
</div>

<div class="section section-contour section-philosophy">
  <div class="page-container">

![An engineer, an AI robot, and a business professional kneel around a large unfolded map, tracing routes together](/assets/heros/map.svg)

> "The aim of leadership should be to improve the performance of man and machine, to improve quality, to increase output, and simultaneously to bring pride of workmanship to people."
>
> — W. Edwards Deming

Forward Impact Team puts this into practice. Organizations define what great engineering looks like — skills, behaviours, and career levels — in a shared framework. Engineers gain clear expectations, career paths, AI assistance, and knowledge systems matched to their standards. When the path forward is clear, engineers deliver with confidence and pride.

  <div class="hero-cta" style="margin-top: var(--space-6);">
    <a href="/about/" class="btn btn-secondary">Read our philosophy</a>
  </div>
  </div>
</div>

<div class="section">
  <div class="page-container content-product">

## Get Started

### For organizations

Define and publish an engineering career framework for your team:

```sh
npx fit-pathway build --url=https://pathway.myorg.com
```

### For engineers

Install the CLI and explore what's available:

```sh
npx fit-pathway skill --list        # Browse all skills
npx fit-pathway job se L3            # Generate a job definition
npx fit-pathway agent se --track=dx  # Generate agent profiles
```

### For personal productivity

Set up Basecamp and let scheduled AI tasks keep you organized:

```sh
npx fit-basecamp --init ~/Documents/Team
npx fit-basecamp --daemon
```

  </div>
</div>
