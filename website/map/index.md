---
title: Map
description: The data product for your engineering system — framework definitions, organization structure, GitHub activity, and GetDX snapshots.
layout: product
toc: false
hero:
  image: /assets/heros/map.svg
  alt: An engineer, an AI robot, and a business professional kneel around a large unfolded map, tracing routes together
  subtitle: Map is the data product for the FIT suite. It defines your framework in plain YAML and stores operational signals — organization hierarchy, GitHub activity, and GetDX snapshot results — in one model.
  cta:
    - label: For Leadership
      href: /docs/getting-started/leadership/
    - label: For Engineers
      href: /docs/getting-started/engineers/
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/map
      secondary: true
---

> Map is the data product that provides shared context for every product in the
> suite. Teams define the engineering framework once, import operational signals
> continuously, and make that data available to Pathway, Guide, Landmark, and
> Basecamp through stable contracts.

### What you get

- Framework definitions for skills, behaviours, levels, disciplines, and tracks
- A simple people directory with reporting structure
- Team views derived from reporting hierarchy (manager-rooted subtrees)
- GitHub activity data for objective marker evidence analysis
- GetDX snapshot imports for quarterly developer-experience results
- Validation tooling and schema artifacts (JSON Schema + RDF/SHACL)

---

### Who it's for

**Engineering leaders** defining standards and reviewing outcomes in one place.
Map connects framework expectations to operational signals without splitting the
data model across products.

**Platform teams** building internal tooling. Map exposes a stable shared model
for product and analytics use cases.

---

## How Data is Organized

Framework definitions live in YAML. Operational measurements are stored in Map's
activity schema.

### Framework data (YAML)

```
data/
├── levels.yaml           # Career levels (L1–L5)
├── stages.yaml           # Engineering lifecycle phases
├── drivers.yaml          # Organizational outcomes
├── disciplines/          # Engineering specialties
├── tracks/               # Work context modifiers
├── behaviours/           # Approaches to work
├── capabilities/         # Skill groups with responsibilities
└── questions/            # Interview questions
```

### Activity data (ingested)

- Organization people records with manager links
- GitHub events and derived artifacts for marker analysis
- Evidence records linking artifacts to skill markers
- GetDX team catalog and snapshot score imports

---

## Quick Start

Validate your data to make sure everything is connected:

```sh
npx fit-map validate
```

Browse what's defined:

```sh
npx fit-pathway skill --list       # All skills
npx fit-pathway discipline --list  # Engineering specialties
npx fit-pathway level --list       # Career levels
```
