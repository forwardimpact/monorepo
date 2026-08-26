# Documentation Standards

## Information Architecture

A six-tier hierarchy under `websites/<site>/docs/` serves four user groups
(Leadership, Engineers, Builders and Agents, Contributors):

| Tier              | Intent                              | Subsections                                                                                                                                                                            |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getting-started` | "Get me going fast"                 | `leaders/`, `engineers/`, `contributors/`                                                                                                                                              |
| `products`        | "Help me accomplish a product task" | One per product job                    |
| `libraries`       | "Help me accomplish a library task" | One per library job                    |
| `services`        | "Help me integrate with a service"  | One per service job                    |
| `reference`       | "Let me look something up"          | `lifecycle/`, `model/`, `yaml-schema/`                                                                                                                                                 |
| `internals`       | "Show me how this is built"         | One per product or shared substrate (e.g. `kata/`, `librepl/`, `operations/`, `release/`, `vectors/`)                                                                                  |

Do not cite a snapshot of the subsection names. Derive the live list from the
tree with `ls websites/<site>/docs/<tier>/`.

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

**Published skills use absolute URLs.** Published skills (`fit-*`, `gemba-*`,
`kata-*`, `jidoka-*`) run on external systems. Use the full domain of the site
that owns the page. Internal skills may use repo-relative paths.

**All tiers produce stable agent-fetchable URLs.** `libdoc` gives every page a
markdown companion at a predictable URL.

## Formatting Consistency

The format and terminology must be identical across pages.

**Repeated tables** — The canonical tables for proficiency and behaviour
maturity live in the Authoring Standards guide. Copies must match exactly.

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

Guides frame around the reader's progress. Do not frame around product
features.

| Instead of                            | Write                                                              |
| ------------------------------------- | ------------------------------------------------------------------ |
| "Summit generates coverage heatmaps"  | "See which capabilities the team covers and where the gaps are"    |
| "Guide answers career questions"      | "When a promotion conversation ends with 'not yet,' get specifics" |

Never use this JTBD vocabulary in guides: job, hire, fire, trigger, forces,
compete.

## Layouts

| Layout    | Use for                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| `product` | Section index pages (Getting Started, Guides, Reference, Internals) as a card grid   |
| _(none)_  | Leaf pages with prose and a table of contents                                        |
