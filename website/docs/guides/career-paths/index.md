---
title: "Career Paths"
description: "Browse job definitions, understand skill proficiencies, and analyze career progression."
---

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
npx fit-pathway discipline --list
npx fit-pathway skill --list
npx fit-pathway level --list
npx fit-pathway track --list
npx fit-pathway behaviour --list
npx fit-pathway driver --list
npx fit-pathway stage --list
```

## View a Job Definition

See the full job definition for a specific role:

```sh
npx fit-pathway job software_engineering J060
```

Apply a track to see how the role shifts in a specific context:

```sh
npx fit-pathway job software_engineering J060 --track=platform
```

The output includes the role's skill expectations with proficiency levels,
behaviour expectations with maturity levels, responsibilities, and scope.

## Understanding Skill Proficiencies

Skills are assessed on a five-level proficiency scale. Each level describes
increasing autonomy and scope:

| Proficiency    | Autonomy              | Scope                    | Typical Verbs                     |
| -------------- | --------------------- | ------------------------ | --------------------------------- |
| `awareness`    | with guidance         | team                     | understand, follow, use, learn    |
| `foundational` | with minimal guidance | team                     | apply, create, explain, identify  |
| `working`      | independently         | team                     | design, own, troubleshoot, decide |
| `practitioner` | lead, mentor          | area (2–5 teams)         | lead, mentor, establish, evaluate |
| `expert`       | define, shape         | business unit / function | define, shape, innovate, pioneer  |

A job definition specifies the expected proficiency for each skill. Not every
skill needs to be at the same level — disciplines use a T-shaped model where
core skills go deeper than supporting or broad skills.

## Understanding Behaviour Maturities

Behaviours describe how engineers approach their work. They are assessed on a
maturity scale:

| Maturity        | Description                                          |
| --------------- | ---------------------------------------------------- |
| `emerging`      | Shows interest, needs prompting                      |
| `developing`    | Regularly applies with some guidance                 |
| `practicing`    | Consistently demonstrates in daily work              |
| `role_modeling` | Influences the team's approach, others seek them out |
| `exemplifying`  | Shapes organizational culture in this area           |

## Career Progression

See what is expected at your current level:

```sh
npx fit-pathway progress software_engineering J040 --track=platform
```

Compare your current level with a target level to see what changes:

```sh
npx fit-pathway progress software_engineering J040 --track=platform --compare=J060
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
