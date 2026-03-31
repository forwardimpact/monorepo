---
title: "Career Paths"
description: "Browse job definitions, understand skill proficiencies, and analyze career progression."
---

# Career Paths

Pathway shows you what engineering roles look like at every level — the skills
expected, the behaviours valued, and how roles change across disciplines and
tracks. It turns framework definitions into concrete job descriptions,
progression roadmaps, and gap analyses.

## What Pathway Shows You

- **Job definitions** — Complete role descriptions for any combination of
  discipline, level, and track
- **Skill expectations** — Which skills matter at each level and what
  proficiency is expected
- **Behaviour expectations** — How engineers are expected to work at each level
- **Career progression** — What changes between your current level and the next
  one
- **Gap analysis** — Where you stand relative to a target role

## Browse Entities

Explore what is defined in your framework:

```sh
bunx fit-pathway discipline --list
bunx fit-pathway skill --list
bunx fit-pathway level --list
bunx fit-pathway track --list
bunx fit-pathway behaviour --list
bunx fit-pathway driver --list
bunx fit-pathway stage --list
```

## View a Job Definition

See the full job definition for a specific role:

```sh
bunx fit-pathway job software_engineering L3
```

Apply a track to see how the role shifts in a specific context:

```sh
bunx fit-pathway job software_engineering L3 --track=platform
```

The output includes the role's skill expectations with proficiency levels,
behaviour expectations with maturity levels, responsibilities, and scope.

## Understanding Skill Proficiencies

Skills are assessed on a five-level proficiency scale. Each level describes
increasing autonomy and scope:

| Proficiency      | Autonomy              | Scope                    | Typical Verbs                     |
| ---------------- | --------------------- | ------------------------ | --------------------------------- |
| **awareness**    | With guidance         | Team                     | understand, follow, use, learn    |
| **foundational** | With minimal guidance | Team                     | apply, create, explain, identify  |
| **working**      | Independently         | Team                     | design, own, troubleshoot, decide |
| **practitioner** | Lead, mentor          | Area (2-5 teams)         | lead, mentor, establish, evaluate |
| **expert**       | Define, shape         | Business unit / function | define, shape, innovate, pioneer  |

A job definition specifies the expected proficiency for each skill. Not every
skill needs to be at the same level — disciplines use a T-shaped model where
core skills go deeper than supporting or broad skills.

## Understanding Behaviour Maturities

Behaviours describe how engineers approach their work. They are assessed on a
maturity scale:

| Maturity          | Description                                                           |
| ----------------- | --------------------------------------------------------------------- |
| **emerging**      | Beginning to demonstrate the behaviour with support                   |
| **developing**    | Showing the behaviour more consistently, building habits              |
| **practicing**    | Reliably demonstrating the behaviour in daily work                    |
| **role_modeling** | Others look to you as an example of this behaviour                    |
| **exemplifying**  | You define and shape how the organization thinks about this behaviour |

## Career Progression

See what is expected at your current level:

```sh
bunx fit-pathway progress software_engineering L3 --track=platform
```

Compare your current level with a target level to see what changes:

```sh
bunx fit-pathway progress software_engineering L3 --track=platform --compare=L4
```

The comparison highlights:

- Skills where the expected proficiency increases
- Behaviours where the expected maturity increases
- New responsibilities that appear at the target level
- Changes in scope and autonomy

This makes promotion criteria concrete — instead of vague descriptions, you see
exactly which skills need to grow and by how much.

## Related Documentation

- [Data Model Reference](/docs/reference/model/) — how disciplines, tracks,
  skills, and levels relate
- [CLI Reference](/docs/reference/cli/) — complete command documentation for
  `fit-pathway`
