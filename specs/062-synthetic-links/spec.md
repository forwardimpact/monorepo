# Rich Knowledge Graph for Synthetic Data

Enrich `libuniverse` synthetic organizational output with deep, cross-linked
microdata so the Guide agent can be evaluated on multi-hop graph traversal.

```
specs/062-synthetic-links/
  spec.md                        This document (WHAT and WHY)
  plan-01-template-linking.md    Deterministic template + entity-graph linking
  plan-02-dsl-expansion.md       New DSL blocks for products, platforms, courses
  plan-03-llm-link-enrichment.md LLM prose with injected entity links
  plan-04-llm-doc-generation.md  LLM generates entire linked documents
  plan-05-hybrid-two-pass.md     Deterministic skeleton + LLM link enrichment
```

## Why

The Guide product is a knowledge graph agent that traverses RDF graphs to answer
multi-hop queries. Its evaluation requires synthetic data with realistic, dense
cross-linking between entities. The current `libuniverse` output fails this
requirement in five ways:

1. **No project documents.** Projects exist in the DSL but are never rendered
   into organizational HTML. There are no project pages with start/end dates,
   leads, members, cross-functional links to platforms, drugs, or departments.

2. **No product/drug entities.** The DSL has no concept of drug products or
   development pipeline stages. The copilot-ld reference data has 10 drugs with
   mechanism of action, clinical phase, derivative relationships, and platform
   dependencies.

3. **No technology platform graph.** No platform entities with dependency chains
   (`softwareRequirements`), version metadata, or cross-links to projects and
   drugs. The copilot-ld reference has 28 platforms forming a dependency DAG.

4. **Shallow courses, events, and blog posts.** Current templates produce
   minimal microdata — courses have no IDs, no prerequisites, no attendee links;
   events have no attendees, no `about` links; blog posts have no authors, no
   `mentions` or `about` links to entities.

5. **No cross-file linking.** Entities in one file don't reference entities in
   other files via stable IRIs. A project page doesn't link to its drug; a
   course doesn't link to a platform it teaches. The knowledge graph is a
   collection of isolated islands, not a connected graph.

These gaps make it impossible to write evaluation queries that require 2+ hops
(e.g. "Which people work on projects related to Oncora?" requires
person→project→drug). Without rich linking, Guide evals test only single-node
retrieval, not graph reasoning.

### Reference Quality

The copilot-ld project (`tmp/copilot-ld/examples/knowledge/`) demonstrates the
target quality:

| Document                        | Entities | Cross-links per entity                       |
| ------------------------------- | -------- | -------------------------------------------- |
| projects-cross-functional.html  | 12       | 8–12 (leads, members, platforms, drugs)      |
| technology-platforms.html       | 28       | 4–8 (dependencies, projects, drugs)          |
| drugs-development-pipeline.html | 10       | 5–9 (phases, platforms, projects, events)    |
| courses-learning-catalog.html   | 16       | 4–7 (prerequisites, platforms, products)     |
| events-program-calendar.html    | 8        | 6–10 (organizer, attendees, projects, drugs) |
| blog-posts.html                 | 45       | 3–6 (author, about, mentions)                |

The generated output must reach comparable density to enable multi-hop
evaluation queries.

## What

Extend `libuniverse` to produce organizational HTML with rich Schema.org
microdata linking. Specifically:

### New entity types

| Entity   | Schema.org type              | Key properties                                                                                                                             |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Drug     | `schema:Drug`                | name, drugClass, activeIngredient, clinicalPharmacology, identifier, legalStatus, isRelatedTo (projects, platforms, events, other drugs)   |
| Platform | `schema:SoftwareApplication` | name, description, applicationCategory, softwareVersion, softwareRequirements (other platforms), isRelatedTo (projects, drugs)             |
| Project  | `schema:Project`             | name, description, identifier, startDate, endDate, creator, member, contributor (people), about (drugs), isPartOf (platforms, departments) |

### Enriched existing types

| Entity      | Added properties                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Course      | identifier (course ID), coursePrerequisites (link to other courses), provider (link to org), isRelatedTo (platforms, drugs, projects), attendee (link to people) |
| Event       | organizer (link to person), attendee (links to people), about (links to projects, drugs, platforms), location, eventStatus                                       |
| BlogPosting | author (link to person with name), about (inline links to drugs, platforms, projects), mentions (inline links to people, orgs), identifier, keywords             |

### Cross-linking requirements

Every generated entity must link to at least 2 entities in other documents via
stable IRIs following the pattern `https://{domain}/id/{type}/{id}`. The IRI
namespace must be consistent across all files so the graph service can merge
them into a single connected RDF graph.

### Multi-hop evaluation targets

The output must enable at least these query patterns:

| Hops | Query pattern                           | Example                                                                       |
| ---- | --------------------------------------- | ----------------------------------------------------------------------------- |
| 1    | person → team                           | "What team does Thoth lead?"                                                  |
| 2    | person → project → drug                 | "What drugs are connected to Thoth's projects?"                               |
| 2    | course → prerequisite → platform        | "What platforms does Pharm 301's prerequisite chain cover?"                   |
| 3    | drug → project → person → team          | "What teams have members working on Oncora projects?"                         |
| 3    | platform → dependency → project → event | "What events relate to projects using MolecularForge's dependencies?"         |
| 4    | blog → author → team → project → drug   | "What drugs relate to projects led by teams whose members author blog posts?" |

### Structural constraints

- All entity IRIs use the DSL `domain` as base:
  `https://{domain}/id/{type}/{slug}`
- Person IRIs reuse the existing `person.iri` from entity generation
- Drug, platform, project IRIs are deterministic from DSL identifiers
- Courses use sequential IDs (e.g. `PHARM-101`) with prerequisite chains
- Events reference the projects and people they relate to
- Blog post authors must be actual people from the generated roster
- Platform dependency chains form a DAG (no cycles)
- Drug derivatives reference parent drugs

### Output files

These new or enriched files land in `examples/organizational/`:

| File                                     | Content                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `projects-cross-functional.html`         | New — all projects with members, platforms, drugs                        |
| `technology-platforms-dependencies.html` | New — platform dependency graph                                          |
| `drugs-development-pipeline.html`        | New — drug pipeline with phases and links                                |
| `courses-learning-catalog.html`          | Enriched — add IDs, prerequisites, attendees, platform/product links     |
| `events-program-calendar.html`           | Enriched — add organizer, attendees, about links                         |
| `blog-posts.html`                        | Enriched — add named authors, about/mentions links with inline microdata |

### What NOT to change

- DSL parser syntax (may extend with new block types, but don't break existing)
- Framework/pathway rendering (YAML output unchanged)
- Activity/raw rendering (JSON/CSV output unchanged)
- Personal/markdown rendering (briefings unchanged)
- Existing template files that work correctly (leadership, departments, roles)

## Success Criteria

1. `npx fit-universe` produces all 6 target files with dense microdata
2. Every entity has at least 2 cross-file IRI links
3. The generated graph supports all 6 multi-hop query patterns listed above
4. `npx fit-map validate` still passes on generated pathway data
5. Guide evals using the generated data can test 2–4 hop traversal
6. Blog posts have named authors linked to roster people
7. Courses have prerequisite chains and course IDs
8. Events have named attendees linked to roster people
9. Platforms form a dependency DAG with no cycles
10. Drug entities have development phases and derivative relationships
