---
name: write-docs
description: >
  Review and update documentation in the website/ folder. Use when ensuring
  documentation accurately reflects the current codebase.
---

# Write Documentation

Write effective, user-centric documentation for the `website/docs/` hierarchy.
Documentation is organized by audience and task, not by product.

## When to Use

- Writing new documentation pages
- Updating existing documentation after code changes
- Auditing documentation for accuracy, gaps, or audience drift
- Adding documentation for features that lack it

## Information Architecture

The documentation is a four-tier hierarchy serving three user groups
(Leadership, Developers, Contributors):

```
website/docs/
  getting-started/           "I'm new, get me going fast"
    leadership/              Author your first framework
    developers/              Install tools and agent teams
    contributors/            Set up the development environment
  guides/                    "I have a specific task to accomplish"
    authoring-frameworks/    YAML structure, entities, validation
    agent-teams/             Generate and install agent teams
    career-paths/            Browse jobs, skills, progression
    knowledge-systems/       Basecamp setup, scheduler, KB structure
    engineering-signals/     Landmark views, GetDX, GitHub integration
    team-capability/         Summit team modeling
    finding-your-bearing/    Guide usage and configuration
  reference/                 "I need to look something up"
    cli/                     CLI commands for all products
    model/                   Entity reference (disciplines, levels, tracks, etc.)
    lifecycle/               Stages, handoffs, checklists
    yaml-schema/             YAML file format, links to /schema/json/ and /schema/rdf/
  internals/                 "I need to understand how this is built"
    map/                     Data product architecture, layering, queries
    pathway/                 Formatter pattern, module structure, templates
    libskill/                Derivation engine, policies, caching
    basecamp/                Scheduler architecture, state management
    guide/                   Agent infrastructure, artifact interpretation
    landmark/                Analysis pipeline, view composition
    summit/                  Capability aggregation, scenario modeling
    universe/                Synthetic data pipeline, DSL, prose engine
    operations/              Environment, services, and common tasks
```

## Audience Rules

Every sentence belongs to exactly one audience. When writing or reviewing, apply
these rules strictly:

| Content type                                                  | Audience               | Section                 |
| ------------------------------------------------------------- | ---------------------- | ----------------------- |
| How to accomplish a task with the products                    | Leadership, Developers | Getting Started, Guides |
| Entity definitions, CLI synopsis, YAML format                 | All users              | Reference               |
| Module structures, code imports, class names, `src/` paths    | Contributors           | Internals               |
| Internal architecture, data flow diagrams, formatter patterns | Contributors           | Internals               |

**Never mix audiences on the same page.** If a page mentions both CLI usage and
module internals, split it. User-facing pages (Getting Started, Guides,
Reference) must never reference source file paths, class names, or import
statements.

## Writing Principles

### Guides are task-oriented, not product-oriented

A guide answers "how do I do X?" not "what does product Y contain?" Guides pull
from multiple products when that matches the actual workflow. For example,
"Authoring Frameworks" covers Map (YAML format, validation), Core Model (entity
relationships), and Pathway (previewing results) — because that is the real
authoring workflow.

### Reference is lookup, not tutorial

The CLI reference lists every command with arguments, options, and a brief
example. The model reference defines every entity. The YAML schema reference
shows the exact format for every file type. No prose narrative — structured,
scannable information.

### Internals are clearly separated

Module structures, formatter patterns, code imports, query functions, and
architectural decisions live in Internals. This content is valuable but must
never interrupt users trying to accomplish a task.

### Link to existing artifacts, don't duplicate

- JSON Schema files are published at `/schema/json/`. Link to them from the YAML
  schema reference — don't reproduce their content.
- RDF/SHACL files are published at `/schema/rdf/`.
- Published SKILL.md files link to Guides and Reference markdown companions for
  progressive disclosure. Don't duplicate documentation content in skills or
  vice versa.

### Published skills use absolute URLs

Published skills (`fit-*` in `.claude/skills/`) are installed on external
systems where the documentation is not available locally. Documentation links in
these skills **must** use absolute URLs with the full domain:

```markdown
<!-- Correct — works on any installation -->
- [Guide](https://www.forwardimpact.team/docs/guides/authoring-frameworks/index.md)

<!-- Wrong — breaks on external installations -->
- [Guide](/docs/guides/authoring-frameworks/index.md)
```

Internal skills (library groups, `write-docs`, etc.) may use repo-relative paths
since they only run inside the monorepo.

### Guides and Reference produce stable, agent-fetchable URLs

Every page in Guides and Reference gets a markdown companion (generated by
`libdoc`) at a predictable URL. These are the progressive-disclosure targets
that published skills link to. Content at these URLs must make sense to an agent
with no monorepo context — it explains how the product works, not how the code
is structured.

## Process

### Writing a new page

1. **Identify the audience.** Determine which user group the page serves. This
   decides which section it belongs to.
2. **Choose the section.** Place the page in the correct tier:
   - New to the product? → Getting Started
   - Task to accomplish? → Guides
   - Looking something up? → Reference
   - Understanding the code? → Internals
3. **Research the source of truth.** Read the actual code and data before
   writing. Cross-reference the table below.
4. **Write for the audience.** Strip out anything that belongs to a different
   audience. A leadership user reading Authoring Frameworks should never see a
   class name. A contributor reading Internals should never wade through
   tutorials.
5. **Verify accuracy.** Run CLI commands, check YAML against schemas, confirm
   entity names against `data/pathway/`.
6. **Add cross-links.** Link to related pages within the hierarchy. Guides link
   to Reference for lookup details. Getting Started links to Guides for next
   steps. Internals link to Reference for the user-facing model.
7. **Build and check.** Run `npx fit-doc build --src=website --out=dist` to
   confirm the page renders and all links resolve.

### Updating existing pages

1. **Read the page and its source of truth.** Check the actual code and data
   files — not just the documentation.
2. **Check audience purity.** If contributor content has crept into a Guide or
   Reference page, move it to the appropriate Internals page.
3. **Verify CLI examples.** Run every CLI command shown. Use
   `--data=data/pathway` for canonical output.
4. **Verify YAML examples.** Check against schemas in
   `products/map/schema/json/`.
5. **Check cross-links.** Ensure all internal links resolve to pages that exist.
6. **Build and check.** Run `npx fit-doc build --src=website --out=dist`.

### Auditing documentation

1. **Check coverage.** Every product should have:
   - At least one Guide (task-oriented user documentation)
   - CLI entries in the Reference CLI page
   - An Internals page (architecture for contributors)
2. **Check accuracy.** For each page, examine the actual code it describes.
   Cross-reference the source-of-truth table below.
3. **Check freshness.** Review `git log --oneline -20` for recent changes that
   may have invalidated documentation.
4. **Check `llms.txt`.** Verify the Documentation section in `website/llms.txt`
   reflects the current page inventory.

## Repository Documentation

The documentation lives in two layers: repository-root files and the website.

**Root documents** (checked into the repo root):

| File              | Purpose                                         | Audience         |
| ----------------- | ----------------------------------------------- | ---------------- |
| `CLAUDE.md`       | Architecture context for coding agents          | Agents           |
| `CONTRIBUTING.md` | PR workflow, git conventions, quality, security | All contributors |
| `SECURITY.md`     | Vulnerability reporting                         | All contributors |

**Website documentation** (`website/docs/`):

The four-tier hierarchy described below. Contributor-facing reference material
(environment, services, tasks) lives at `docs/internals/operations/` — extracted
from CONTRIBUTING.md to keep the workflow focused.

**Relationship between the layers:**

- CONTRIBUTING.md is the canonical source for PR workflow and policies.
  `CLAUDE.md` references it rather than duplicating workflow rules.
- The Policy Ownership table in CONTRIBUTING.md defines which file owns which
  policy area. Consult it before moving or duplicating policy content.
- `website/docs/getting-started/contributors/` provides an onboarding narrative
  that links to CONTRIBUTING.md for the full guide.
- `website/docs/internals/operations/` holds operational reference (environment,
  config, services, tasks) that supports CONTRIBUTING.md without cluttering it.

When updating documentation that touches both root files and the website, ensure
the canonical source stays in one place and other locations reference it.

## Source of Truth

| Documentation topic | Verify against                              |
| ------------------- | ------------------------------------------- |
| PR workflow         | `CONTRIBUTING.md`                           |
| Architecture        | `CLAUDE.md`                                 |
| Policy ownership    | `CONTRIBUTING.md` § Policy Ownership        |
| Operations          | `website/docs/internals/operations/`        |
| Skills and levels   | `data/pathway/capabilities/`                |
| Behaviours          | `data/pathway/behaviours/`                  |
| Disciplines         | `data/pathway/disciplines/`                 |
| Tracks              | `data/pathway/tracks/`                      |
| Levels              | `data/pathway/levels.yaml`                  |
| Stages              | `data/pathway/stages.yaml`                  |
| Drivers             | `data/pathway/drivers.yaml`                 |
| Job derivation      | `libraries/libskill/src/job.js`             |
| Agent derivation    | `libraries/libskill/src/agent.js`           |
| Map validation      | `products/map/src/`                         |
| Pathway CLI         | `products/pathway/bin/fit-pathway.js`       |
| Basecamp CLI        | `products/basecamp/bin/fit-basecamp.js`     |
| Landmark CLI        | `products/landmark/bin/fit-landmark.js`     |
| Summit CLI          | `products/summit/bin/fit-summit.js`         |
| Universe CLI        | `libraries/libuniverse/bin/fit-universe.js` |
| Templates           | `products/pathway/templates/`               |
| JSON Schema         | `products/map/schema/json/`                 |
| RDF/SHACL Schema    | `products/map/schema/rdf/`                  |
| LLM / SEO outputs   | `website/llms.txt`, `website/robots.txt`    |

## Layouts

| Layout    | Use for                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `product` | Section index pages (Getting Started, Guides, Reference, Internals) — grid of cards |
| _(none)_  | Leaf pages — prose with table of contents                                           |

## Commit

After making updates, commit with:

```
docs(website): {verb} {topic} documentation
```

Use separate commits for distinct documentation areas. Verbs: `add` for new
pages, `update` for changes to existing pages, `fix` for corrections.
