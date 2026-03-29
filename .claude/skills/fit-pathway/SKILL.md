---
name: fit-pathway
description: >
  Work with the @forwardimpact/pathway package. Use when exploring roles,
  skills, career progression, or agent profiles via the CLI, or when modifying
  the web app, CLI commands, formatters, pages, or templates.
---

# Pathway Package

Web application, CLI, and formatters for career progression, job definitions,
and agent profile generation. Three audiences use `fit-pathway` differently:

| Audience          | Goal                                                | How they run it                                   |
| ----------------- | --------------------------------------------------- | ------------------------------------------------- |
| **Maintainers**   | Develop and improve `@forwardimpact/pathway` itself | `npx fit-pathway` from the monorepo workspace     |
| **Organizations** | Publish a career framework for their engineers      | `npx fit-pathway build` in a standalone project   |
| **Engineers**     | Explore jobs, skills, and career progression        | `fit-pathway` installed globally on their machine |

## When to Use This Skill

**CLI exploration and discovery:**

- Exploring disciplines, tracks, levels, skills, behaviours, or drivers
- Generating or comparing job definitions across tracks and levels
- Analyzing career progression between levels
- Generating AI agent configurations from the framework
- Answering questions about roles, skill expectations, or career paths

**Framework setup and publishing:**

- Setting up an organization's career framework project
- Building a static site for the framework
- Running a local development server to preview changes

---

## How It Works

### Job Derivation

A job is derived in real-time from three inputs: **discipline**, **level**, and
optionally **track**. For each skill in the discipline:

1. The skill's tier determines its type — core (primary), supporting
   (secondary), or broad
2. The level's base proficiency for that type sets the starting point (e.g.
   "foundational" for primary skills at J060)
3. Track modifiers shift proficiency up or down **per capability** — a platform
   track with `scale: +1` raises all skills in the scale capability by one
   level, while `delivery: -1` lowers delivery skills
4. Positive modifiers are capped at the level's maximum base proficiency;
   results are clamped to the valid range (awareness → expert)

Behaviours follow the same pattern: base maturity from the level, then
discipline and track modifiers stacked and clamped.

Skills from capabilities the track modifies positively — but that aren't in the
base discipline — are added as broad-type "track-added" skills.

### Agent Derivation

Agent profiles reuse job derivation with three additions:

1. **Reference level** is auto-selected — the first level where primary skills
   reach "practitioner", falling back to "working", then the middle level
2. **Skill filtering** removes `isHumanOnly` skills (physical presence,
   emotional judgment)
3. **Skill focusing** limits the matrix to the most relevant skills per stage,
   sorted by type (primary → secondary → broad → track-added)

Working styles are derived from the top behaviours by maturity — behaviours with
positive track modifiers become personality traits that shape the agent's
approach.

### Tool Derivation

Tools come from `toolReferences` in skill definitions. Derivation collects all
tool references from the job's highest-proficiency skills, deduplicates by name,
and sorts alphabetically. Each tool tracks which skills reference it.

### Interview Questions

Questions are selected from question banks organized by skill/behaviour ID, role
type, and proficiency/maturity. Three interview types exist: mission fit (skill
questions), decomposition (capability questions), and stakeholder simulation
(behaviour questions). Selection prioritizes by skill type and fills a time
budget.

### Career Progression

Progression compares two job derivations (current vs target level) and
calculates deltas — skill proficiency changes, gained/lost skills, and behaviour
maturity changes.

---

## Discovery Workflows

Common patterns for exploring the framework using the CLI. The CLI is
data-driven — entity IDs depend on the YAML files in the active data directory.
Start with summary commands to discover what's available.

### Discover what roles exist on a track

```sh
# 1. See all tracks and which disciplines use them
npx fit-pathway track

# 2. See jobs filtered to a specific track
npx fit-pathway job --track=forward_deployed

# 3. List all job combinations on that track (for piping)
npx fit-pathway job --list --track=forward_deployed

# 4. View a specific role
npx fit-pathway job software_engineering J060 --track=forward_deployed
```

### Understand a discipline's structure

```sh
# 1. See all disciplines with their type (professional/management) and valid tracks
npx fit-pathway discipline

# 2. Drill into a discipline to see skill tiers and behaviour modifiers
npx fit-pathway discipline software_engineering

# 3. Compare the same discipline across tracks
npx fit-pathway job software_engineering J060 --track=platform
npx fit-pathway job software_engineering J060 --track=forward_deployed
```

### Explore career progression

```sh
# 1. See what changes between levels
npx fit-pathway progress software_engineering J060 --track=forward_deployed

# 2. Compare specific levels
npx fit-pathway progress software_engineering J060 --track=forward_deployed --compare=J100
```

### Discover what a track modifies

```sh
# 1. View track detail to see all skill and behaviour modifiers
npx fit-pathway track forward_deployed

# 2. Compare the resulting skill matrices side by side
npx fit-pathway job software_engineering J060 --skills
npx fit-pathway job software_engineering J060 --track=forward_deployed --skills
```

---

## CLI Reference

### Getting Started

```sh
npx fit-pathway init                          # Create ./data/ with example framework data
npx fit-pathway dev                           # Run live development server (default port 3000)
npx fit-pathway dev --port=8080               # Dev server on custom port
npx fit-pathway build --output=./public --url=https://example.com  # Static site
npx fit-pathway update                        # Update local ~/.fit/pathway/ installation
npx fit-pathway update --url=URL              # Update from custom source URL
```

### Entity Browsing

All entity commands support three modes:

| Mode    | Pattern                        | Description                 |
| ------- | ------------------------------ | --------------------------- |
| Summary | `npx fit-pathway <command>`    | Concise overview with stats |
| List    | `npx fit-pathway <cmd> --list` | IDs for piping              |
| Detail  | `npx fit-pathway <cmd> <id>`   | Full entity details         |

Entity commands: `discipline`, `level`, `track`, `behaviour`, `driver`, `stage`,
`skill`, `tool`.

### Job Generation

```sh
npx fit-pathway job                                       # Summary with stats
npx fit-pathway job --track=<track>                       # Summary filtered by track
npx fit-pathway job --list                                # Valid combinations
npx fit-pathway job --list --track=<track>                # Combinations for a track
npx fit-pathway job <discipline> <level>                  # Trackless job
npx fit-pathway job <discipline> <level> --track=<track>  # With track
npx fit-pathway job <discipline> <level> --checklist=code # With checklist
npx fit-pathway job <discipline> <level> --skills         # Skill IDs only
npx fit-pathway job <discipline> <level> --tools          # Tool names only
```

### Agent Generation

```sh
npx fit-pathway agent --list                                        # Valid combinations
npx fit-pathway agent <discipline> --track=<track>                  # Preview
npx fit-pathway agent <discipline> --track=<track> --output=./agents # Write files
npx fit-pathway agent <discipline> --track=<track> --stage=plan     # Single stage
npx fit-pathway agent <discipline> --track=<track> --skills         # Skill IDs only
npx fit-pathway agent <discipline> --track=<track> --tools          # Tool names only
```

### Interview, Progress & Questions

```sh
npx fit-pathway interview <discipline> <level>
npx fit-pathway interview <d> <l> --track=<t> --type=mission
npx fit-pathway progress <discipline> <level>
npx fit-pathway progress <d> <l> --compare=<to_level>
npx fit-pathway questions
npx fit-pathway questions --level=practitioner
npx fit-pathway questions --maturity=practicing
npx fit-pathway questions --skill=<id>
npx fit-pathway questions --behaviour=<id>
npx fit-pathway questions --capability=<id>
npx fit-pathway questions --stats
npx fit-pathway questions --format=yaml          # table, yaml, json
```

Interview types: `mission` (skill questions), `decomposition` (capability
questions), `stakeholder` (behaviour questions).

### Skill Detail

```sh
npx fit-pathway skill <id>          # Human-readable detail
npx fit-pathway skill <id> --agent  # Output as agent SKILL.md format
```

### Agent Output Paths

- Agent profiles: `.github/agents/{id}.agent.md` (VS Code Custom Agents)
- Skill files: `.claude/skills/{skill-name}/SKILL.md` (Agent Skills Standard)

---

## Data Resolution

The CLI resolves the data directory in this order:

1. `--data=<path>` flag (explicit override)
2. Upward traversal from CWD — looks for `data/` (up to 3 parents)
3. `~/.fit/data/` (user-global fallback)

Use `npx fit-pathway init` to create a local `./data/` directory with example
framework data to get started.

---

## Verification

```sh
npx fit-map validate    # Validate data files after changes
npx fit-pathway dev     # Preview changes in browser
```

## Documentation

For deeper context beyond this skill's scope:

- [Agent Teams Guide](https://www.forwardimpact.team/docs/guides/agent-teams/index.md)
  — How to generate and install AI coding agent teams from your career framework
- [Career Paths Guide](https://www.forwardimpact.team/docs/guides/career-paths/index.md)
  — Browse jobs, skills, and career progression between levels
- [CLI Reference](https://www.forwardimpact.team/docs/reference/cli/index.md) —
  Complete command reference for all Forward Impact CLI tools
