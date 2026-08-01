---
name: fit-pathway
description: >
  See what's expected at your level, configure agents to meet your
  organization's engineering standard, and make staffing decisions you can
  defend. Use when expectations are unclear and you need role definitions
  by discipline, track, and level. Use when agents follow generic practices
  instead of your standard. Use when you analyze career progression gaps.
  Use when you generate job definitions, interview questions, or a
  published engineering standard site.
---

# Pathway Package

Pathway provides a web application, a CLI, and formatters for career
progression, job definitions, and agent-profile generation. Two audiences use
`fit-pathway` differently:

| Audience          | Goal                                                              | How they run it                                 |
| ----------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| **Organizations** | Publish an agent-aligned engineering standard for their engineers | `npx fit-pathway build` in a standalone project |
| **Engineers**     | Explore jobs, skills, and career progression                      | `npx fit-pathway` installed in their project    |

## When to Use

**Understand what's expected at your level:**

- Look up role expectations — `npx fit-pathway job <discipline> <level>`
- Understand proficiency and autonomy at each level —
  `npx fit-pathway level <id>`
- Analyze career progression gaps —
  `npx fit-pathway progress <discipline> <level> --compare=<target>`
- Explore skills, behaviours, and drivers — `npx fit-pathway skill <id>`,
  `npx fit-pathway behaviour <id>`

**Configure agents to meet your engineering standard:**

- Generate agent configurations —
  `npx fit-pathway agent <discipline> --track=<track> --output=./agents`
- Preview what an agent profile includes —
  `npx fit-pathway agent <discipline> --track=<track>`

**Make staffing decisions you can defend:**

- Generate or compare job definitions —
  `npx fit-pathway job <discipline> <level> --track=<track>`
- Select interview questions for a role —
  `npx fit-pathway interview <discipline> <level>`

**Publish and maintain your engineering standard:**

- Set up a standard project — `npx fit-map init`
- Build a static site — `npx fit-pathway build`
- Preview changes — `npx fit-pathway dev`

---

## How It Works

### Job Derivation

Pathway derives a job in real time from three inputs: **discipline**,
**level**, and optionally **track**. For each skill in the discipline:

1. The skill's tier in the discipline — core, supporting, or broad
2. The level's base proficiency for that tier gives the initial value (e.g.
   "foundational" for core skills at J060)
3. Track modifiers shift proficiency up or down **per capability**. A platform
   track with `scale: +1` raises all skills in the scale capability by one
   level. A `delivery: -1` modifier lowers delivery skills
4. The level's maximum base proficiency caps positive modifiers. Pathway clamps
   results to the valid range (awareness → expert)

Behaviours follow the same pattern. They take base maturity from the level.
Pathway then stacks and clamps the discipline and track modifiers.

Some capabilities take a positive track modifier but are not in the base
discipline. Pathway adds their skills as broad-type "track-added" skills.

### Agent Derivation

Agent profiles reuse job derivation with three additions:

1. **Reference level** — Pathway selects it automatically. It takes the first
   level where core skills reach "practitioner". If no level qualifies, it
   falls back to "working", then to the middle level
2. **Skill filter** — Pathway removes `isHumanOnly` skills (physical presence,
   emotional judgment)
3. **Skill focus** — Pathway limits the matrix to the most relevant skills per
   stage and sorts them by tier (core → supporting → broad → track-added)

Pathway derives working styles from the top behaviours by maturity. Behaviours
with positive track modifiers become personality traits. Those traits shape the
agent's approach.

### Tool Derivation

Tools come from `toolReferences` in skill definitions. Pathway collects all tool
references from the job's highest-proficiency skills. It deduplicates them by
name. It sorts them alphabetically. Each tool tracks which skills reference it.

### Interview Questions

Pathway selects questions from question banks. Those banks organize questions by
skill/behaviour ID, role type, and proficiency/maturity. Three interview types
exist: mission fit (skill questions), decomposition (capability questions), and
stakeholder simulation (behaviour questions). Pathway prioritizes by skill type
and fills a time budget.

### Career Progression

Progression compares two job derivations (current vs target level). It
calculates deltas: skill proficiency changes, gained/lost skills, and behaviour
maturity changes.

---

## Discovery Workflows

See [`references/workflows.md`](references/workflows.md) for exploration
patterns and worked examples.

---

## CLI Reference

See [`references/cli.md`](references/cli.md) for full command listings.

---

## Data Resolution

The CLI resolves the data directory in this order:

1. `--data=<path>` flag (explicit override)
2. Upward traversal from CWD — the CLI looks for `data/` (up to 3 parents)
3. `~/.fit/data/` (user-global fallback)

Run `npx fit-map init` to create a local `./data/` directory with starter
standard data.

---

## Build and Serve

```sh
npx fit-pathway build                            # Static site to public/
npx fit-pathway build --url=https://example.com  # With distribution packs
npx fit-pathway serve                            # Serve public/ (port 3000)
npx fit-pathway serve ./dist --port=8080         # Custom dir and port
```

`serve` turns on git smart HTTP. `apm install` uses `git clone --depth=1`. It
then works against the pack repos.

## Verification

```sh
npx fit-map validate    # Validate data files after changes
npx fit-pathway dev     # Preview changes in browser
```

## Documentation

- [Pathway Overview](https://www.forwardimpact.team/pathway/index.md) — Product
  overview, audience model, and key concepts
- [Getting Started: Pathway for Engineers](https://www.forwardimpact.team/docs/getting-started/engineers/pathway/index.md)
  — From zero to a running Pathway site
- [Authoring Agent-Aligned Engineering Standards](https://www.forwardimpact.team/docs/products/authoring-standards/index.md)
  — End-to-end guide to defining your engineering standard in YAML
- [Validate and Update the Standard](https://www.forwardimpact.team/docs/products/authoring-standards/update-standard/index.md)
  — Run validation, interpret errors, and update safely
- [Configure Agents to Meet Your Engineering Standard](https://www.forwardimpact.team/docs/products/agent-teams/index.md)
  — Generate, structure, and maintain exported agent teams
- [Give Agents Organizational Context](https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md)
  — Track-scoped team instructions and installation-scoped organizational context
  for exported agent teams
- [See What's Expected at Your Level](https://www.forwardimpact.team/docs/products/career-paths/index.md)
  — Browse jobs, skills, and career progression between levels
- [Understand Autonomy and Scope](https://www.forwardimpact.team/docs/products/career-paths/autonomy-scope/index.md)
  — What each level implies for decision-making and ownership
