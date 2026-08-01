---
title: "Define a New Role"
description: "Move from a blank slate to a well-structured role definition. Build it from existing disciplines and tracks, then customize it to fit."
---

You need to add a new role to your engineering standard. Pathway can generate a
first draft from your existing disciplines, levels, and tracks. You do not write
from scratch.

## Prerequisites

Complete the
[Authoring Agent-Aligned Engineering Standards](/docs/products/authoring-standards/)
guide first. The steps below assume `npx fit-map validate` passes. They also
assume your `data/pathway/` directory contains at least one discipline, one
level, and one capability with skills.

## Step 1: Choose the building blocks

A role is a combination of three entities: a **discipline** (the engineering
specialty), a **level** (the career rung), and an optional **track** (a
work-context modifier). Before you create anything new, check what already
exists.

List your disciplines:

```sh
npx fit-pathway discipline --list
```

Example output:

```text
software-engineering
data-engineering
engineering-management
```

List available tracks:

```sh
npx fit-pathway track --list
```

Example output:

```text
platform
sre
```

If the new role fits an existing discipline and track, skip to
[Step 4](#step-4-generate-and-review-the-role). Otherwise, continue to create
the missing entity.

## Step 2: Create a discipline

Create a new YAML file in `data/pathway/disciplines/`. The filename is the
discipline ID in kebab-case.

```yaml
# data/pathway/disciplines/site-reliability.yaml
specialization: Site Reliability Engineering
roleTitle: Site Reliability Engineer
isProfessional: true

validTracks:
  - null           # allow trackless (generalist)
  - platform

coreSkills:
  - sre-practices
  - incident-management
  - observability
supportingSkills:
  - cloud-platforms
  - change-management
broadSkills:
  - architecture-design
  - stakeholder-management
```

Required fields:

- `specialization` -- the display name (e.g., "Site Reliability Engineering")
- `roleTitle` -- the base title that generated roles use (e.g., "Site
  Reliability Engineer")
- `coreSkills` -- at least one skill ID. These map to the level's `core`
  proficiency
- `validTracks` -- which tracks this discipline allows. Include `null` to permit
  a generalist (trackless) configuration

Every skill ID in `coreSkills`, `supportingSkills`, and `broadSkills` must
reference a skill that exists in your `data/pathway/capabilities/` files. Run
`npx fit-pathway skill --list` to see available IDs.

See the [YAML Schema Reference](/docs/reference/yaml-schema/) for the full set
of discipline fields. The set includes the `human:` and `agent:` sections,
`behaviourModifiers`, `minLevel`, and `hidden`.

## Step 3: Create a track (optional)

If the new role needs a work-context modifier that does not exist yet, create a
track file in `data/pathway/tracks/`:

```yaml
# data/pathway/tracks/security.yaml
name: Security Engineering

skillModifiers:
  reliability: 1
  delivery: -1
behaviourModifiers:
  systems-thinking: 1
```

Track `skillModifiers` target **capability IDs**. They do not target individual
skill IDs. A modifier of `+1` raises all skills in that capability by one
proficiency level. A modifier of `-1` lowers them by one. After you create the
track, add its ID to the `validTracks` array in every discipline that should
support it.

## Step 4: Generate and review the role

With the discipline, level, and optional track in place, generate the role to
see the derived requirements:

```sh
npx fit-pathway job site_reliability J060
```

The output includes a behaviour profile and a skill matrix with derived
proficiencies:

```text
## Skill Matrix

| Skill | Level |
| --- | --- |
| SRE Practices | Working |
| Incident Management | Working |
| Observability | Working |
| Cloud Platforms | Foundational |
| Change Management | Foundational |
| Architecture Design | Awareness |
| Stakeholder Management | Awareness |
```

Add a track to see how modifiers shift expectations:

```sh
npx fit-pathway job site_reliability J060 --track=platform
```

The skill matrix reflects the track's `skillModifiers`. Capabilities with a `+1`
modifier appear one proficiency level higher. Capabilities with a `-1` modifier
appear one level lower.

## Step 5: Customize and iterate

If the derived expectations do not match what the organization needs, adjust:

- **Wrong proficiency levels?** -- Move skill IDs between `coreSkills`,
  `supportingSkills`, and `broadSkills`. Core inherits the highest baseline.
- **Missing skills?** -- Add the skill to a capability file. Then reference it
  in the discipline.
- **Track over- or under-corrects?** -- Adjust `skillModifiers` values.
- **Behaviour emphasis wrong?** -- Update `behaviourModifiers` on the discipline
  or track.

After each change, re-run `npx fit-map validate` to confirm the YAML is
structurally correct. Then regenerate the role to check the result.

## Verify

Three checks confirm the new role is complete:

**1. Validation passes** -- `npx fit-map validate` prints `Validation passed`.

**2. The role generates with the expected shape:**

```sh
npx fit-pathway job site_reliability J060
```

Confirm the skill matrix and behaviour profile match what the organization
expects at this discipline and level.

**3. All valid combinations include the new role:**

```sh
npx fit-pathway job --list
```

```text
software-engineering J040, Software Engineer Level I
software-engineering J060, Software Engineer Level II
software-engineering J060 platform, Software Engineer Level II - Platform
site_reliability J060, Site Reliability Engineer Level II
site_reliability J060 platform, Site Reliability Engineer Level II - Platform
```

The new discipline appears with every level it supports.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
