# 170 — Documentation Information Architecture: Plan

## Approach

The reorganization is primarily a content migration — moving, splitting, and
creating markdown files under `website/docs/`. No build system, template, or CSS
changes are needed. The work proceeds in four phases:

1. **Scaffold** — Create the new directory structure with stub index pages.
2. **Migrate** — Split and move existing content into the new hierarchy.
3. **Create** — Write new pages that don't exist today (getting started, Guide,
   Summit, CLI reference, YAML schema reference, career paths).
4. **Update references** — Fix cross-links in docs, update the docs hub, update
   `llms.txt`, add documentation URLs to published skills, and add CLAUDE.md
   clarifications.

Content is the unit of work, not pages. A single existing page (e.g.
`docs/map/index.md`) splits across multiple destinations — the migration table
in the spec is the authoritative map. Each destination page gets its own
frontmatter and stands alone.

### Key decisions

- **Delete old files after migration.** Once content moves, the old file is
  removed in the same commit. No stubs, no redirects (per spec: out of scope).
- **One commit per phase.** Each phase produces a working state where
  `npx fit-doc build` succeeds, making it easy to review and bisect.
- **Guides explain product behaviour, not implementation.** When splitting a
  page, anything referencing module structures, code imports, `src/` paths,
  class names, or internal architecture goes to Internals. Everything else stays
  in Guides or Reference.
- **Frontmatter layout.** New section index pages (`getting-started/index.md`,
  `guides/index.md`, `reference/index.md`, `internals/index.md`) use
  `layout: product` with a grid of cards linking to children — matching the
  current docs hub pattern. Leaf pages use the default layout (with ToC).

---

## Phase 1: Scaffold the new directory structure

Create empty index pages for every new directory. Each has frontmatter (title,
description) and placeholder content that will be replaced in later phases. This
validates that `fit-doc build` handles the new nesting.

### Files created

| File                                                 | Title                         | Layout         |
| ---------------------------------------------------- | ----------------------------- | -------------- |
| `website/docs/getting-started/index.md`              | Getting Started               | product (grid) |
| `website/docs/getting-started/leadership/index.md`   | Getting Started: Leadership   | default        |
| `website/docs/getting-started/developers/index.md`   | Getting Started: Developers   | default        |
| `website/docs/getting-started/contributors/index.md` | Getting Started: Contributors | default        |
| `website/docs/guides/index.md`                       | Guides                        | product (grid) |
| `website/docs/guides/authoring-frameworks/index.md`  | Authoring Frameworks          | default        |
| `website/docs/guides/agent-teams/index.md`           | Agent Teams                   | default        |
| `website/docs/guides/career-paths/index.md`          | Career Paths                  | default        |
| `website/docs/guides/knowledge-systems/index.md`     | Knowledge Systems             | default        |
| `website/docs/guides/engineering-signals/index.md`   | Engineering Signals           | default        |
| `website/docs/guides/team-capability/index.md`       | Team Capability               | default        |
| `website/docs/guides/finding-your-bearing/index.md`  | Finding Your Bearing          | default        |
| `website/docs/reference/index.md`                    | Reference                     | product (grid) |
| `website/docs/reference/cli/index.md`                | CLI Reference                 | default        |
| `website/docs/reference/model/index.md`              | Core Model                    | default        |
| `website/docs/reference/lifecycle/index.md`          | Lifecycle                     | default        |
| `website/docs/reference/yaml-schema/index.md`        | YAML Schema Reference         | default        |
| `website/docs/internals/index.md`                    | Internals                     | product (grid) |
| `website/docs/internals/map/index.md`                | Map Internals                 | default        |
| `website/docs/internals/pathway/index.md`            | Pathway Internals             | default        |
| `website/docs/internals/libskill/index.md`           | libskill Internals            | default        |
| `website/docs/internals/basecamp/index.md`           | Basecamp Internals            | default        |
| `website/docs/internals/guide/index.md`              | Guide Internals               | default        |
| `website/docs/internals/landmark/index.md`           | Landmark Internals            | default        |
| `website/docs/internals/summit/index.md`             | Summit Internals              | default        |
| `website/docs/internals/universe/index.md`           | Universe Internals            | default        |

### Verification

```sh
npx fit-doc build --src=website --out=dist
# Confirm all new paths appear in dist/docs/
```

---

## Phase 2: Migrate existing content

Split each existing doc page into its new destinations per the spec's migration
table. After splitting, delete the original file.

### 2.1 — Map (`website/docs/map/index.md`)

**Current content sections and their destinations:**

| Section                                                 | Destination                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Overview, Position in the Suite                         | `guides/authoring-frameworks/` (rewritten as user context)                  |
| How Data is Organized → Framework definitions (YAML)    | `guides/authoring-frameworks/`                                              |
| Skill markers                                           | `guides/authoring-frameworks/`                                              |
| Entity Types, Skill Proficiencies, Behaviour Maturities | `reference/yaml-schema/`                                                    |
| Schema Formats                                          | `reference/yaml-schema/` (with links to `/schema/json/` and `/schema/rdf/`) |
| Internal Layering                                       | `internals/map/`                                                            |
| Activity model, Unified person model                    | `internals/map/`                                                            |
| Ingestion Surfaces (GetDX, GitHub, Evidence pipeline)   | `internals/map/`                                                            |
| Query Functions                                         | `internals/map/`                                                            |
| Drivers and GetDX Alignment                             | `internals/map/`                                                            |
| Consumers                                               | `internals/map/`                                                            |
| Validation (CLI commands only)                          | `reference/cli/` (fit-map section)                                          |
| Programmatic Access                                     | `internals/map/`                                                            |

**Delete:** `website/docs/map/index.md` and `website/docs/map/` directory.

### 2.2 — Core Model (`website/docs/model/index.md`)

| Section                                               | Destination           |
| ----------------------------------------------------- | --------------------- |
| Overview, The Core Formula, Entity Overview           | `reference/model/`    |
| Skills (proficiencies, human-only)                    | `reference/model/`    |
| Capabilities, Behaviours, Disciplines, Tracks, Levels | `reference/model/`    |
| Job Derivation (conceptual — what happens)            | `reference/model/`    |
| Key Capabilities table                                | `reference/model/`    |
| Technical Reference (modules, programmatic access)    | `internals/libskill/` |

**Delete:** `website/docs/model/index.md`.

### 2.3 — Core Derivation (`website/docs/model/core.md`)

| Section                                         | Destination                                        |
| ----------------------------------------------- | -------------------------------------------------- |
| Skill Derivation steps 1–4 (conceptual)         | `reference/model/` (derivation details subsection) |
| Behaviour Derivation, Responsibility Derivation | `reference/model/`                                 |
| Driver Coverage, Modifier Policies              | `reference/model/`                                 |
| Technical Reference (key functions, imports)    | `internals/libskill/`                              |

**Delete:** `website/docs/model/core.md`.

### 2.4 — Lifecycle (`website/docs/model/lifecycle.md`)

| Section                                             | Destination                               |
| --------------------------------------------------- | ----------------------------------------- |
| Overview, The Six Stages, Handoffs, Constraints     | `reference/lifecycle/`                    |
| Checklists (how they work for users)                | `reference/lifecycle/`                    |
| Stages and Agents (conceptual)                      | `reference/lifecycle/`                    |
| Technical Reference (key functions, data structure) | `internals/libskill/` (lifecycle section) |

**Delete:** `website/docs/model/lifecycle.md` and `website/docs/model/`
directory.

### 2.5 — Pathway (`website/docs/pathway/index.md`)

| Section                             | Destination                            |
| ----------------------------------- | -------------------------------------- |
| Architecture (data flow overview)   | `internals/pathway/`                   |
| Module Structure                    | `internals/pathway/`                   |
| Formatter Pattern (rules, example)  | `internals/pathway/`                   |
| Web Application (pages, components) | `internals/pathway/`                   |
| CLI Commands                        | `reference/cli/` (fit-pathway section) |
| Templates                           | `internals/pathway/`                   |

**Delete:** `website/docs/pathway/index.md`.

### 2.6 — Agent Teams (`website/docs/pathway/agents.md`)

| Section                                       | Destination                                     |
| --------------------------------------------- | ----------------------------------------------- |
| Overview, Agent vs Human Derivation           | `guides/agent-teams/`                           |
| Reference Level Selection                     | `guides/agent-teams/`                           |
| Profile Derivation Pipeline (conceptual flow) | `guides/agent-teams/`                           |
| Output Format (.agent.md, SKILL.md examples)  | `guides/agent-teams/`                           |
| Stage-Based Agents                            | `guides/agent-teams/`                           |
| Generating Agents (CLI)                       | `guides/agent-teams/` + `reference/cli/`        |
| Technical Reference (key functions, imports)  | `internals/pathway/` (agent derivation section) |
| Template Variables                            | `internals/pathway/`                            |

**Delete:** `website/docs/pathway/agents.md`.

### 2.7 — Technical Reference (`website/docs/pathway/reference.md`)

| Section                                 | Destination                               |
| --------------------------------------- | ----------------------------------------- |
| File Organization (Map, Model, Pathway) | `internals/pathway/` and `internals/map/` |
| Formatter Reference                     | `internals/pathway/`                      |
| CLI Reference (all commands)            | `reference/cli/`                          |
| Template Reference                      | `internals/pathway/`                      |
| NPM Scripts                             | `internals/pathway/`                      |

**Delete:** `website/docs/pathway/reference.md` and `website/docs/pathway/`
directory.

### 2.8 — Basecamp (`website/docs/basecamp/index.md`)

| Section                                             | Destination                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Overview, Scheduler (modes, state, logging)         | `guides/knowledge-systems/`                                                          |
| Task Configuration, Default Tasks                   | `guides/knowledge-systems/`                                                          |
| Knowledge Base Structure, KB Skills, Initialization | `guides/knowledge-systems/`                                                          |
| CLI Reference                                       | `reference/cli/` (fit-basecamp section) + `guides/knowledge-systems/` (key commands) |
| Architecture (component table, mermaid)             | `internals/basecamp/`                                                                |
| macOS App (building, Swift sources)                 | `internals/basecamp/`                                                                |
| Paths and Directories                               | `guides/knowledge-systems/`                                                          |

**Delete:** `website/docs/basecamp/index.md` and `website/docs/basecamp/`
directory.

### 2.9 — Landmark (`website/docs/landmark/index.md`)

| Section                                          | Destination                             |
| ------------------------------------------------ | --------------------------------------- |
| Overview, Data Inputs, Core Views (CLI examples) | `guides/engineering-signals/`           |
| Product Position                                 | `guides/engineering-signals/`           |
| Team scope                                       | `guides/engineering-signals/`           |
| CLI commands                                     | `reference/cli/` (fit-landmark section) |

**Delete:** `website/docs/landmark/index.md` and `website/docs/landmark/`
directory.

### 2.10 — Universe (`website/docs/universe/index.md`)

Entire page moves to `internals/universe/`. Universe is a contributor tool — its
audience is people generating test data for development, not end users.

**Delete:** `website/docs/universe/index.md` and `website/docs/universe/`
directory.

### Verification

```sh
npx fit-doc build --src=website --out=dist
# Confirm no broken internal links
# Confirm old paths no longer exist in dist/
```

---

## Phase 3: Create new content

Write pages that have no existing source material.

### 3.1 — Getting Started: Leadership

`website/docs/getting-started/leadership/index.md`

Content outline:

- Prerequisites (Node.js, npm, the suite)
- Create your first framework: minimal `levels.yaml`, one discipline, one
  capability with skills
- Validate with `npx fit-map validate`
- Preview with `npx fit-pathway dev`
- Next steps: link to Authoring Frameworks guide, YAML Schema reference

Source material: `data/pathway/` example files, `CONTRIBUTING.md` quickstart
section, Map validation docs.

### 3.2 — Getting Started: Developers

`website/docs/getting-started/developers/index.md`

Content outline:

- Install CLI tools (`npm install`)
- Generate agent teams (`npx fit-pathway agent`)
- Browse your job definition (`npx fit-pathway job`)
- Set up Basecamp (`npx fit-basecamp --init`)
- Next steps: link to Agent Teams guide, Knowledge Systems guide, CLI reference

Source material: existing CLI examples from Pathway and Basecamp docs.

### 3.3 — Getting Started: Contributors

`website/docs/getting-started/contributors/index.md`

Content outline:

- Clone and install (`npm install`, `make quickstart`)
- Generate synthetic data (`make synthetic`)
- Run checks (`npm run check`)
- Understand the structure (link to Internals)
- Next steps: link to relevant Internals pages

Source material: `CONTRIBUTING.md` Getting Started and Development Workflow
sections.

### 3.4 — Guides: Career Paths

`website/docs/guides/career-paths/index.md`

Content outline:

- What Pathway shows you: jobs, skills, progression
- Browse entities via CLI (`npx fit-pathway discipline --list`, etc.)
- View a job definition (`npx fit-pathway job`)
- Understanding skill proficiencies and behaviour maturities
- Career progression: gap analysis between current and target roles
- Link to Reference: Model for entity definitions, CLI for full command list

Source material: Pathway CLI docs, Core Model entity overview.

### 3.5 — Guides: Finding Your Bearing

`website/docs/guides/finding-your-bearing/index.md`

Content outline:

- What Guide does: AI agent that understands your framework
- How it helps: onboarding, growth areas, artifact interpretation
- Getting started with Guide
- How Guide uses skill markers
- Link to Reference: Model for framework concepts

Source material: Guide product page (`website/guide/index.md`), Guide SKILL.md
(`.claude/skills/fit-guide/SKILL.md`).

### 3.6 — Guides: Team Capability

`website/docs/guides/team-capability/index.md`

Content outline:

- What Summit does: team as a system
- Capability coverage: aggregated skill matrices
- Structural risk identification
- What-if staffing scenarios
- CLI usage (`npx fit-summit`)
- No LLM, no external dependencies — fully local and deterministic

Source material: Summit product page (`website/summit/index.md`), CLAUDE.md
product descriptions.

### 3.7 — Reference: CLI

`website/docs/reference/cli/index.md`

Content outline — unified CLI reference organized by product:

- **fit-map**: `validate`, `validate --shacl`, `generate-index`
- **fit-pathway**: all entity commands (`--list`, `<id>`), `job`, `agent`,
  `build`, `dev`, `tool`
- **fit-basecamp**: `--init`, `--daemon`, `--run`, `--status`, `--validate`,
  `--help`
- **fit-landmark**: `evidence`, `practice`, `snapshot trend`,
  `snapshot compare`, `health`
- **fit-summit**: commands (from CLI help output)
- **fit-universe**: `--generate`, `--cached`, `--dry-run`, `--only`, `--story`
- **fit-doc**: `build`, `serve`

Each command: synopsis, arguments, options, example. No prose narrative.

Source material: scattered across current Pathway reference, Basecamp, Landmark,
and Universe docs. Run each CLI with `--help` to capture complete option lists.

### 3.8 — Reference: YAML Schema

`website/docs/reference/yaml-schema/index.md`

Content outline:

- Entity file locations table
- For each entity type: file path pattern, required fields, example snippet,
  link to `/schema/json/{entity}.schema.json`
- Links to `/schema/rdf/` for linked data consumers
- Link to Authoring Frameworks guide for how to use these files

Source material: Map docs entity types table, existing
`products/map/schema/json/` files for field names.

### 3.9 — Internals: Guide

`website/docs/internals/guide/index.md`

Content outline:

- Architecture: agent infrastructure, artifact interpretation pipeline
- How Guide reads Map data and writes evidence
- Tool execution and chat REPL internals
- Module structure

Source material: Guide SKILL.md, Guide product page, Map docs (evidence pipeline
section).

### 3.10 — Internals: Summit

`website/docs/internals/summit/index.md`

Content outline:

- Architecture: capability aggregation engine
- Skill matrix aggregation across team members
- Structural risk detection
- Scenario modeling internals
- Module structure

Source material: Summit product page, CLAUDE.md description, libskill
relationship to Summit.

### Verification

```sh
npx fit-doc build --src=website --out=dist
# Confirm all new pages render
# Spot-check markdown companions exist for Guides and Reference pages
```

---

## Phase 4: Update references

### 4.1 — Docs hub (`website/docs/index.md`)

Replace the flat nine-card grid with a four-section layout:

```markdown
<div class="grid">

<a href="/docs/getting-started/">

### Getting Started

Quickstart guides for leadership, developers, and contributors.

</a>

<a href="/docs/guides/">

### Guides

Task-oriented guides: authoring frameworks, agent teams, career paths,
knowledge systems, engineering signals, team capability, and finding your
bearing.

</a>

<a href="/docs/reference/">

### Reference

CLI commands, entity model, lifecycle stages, and YAML schema format.

</a>

<a href="/docs/internals/">

### Internals

Architecture and code: Map, Pathway, libskill, Basecamp, Guide, Landmark,
Summit, and Universe.

</a>

</div>
```

Update the frontmatter subtitle to reflect the new structure.

### 4.2 — Cross-links in all doc pages

Update every `Related Documentation` section and inline link in every new page
to use the new URL paths. Old links like `/docs/map/`, `/docs/model/`,
`/docs/pathway/agents/` must all point to their new locations.

Systematic approach:

1. Grep all `.md` files under `website/docs/` for links matching old paths
2. Replace each with the new canonical path
3. Verify no broken links remain after build

### 4.3 — `website/llms.txt`

Update the `## Documentation` section to reflect the new hierarchy:

```
## Documentation

- Getting Started: Leadership, Developers, Contributors
- Guides: Authoring Frameworks, Agent Teams, Career Paths, Knowledge Systems,
  Engineering Signals, Team Capability, Finding Your Bearing
- Reference: CLI, Core Model, Lifecycle, YAML Schema
- Internals: Map, Pathway, libskill, Basecamp, Guide, Landmark, Summit, Universe
```

The `libdoc` build augments this section with page URLs when `--base-url` is
provided. The manual text provides structure even without augmentation.

### 4.4 — Published skills

Add documentation links to each published skill's SKILL.md file. Links use
markdown companion URLs (ending in `/index.md`) so agents fetch clean markdown.

| Skill file                             | Links to add                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `.claude/skills/fit-map/SKILL.md`      | `/docs/guides/authoring-frameworks/index.md`, `/docs/reference/yaml-schema/index.md`                      |
| `.claude/skills/fit-pathway/SKILL.md`  | `/docs/guides/agent-teams/index.md`, `/docs/guides/career-paths/index.md`, `/docs/reference/cli/index.md` |
| `.claude/skills/fit-basecamp/SKILL.md` | `/docs/guides/knowledge-systems/index.md`, `/docs/reference/cli/index.md`                                 |
| `.claude/skills/fit-guide/SKILL.md`    | `/docs/guides/finding-your-bearing/index.md`                                                              |
| `.claude/skills/fit-universe/SKILL.md` | `/docs/internals/universe/index.md`                                                                       |

Each skill gets a `## Documentation` section (or similar) at the end with these
links and a brief note that they provide deeper context beyond the skill's
scope. fit-universe links to Internals (not Guides) because it is a contributor
tool.

### 4.5 — CLAUDE.md clarifications

Add a new section after the existing "Products" section titled "Distribution
Model" with three points:

1. The monorepo is open source — the repository is public and products are
   designed for external consumption.
2. Organizations install the products — teams bring their own framework data and
   use coding agents to drive CLIs.
3. Skills serve two audiences — internal skills (`.claude/skills/libs-*`,
   product internals) help monorepo contributors; published skills (`fit-*`)
   help users and agents at external installations understand how products
   **work**, linking to documentation for progressive disclosure rather than
   source code.

Insert after the Products table and before the Structure section.

### Verification

```sh
npx fit-doc build --src=website --out=dist
# Confirm docs hub shows four sections
# Grep dist/ for old URLs — expect zero matches
# Confirm llms.txt has updated Documentation section
# Read each published skill and verify links are present
```

---

## File change summary

### Created (26 new files)

```
website/docs/getting-started/index.md
website/docs/getting-started/leadership/index.md
website/docs/getting-started/developers/index.md
website/docs/getting-started/contributors/index.md
website/docs/guides/index.md
website/docs/guides/authoring-frameworks/index.md
website/docs/guides/agent-teams/index.md
website/docs/guides/career-paths/index.md
website/docs/guides/knowledge-systems/index.md
website/docs/guides/engineering-signals/index.md
website/docs/guides/team-capability/index.md
website/docs/guides/finding-your-bearing/index.md
website/docs/reference/index.md
website/docs/reference/cli/index.md
website/docs/reference/model/index.md
website/docs/reference/lifecycle/index.md
website/docs/reference/yaml-schema/index.md
website/docs/internals/index.md
website/docs/internals/map/index.md
website/docs/internals/pathway/index.md
website/docs/internals/libskill/index.md
website/docs/internals/basecamp/index.md
website/docs/internals/guide/index.md
website/docs/internals/landmark/index.md
website/docs/internals/summit/index.md
website/docs/internals/universe/index.md
```

### Modified (8 existing files)

```
website/docs/index.md          — Replace grid with four sections
website/llms.txt               — Update Documentation section
.claude/skills/fit-map/SKILL.md
.claude/skills/fit-pathway/SKILL.md
.claude/skills/fit-basecamp/SKILL.md
.claude/skills/fit-guide/SKILL.md
.claude/skills/fit-universe/SKILL.md
CLAUDE.md                      — Add Distribution Model section
```

### Deleted (11 old files)

```
website/docs/map/index.md
website/docs/model/index.md
website/docs/model/core.md
website/docs/model/lifecycle.md
website/docs/pathway/index.md
website/docs/pathway/agents.md
website/docs/pathway/reference.md
website/docs/basecamp/index.md
website/docs/landmark/index.md
website/docs/universe/index.md
```

---

## Commit plan

| Commit | Phase   | Message                                                                   |
| ------ | ------- | ------------------------------------------------------------------------- |
| 1      | Phase 1 | `docs(website): scaffold new documentation IA directory structure`        |
| 2      | Phase 2 | `docs(website): migrate existing content to new IA hierarchy`             |
| 3      | Phase 3 | `docs(website): add new getting-started, guide, and reference pages`      |
| 4      | Phase 4 | `docs(website): update hub, cross-links, llms.txt, skills, and CLAUDE.md` |
