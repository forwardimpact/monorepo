# Documentation Standards

## Information Architecture

A six-tier hierarchy under `websites/<site>/docs/` serves four user groups
(Leadership, Engineers, Builders and Agents, Contributors):

| Tier              | Intent                              | Subsections                                                                                                                                                                            |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getting-started` | "Get me going fast"                 | `leaders/`, `engineers/`, `contributors/`                                                                                                                                              |
| `products`        | "Help me accomplish a product task" | One per product job (e.g. `agent-teams/`, `authoring-standards/`, `career-paths/`, `engineering-data-sources/`, `engineering-outcomes/`, `growth-areas/`, `knowledge-systems/`, `provisioning-engineers/`, `signing-in-to-landmark/`, `team-capability/`, `trust-output/`, `issuing-service-account-tokens/`) |
| `libraries`       | "Help me accomplish a library task" | One per library job (e.g. `bridge-channels/`, `every-surface/`, `ground-agents/`, `integrate-standard/`, `predictable-team/`, `prove-changes/`, `service-lifecycle/`, `typed-contracts/`) |
| `services`        | "Help me integrate with a service"  | One per service job (e.g. `bridge-conversations/`, `bridge-discussions/`, `embed-text/`, `ground-agents/`, `integrate-standard/`, `prove-changes/`, `typed-contracts/`)                |
| `reference`       | "Let me look something up"          | `lifecycle/`, `model/`, `yaml-schema/`                                                                                                                                                 |
| `internals`       | "Show me how this is built"         | One per product or shared substrate (e.g. `kata/`, `librepl/`, `operations/`, `release/`, `vectors/`)                                                                                  |

## Audience Rules

Every sentence belongs to exactly one audience.

| Content                                                  | Audience              | Section                   |
| -------------------------------------------------------- | --------------------- | ------------------------- |
| How to accomplish a task with the products               | Leadership, Engineers | Getting Started, Products |
| How to accomplish a task with the libraries (Gear)       | Builders, Agents      | Libraries                 |
| How to integrate with a running service                  | Builders, Agents      | Services                  |
| Entity definitions, CLI synopsis, YAML format            | All users             | Reference                 |
| Module structures, code paths, class names, `src/` paths | Contributors          | Internals                 |
| Architecture, data flow, formatter patterns              | Contributors          | Internals                 |

Never mix audiences on the same page. User-facing pages (Getting Started,
Products, Libraries, Reference) must never reference source file paths, class
names, or import statements.

## Writing Principles

**Product, Library, and Service tiers are task-oriented.** The folder name
signals the audience. It does not signal the page contents. A task may span
multiple products or libraries.

**Reference is lookup.** Do not write a tutorial. Keep it structured and
scannable. Write no prose narrative.

**Link to existing artifacts. Do not duplicate them.** Published JSON Schema and
RDF/SHACL live under the product's schema directory. Link to them. Do not
reproduce them. Published SKILL.md files link to Product Guides, Library Guides,
and Reference markdown companions for progressive disclosure.

**Published skills use absolute URLs.** Published skills (`fit-*`) run on
external systems. Use the full domain. Internal skills (`libs-*`, `kata-*`) may
use repo-relative paths.

**All tiers produce stable agent-fetchable URLs.** `libdoc` gives every page a
markdown companion at a predictable URL.

## Formatting Consistency

The format and the terminology must be identical across pages.

**Repeated tables** — The canonical tables for proficiency and behaviour
maturity live in the Authoring Standards guide. Every copy must match them
exactly.

**Field names** — Use the same tier vocabulary across disciplines and levels:

| Layer               | Names                                           | Used in                                 |
| ------------------- | ----------------------------------------------- | --------------------------------------- |
| Discipline tiers    | `coreSkills`, `supportingSkills`, `broadSkills` | Discipline YAML                         |
| Level proficiencies | `core`, `supporting`, `broad`                   | `baseSkillProficiencies` in levels.yaml |

Tier names in `baseSkillProficiencies` match discipline `<tier>Skills` arrays.

**Required/optional fields** — Verify against the product's JSON schema
directory. The schema's `required` array is the single source of truth. Do not
guess from examples.

**Casing** — Table cells lowercase unless proper nouns or sentence starts.
Proficiency levels always lowercase (`awareness`). Behaviour maturities
lowercase with underscores (`role-modeling`). Entity field names in backticks
(`` `baseSkillProficiencies` ``).

## Repository Documentation

Documentation lives in two layers: repository root and website.

| File              | Purpose                                         | Audience         |
| ----------------- | ----------------------------------------------- | ---------------- |
| `CLAUDE.md`       | Architecture context for coding agents          | Agents           |
| `CONTRIBUTING.md` | PR workflow, git conventions, quality, security | All contributors |
| `SECURITY.md`     | Vulnerability reporting                         | All contributors |

CONTRIBUTING.md is canonical for policies. CLAUDE.md references it. Onboarding
lives at `getting-started/contributors/`. Operations live at
`internals/operations/`.

## Content Framing

Guides frame around the reader's progress. They do not frame around product
features.

| Instead of                            | Write                                                              |
| ------------------------------------- | ------------------------------------------------------------------ |
| "Summit generates coverage heatmaps"  | "See which capabilities the team covers and where the gaps are"    |
| "Guide answers career questions"      | "When a promotion conversation ends with 'not yet,' get specifics" |

Do not use this JTBD vocabulary in guides: job, hire, fire, trigger, forces,
compete.

## Layouts

| Layout    | Use for                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| `product` | Section index pages (Getting Started, Guides, Reference, Internals) as a card grid   |
| _(none)_  | Leaf pages with prose and a table of contents                                        |
