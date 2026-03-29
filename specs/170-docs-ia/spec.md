# 170 — Documentation Information Architecture

The website documentation (`/docs/`) is organized by product, not by what users
need to accomplish. Every page mixes usage instructions with internal
architecture, and there is no hierarchy beyond a flat grid of nine links. The
result: a leadership user trying to author YAML files has to read through module
structures and import statements; a developer trying to install agent teams has
to piece together information scattered across three pages; and a contributor
looking for internals has to skim past CLI tutorials to find the code reference.

This spec defines a new information architecture for the documentation section
that serves users by their goals, not by where code happens to live.

## Why

### The current structure does not match how people use the docs

The docs hub presents nine cards in a flat grid:

```
Map | Model | Lifecycle | Pathway | Agents | Reference | Universe | Basecamp | Landmark
```

There is no hierarchy, no grouping by audience, and no sequencing. A first-time
visitor sees nine equally-weighted links with no signal about where to start or
what is relevant to them.

### User content and contributor content are interleaved

Every documentation page mixes "how to use" content with "how it works
internally" content. For example:

- **Map** (`/docs/map/`) explains YAML file structure (useful for Leadership
  authoring frameworks) alongside internal layering rules, query functions, and
  the `activity/` module boundary (useful only for contributors).
- **Pathway** (`/docs/pathway/`) explains CLI commands (useful for Developers)
  alongside module structure, formatter patterns, and code examples showing
  `shared.js` / `dom.js` / `markdown.js` conventions (useful only for
  contributors).
- **Core Model** (`/docs/model/`) explains entities and derivation (useful for
  everyone) alongside `derivation.js` module references and programmatic import
  statements (useful only for contributors).

This interleaving forces every reader to mentally filter for their audience on
every page.

### Key user journeys have no dedicated path

Real user goals that the docs should serve but currently don't:

| User group   | Goal                                            | Current experience                                                      |
| ------------ | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Leadership   | Author a framework from scratch                 | Read Map docs (mixed with internals), guess at YAML structure from examples |
| Leadership   | Validate and publish framework data              | Buried in Map docs as a CLI command among many                          |
| Leadership   | Connect GetDX and GitHub signals                | Only in Map docs under "Ingestion Surfaces", mixed with schema details  |
| Developer    | Install agent teams for Claude Code             | Spread across Agents page, Reference page, and Pathway CLI section      |
| Developer    | Set up Basecamp for personal knowledge          | Single page, adequate but isolated with no onboarding path              |
| Developer    | Understand role expectations and find growth areas | No Guide docs exist at all                                            |
| Contributor  | Understand the data model and derivation logic  | Good content exists but buried among user-facing content                |
| Contributor  | Generate test data for development              | Universe page exists but is disconnected from any development workflow  |

### Agents need progressive disclosure, not just SKILL.md

The suite defines three user groups — Leadership, Developers, and Agents. Agents
consume context primarily through machine-readable artifacts:

- **`llms.txt`** — The curated entry point an LLM agent fetches when visiting
  the site, with links to markdown companions of each page.
- **SKILL.md files and `.agent.md` profiles** — Generated from framework data
  via `fit-pathway agent`, injected directly into agent context. This is the
  primary interface agents use.
- **JSON Schema files** — Published at `/schema/json/` for programmatic
  validation, not for reading prose.

The SKILL.md files are brief and effective — they tell an agent what a product
does and how to drive its CLI. But they don't support progressive disclosure.
When an agent needs to understand *how* a product works (e.g. how job derivation
combines discipline, level, and track modifiers, or how validation runs in two
phases), the SKILL.md doesn't go deep enough and there's nowhere to look next.

This matters because the monorepo is open source, and the products and skills
are published for external use. Organizations install Pathway and use coding
agents to drive CLIs like `fit-map` and `fit-pathway`. These agents need to
understand how the products **work** — the logic, the data flow, the
relationships — but **not** how they are **implemented** (module structure,
code imports, internal architecture). That distinction maps exactly to the
audience split this spec proposes: Guides and Reference are "how it works" for
users and agents; Internals are "how it's built" for contributors.

The documentation already has the mechanism: `libdoc` generates markdown
companion files (`index.md`) alongside every HTML page, and `llms.txt` links to
them. Published skills could link to these markdown URLs so agents can fetch
deeper documentation on demand. But the current flat structure — where user
content and contributor content are interleaved on every page — means there's no
clean URL to link to. An agent fetching `/docs/map/index.md` gets validation
pipeline logic mixed with `DataLoader` class internals.

The documentation hierarchy is still primarily a human concern. But the new IA
must also produce clean, stable URLs for the Guides and Reference sections that
published skills can link to for optional deep-dives. The three audiences for
the docs remain **Leadership**, **Developers**, and **Contributors** — agents
are served by SKILL.md as their primary interface, with documentation URLs as a
progressive-disclosure layer.

### Missing documentation

- **Guide** has a product page but no documentation page at all.
- **Summit** has a product page but no documentation page.
- There is no getting-started or quickstart page for any user group.
- There is no page dedicated to the YAML authoring workflow that Leadership
  users need.

## What

Replace the current flat `/docs/` hierarchy with a three-tier structure
organized by audience and task:

```
/docs/
  getting-started/           Quickstart guides per user group
    leadership/              Author your first framework
    developers/              Install tools and agent teams
    contributors/            Set up the development environment
  guides/                    Task-oriented guides (primary audience: users)
    authoring-frameworks/    YAML structure, entities, validation
    agent-teams/             Generate and install agent teams
    career-paths/            Browse jobs, skills, progression
    knowledge-systems/       Basecamp setup, scheduler, KB structure
    engineering-signals/     Landmark views, GetDX, GitHub integration
    team-capability/         Summit team modeling
    finding-your-bearing/    Guide usage and configuration
  reference/                 Lookup material (primary audience: users + contributors)
    cli/                     CLI commands for all products
    model/                   Entity reference (disciplines, levels, tracks, etc.)
    lifecycle/               Stages, handoffs, checklists
    yaml-schema/             YAML file format reference, links to /schema/json/ and /schema/rdf/
  internals/                 Architecture and code (primary audience: contributors)
    map/                     Data product architecture, layering, queries
    pathway/                 Formatter pattern, module structure, templates
    libskill/                Derivation engine, policies, caching
    basecamp/                Scheduler architecture, state management
    guide/                   Agent infrastructure, artifact interpretation
    landmark/                Analysis pipeline, view composition
    summit/                  Capability aggregation, scenario modeling
    universe/                Synthetic data pipeline, DSL, prose engine
```

### Design principles

**User goals drive top-level sections.** The four top-level sections map to
what users are trying to do:

1. **Getting Started** — "I'm new, get me going fast" (all user groups)
2. **Guides** — "I have a specific task to accomplish" (Leadership + Developers)
3. **Reference** — "I need to look something up" (all user groups)
4. **Internals** — "I need to understand how this works" (Contributors)

**Guides are task-oriented, not product-oriented.** A guide answers "how do I
do X?" not "what does product Y contain?" For example, "Authoring Frameworks"
pulls from Map (YAML format, validation), Core Model (entity relationships),
and Pathway (previewing results) — because that's the actual workflow.

**Reference is lookup, not tutorial.** The CLI reference lists every command
with arguments and options. The model reference defines every entity. The YAML
schema reference shows the exact format for every file type. No prose narrative
— just structured, scannable information.

**Link to existing schema artifacts, don't duplicate.** The JSON Schema and
RDF/SHACL files from `products/map/schema/` are already copied to the website at
build time by the GitHub Actions workflow (`website.yaml`), published at
`/schema/json/` and `/schema/rdf/`. Documentation pages — particularly the YAML
schema reference and the authoring guide — should link to these published schema
files rather than reproducing their content. For example, the YAML schema
reference for capabilities should link to `/schema/json/capability.schema.json`
as the authoritative format definition.

**Internals are for contributors, clearly separated.** Module structures,
formatter patterns, code imports, query functions, and architectural decisions
move here. This content is valuable but should not interrupt users who are
trying to accomplish a task.

**Guides and Reference produce stable, agent-fetchable URLs.** Every page in
Guides and Reference gets a markdown companion (generated by `libdoc`) at a
predictable URL. These URLs are the progressive-disclosure targets that
published skills link to. The content at these URLs must make sense to an agent
that has no monorepo context — it explains how the product works, not how the
code is structured. Internals pages are explicitly excluded from skill linking
because they serve contributors, not product users.

### Navigation changes

The docs hub (`/docs/index.md`) replaces the flat nine-card grid with a
structured layout showing the four sections with descriptions. Each section
links to its index page, which in turn lists its children.

The global navigation (`index.template.html`) is not changed — the top-level
"Docs" link continues to point to `/docs/`.

### Content migration

Every piece of existing content moves to the new hierarchy. Nothing is deleted —
content is reorganized, and in some cases split when a single page serves
multiple audiences.

| Current page                  | Destination(s)                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `/docs/map/`                  | User content → `/docs/guides/authoring-frameworks/` and `/docs/reference/yaml-schema/` |
|                               | Contributor content → `/docs/internals/map/`                                      |
| `/docs/model/`                | Entity overview → `/docs/reference/model/`                                        |
|                               | Derivation details → `/docs/internals/libskill/`                                  |
| `/docs/model/lifecycle/`      | → `/docs/reference/lifecycle/`                                                    |
| `/docs/pathway/`              | CLI content → `/docs/reference/cli/`                                              |
|                               | Formatter/module content → `/docs/internals/pathway/`                             |
| `/docs/pathway/agents/`       | User guide → `/docs/guides/agent-teams/`                                          |
|                               | Technical reference → `/docs/internals/pathway/` (agent derivation section)       |
| `/docs/pathway/reference/`    | CLI commands → `/docs/reference/cli/`                                             |
|                               | File organization → `/docs/internals/pathway/`                                    |
| `/docs/basecamp/`             | Setup and usage → `/docs/guides/knowledge-systems/`                               |
|                               | Architecture → `/docs/internals/basecamp/`                                        |
| `/docs/landmark/`             | User guide → `/docs/guides/engineering-signals/`                                  |
|                               | Architecture → `/docs/internals/landmark/`                                        |
| `/docs/universe/`             | → `/docs/internals/universe/`                                                     |

### New content (pages that don't exist today)

| Page                                       | Purpose                                                   |
| ------------------------------------------ | --------------------------------------------------------- |
| `/docs/getting-started/leadership/`        | Author your first framework: install, create YAML, validate, preview |
| `/docs/getting-started/developers/`        | Install CLI tools, generate agent teams, set up Basecamp  |
| `/docs/getting-started/contributors/`      | Clone, install, generate data, run tests, understand structure |
| `/docs/guides/finding-your-bearing/`       | Guide product usage (new — no docs exist today)           |
| `/docs/guides/team-capability/`            | Summit product usage (new — no docs exist today)          |
| `/docs/guides/career-paths/`               | Using Pathway to browse jobs, skills, and progression     |
| `/docs/reference/cli/`                     | Unified CLI reference for all products                    |
| `/docs/reference/yaml-schema/`             | YAML file format overview with examples; links to published schemas at `/schema/json/` and `/schema/rdf/` for authoritative definitions |
| `/docs/internals/guide/`                   | Guide architecture (new — no docs exist today)            |
| `/docs/internals/summit/`                  | Summit architecture (new — no docs exist today)           |

### Published skills link to documentation URLs

The product skills (`fit-map`, `fit-pathway`, `fit-basecamp`, `fit-guide`,
`fit-universe`) are published to a separate `forwardimpact/skills` repository
via the `publish-skills.yml` workflow. Organizations install these skills for
their coding agents.

The new IA produces stable, audience-appropriate URLs in the Guides and
Reference sections. Published SKILL.md files should include links to relevant
documentation pages so agents can progressively disclose deeper content. For
example:

- `fit-map` SKILL.md could link to `/docs/guides/authoring-frameworks/index.md`
  for framework authoring details and `/docs/reference/yaml-schema/index.md` for
  schema format reference
- `fit-pathway` SKILL.md could link to `/docs/guides/agent-teams/index.md` for
  agent generation details and `/docs/reference/cli/index.md` for full CLI
  reference

These links use the markdown companion URLs (generated by `libdoc`) so agents
fetch clean markdown rather than HTML. The links are optional deep-dives — the
SKILL.md remains self-contained for the common case.

This does NOT mean duplicating documentation content in skills or vice versa.
The skills remain brief and actionable. The documentation provides the depth.
The links bridge the two.

### CLAUDE.md clarifications

CLAUDE.md currently describes the monorepo structure and products but does not
explain the open-source distribution model. Three clarifications are needed:

1. **The monorepo is open source.** The repository is public and the products
   are designed for external consumption.
2. **Organizations install the products.** Teams install Pathway, Map, and other
   products in their own environments, bringing their own framework data.
   Coding agents at those installations drive the CLIs.
3. **Skills have two audiences.** Skills in `.claude/skills/` serve two distinct
   purposes. Internal skills (library groups, product internals) help
   contributors to the monorepo. Published skills (`fit-*`) help users and
   agents at external installations understand how the products **work** — not
   how they are **implemented**. The published skills should link to
   documentation for progressive disclosure, not to source code.

These clarifications belong in CLAUDE.md because they establish context that
every contributor and agent working in the monorepo needs — the distinction
between "building the products" and "using the products" shapes decisions about
what goes in skills, what goes in docs, and what goes in code comments.

### What does NOT change

- **Home page** (`/index.md`) — untouched
- **Product pages** (`/map/`, `/pathway/`, `/guide/`, `/basecamp/`, `/landmark/`, `/summit/`) — untouched
- **About page** (`/about/`) — untouched
- **Global template** (`index.template.html`) — navigation links unchanged
- **Build system** (`libdoc`) — no changes needed; it already handles nested directories
- **Assets** (`assets/`) — untouched

### llms.txt update

The curated `llms.txt` section structure should be updated to reflect the new
documentation hierarchy. The `## Documentation` section should list the four
top-level documentation sections so LLM agents can navigate the new structure.

## Out of Scope

- **Sidebar navigation within docs.** The current system uses breadcrumbs and
  in-page links. A persistent sidebar would improve navigation but is a separate
  design/build effort.
- **Search.** Full-text search across documentation would complement the new IA
  but requires infrastructure not yet in place.
- **Visual design changes.** The IA restructuring uses the same CSS, layouts,
  and components. Visual improvements to the docs experience are a separate
  effort.
- **Product page changes.** Product pages are marketing/overview pages and
  remain as-is.
- **Automated redirects.** The static site has no server-side redirect
  mechanism. Old URLs will 404. If this becomes a problem, a client-side
  redirect page or a redirect map in the build could be added later.
- **Skill generation changes.** The `fit-pathway agent` derivation logic and
  SKILL.md template are not changed by this spec. Adding documentation links to
  published skills is a manual edit to the existing `.claude/skills/fit-*/`
  files, not a change to the generation pipeline.
- **libdoc changes.** The markdown companion generation already works. No
  changes to `libdoc` are needed to support skill-to-docs linking.

## Success Criteria

1. The `/docs/` hub page shows four clearly labeled sections (Getting Started,
   Guides, Reference, Internals) with descriptions, replacing the current flat
   grid.

2. A leadership user can navigate from `/docs/` to a complete framework
   authoring guide without encountering module structures, code imports, or
   internal architecture.

3. A developer can navigate from `/docs/` to agent team installation
   instructions without needing to visit more than two pages (the guide and
   optionally the CLI reference).

4. A contributor can find architecture documentation for any product under
   `/docs/internals/` without wading through user-facing tutorials.

5. Every piece of content from the current docs exists somewhere in the new
   hierarchy — nothing is lost.

6. All internal links between documentation pages resolve correctly (no broken
   cross-references).

7. The build (`npx fit-doc build`) succeeds and produces the new hierarchy in
   the output.

8. `llms.txt` reflects the new documentation structure after build.

9. Guide and Summit have documentation pages (guide and internals) where none
   existed before.

10. Published skills (`fit-*`) include links to relevant Guides and Reference
    markdown companion URLs for progressive disclosure. An agent reading the
    skill can fetch these URLs for deeper understanding without encountering
    contributor-facing internals.

11. CLAUDE.md includes clarifications about the open-source distribution model:
    the monorepo is open source, organizations install the products externally,
    and published skills serve product users/agents (not monorepo contributors).

12. Guides and Reference pages, when read as standalone markdown (via their
    companion files), are comprehensible to an agent with no monorepo context —
    they explain product behaviour, not implementation.
