# Plan 05 — Hybrid Two-Pass: Deterministic Skeleton + LLM Link Enrichment

> First pass: deterministic templates produce complete HTML with all structural
> microdata links. Second pass: LLM enriches prose fields in-place, adding
> natural-language entity mentions with inline microdata. The structural graph
> is always correct; the LLM only improves prose quality.

**Clean break.** This plan fully replaces the current templates and rendering
logic for all organizational HTML output. There are no consumers of the existing
output format — old templates are deleted and replaced, not wrapped or shimmed.
The two-pass pipeline replaces the single-pass renderer entirely.

## Approach

Combine the reliability of Plan 01/02 (deterministic templates) with the prose
quality of Plan 03/04 (LLM generation). Two distinct passes:

**Pass 1 (deterministic):** Templates render all documents with full structural
microdata — `<link>` tags for entity relationships, `<meta>` for dates and
identifiers, placeholder prose in `<p>` and `<div>` blocks. The output is a
valid, fully-linked knowledge graph with generic descriptions.

**Pass 2 (LLM enrichment):** The LLM receives each document's placeholder prose
blocks along with the entity context. It rewrites each prose block to include
natural inline entity mentions with `<span itemprop>` microdata. The structural
`<link>` tags are untouched — the LLM only enhances the prose.

The key insight: structural links (who is on which project, which platform
depends on which) are deterministic and correct by construction. Inline prose
mentions (referring to a drug by name in a blog post body) benefit from LLM
fluency. Separating these two concerns makes each pass simple and testable.

## Architecture

```
universe.dsl ──► Parser ──► Engine
                               │
                               ├── entities (people, teams, projects)
                               ├── industry data (drugs, platforms)
                               │
                               ▼
                          Link Assigner (deterministic)
                               │
                               ▼
                    ┌─── Pass 1: Template Render ───┐
                    │                                │
                    │  Full HTML with all <link>      │
                    │  tags, <meta>, structural       │
                    │  microdata. Prose slots have     │
                    │  placeholder descriptions.       │
                    │                                │
                    └────────────┬───────────────────┘
                                │
                    ┌─── Pass 2: LLM Enrichment ────┐
                    │                                │
                    │  For each prose block:          │
                    │  1. Extract text + entity ctx   │
                    │  2. LLM rewrites with inline    │
                    │     microdata mentions           │
                    │  3. Replace in HTML              │
                    │                                │
                    │  ProseEngine with cache          │
                    │                                │
                    └────────────┬───────────────────┘
                                │
                          Validator
                                │
                          examples/organizational/
```

## Pass 1: Deterministic Skeleton

Uses the same infrastructure as Plan 01:

- `render/industry-data.js` for drugs and platforms
- `render/link-assigner.js` for deterministic cross-linking
- New and enriched templates for all 6 document types

Templates produce placeholder prose with marker attributes:

```html
<article itemscope itemtype="https://schema.org/BlogPosting"
         itemid="https://bionova.example/id/blog/ai-drug-discovery">
  <h2 itemprop="headline">{{headline}}</h2>
  <meta itemprop="identifier" content="BLOG-2025-001" />
  <meta itemprop="keywords" content="{{keywords}}" />
  <span>By <span itemprop="author" itemscope itemtype="https://schema.org/Person"
    itemid="https://bionova.example/id/person/thoth">
    <span itemprop="name">Thoth</span></span></span>
  <time itemprop="datePublished" datetime="2025-01-10">January 10, 2025</time>

  <!-- structural links (deterministic, never touched by LLM) -->
  <link itemprop="about" href="https://bionova.example/id/drug/oncora" />
  <link itemprop="about" href="https://bionova.example/id/platform/molecularforge" />

  <!-- prose block (enriched by LLM in pass 2) -->
  <div itemprop="articleBody" data-enrich="blog_1">
    <p>Blog post about AI-driven drug discovery at BioNova.</p>
  </div>
</article>
```

The `data-enrich` attribute marks blocks for LLM enrichment. Without LLM
(no-prose mode), the placeholder stays and the document is still valid with all
structural links intact.

## Pass 2: LLM Enrichment

A new `render/enricher.js` module:

1. Parses the Pass 1 HTML output
2. Finds all elements with `data-enrich` attributes
3. For each, builds an LLM prompt with:
   - The element's context (parent entity type, assigned links)
   - Available entities to mention inline
   - Microdata format instructions
4. Calls `ProseEngine.generateLinked()` with the context
5. Replaces the placeholder content with LLM-generated prose
6. Strips `data-enrich` attributes from final output

### Enrichment prompt

```markdown
Rewrite this text block for a {{entityType}} document about "{{entityName}}".

Current text: "{{placeholder}}"

Write 100-200 words of rich prose. Naturally mention these entities using
Schema.org microdata:

{{#mentionTargets}}
- {{type}}: {{name}} ({{iri}})
{{/mentionTargets}}

Use this pattern for inline mentions:
<span itemprop="mentions" itemscope itemtype="https://schema.org/{{type}}"
  itemid="{{iri}}"><span itemprop="name">{{name}}</span></span>

Output only the HTML content for the <div> — no wrapper tags.
```

### Enrichment scope

| Document   | Prose blocks enriched     | Structural links (untouched)               |
| ---------- | ------------------------- | ------------------------------------------ |
| Projects   | description per project   | creator, contributor, about, isPartOf      |
| Platforms  | description per platform  | softwareRequirements, isRelatedTo          |
| Drugs      | description, pharmacology | isRelatedTo, isPartOf                      |
| Courses    | description per course    | coursePrerequisites, provider, isRelatedTo |
| Events     | description per event     | organizer, attendee, about                 |
| Blog posts | articleBody per post      | author, about (structural links)           |
| Articles   | body per article          | topic links                                |

Total enrichment calls: ~80–120 small LLM calls (100–300 tokens each).

## Graceful Degradation

The two-pass design means the pipeline works in three modes:

| Mode                   | Pass 1      | Pass 2  | Quality                       |
| ---------------------- | ----------- | ------- | ----------------------------- |
| `--no-prose` (default) | ✓ Templates | ✗ Skip  | Full graph, placeholder prose |
| `--cached`             | ✓ Templates | ✓ Cache | Full graph, cached rich prose |
| `--generate`           | ✓ Templates | ✓ LLM   | Full graph, fresh rich prose  |

In no-prose mode, every document is still a valid, fully-linked knowledge graph.
The LLM only adds prose quality — it never affects graph topology.

## Pros

- **Graph correctness guaranteed** — structural links are deterministic
- **LLM can't break the graph** — it only writes prose inside marked blocks
- **Graceful degradation** — works without LLM, cached, or live
- **Small LLM calls** — each enrichment is 100–300 tokens, cheap and fast
- **Easy validation** — structural validation on Pass 1 output, prose validation
  on Pass 2 output, independent concerns
- **Selective regeneration** — re-enrich one document without touching others
- **Diffable** — Pass 1 output is deterministic and can be committed; Pass 2
  enrichment is cached and reproducible

## Cons

- Two-pass adds pipeline complexity
- LLM inline mentions may reference entities already linked via `<link>` tags
  (redundant but not harmful)
- Enrichment prompts need tuning per entity type
- ~80–120 LLM calls (though each is small)
- `data-enrich` attribute is a custom convention (stripped before output)

## Implementation

### New files

| File                              | Lines | Purpose                             |
| --------------------------------- | ----- | ----------------------------------- |
| `render/industry-data.js`         | ~200  | Drug and platform definitions       |
| `render/link-assigner.js`         | ~150  | Deterministic cross-link assignment |
| `render/enricher.js`              | ~180  | Pass 2 LLM enrichment engine        |
| `prompts/enrich-system.prompt.md` | ~40   | System prompt for enrichment        |
| `prompts/enrich-prose.prompt.md`  | ~30   | User prompt template                |
| `validate-links.js`               | ~100  | IRI and link density validation     |

### Modified files

| File             | Changes    | Purpose                                 |
| ---------------- | ---------- | --------------------------------------- |
| `render/html.js` | ~120 lines | New document types, enrichment dispatch |
| `pipeline.js`    | ~30 lines  | Add Pass 2 after Pass 1                 |

### New/enriched templates

| Template         | Status   | Key additions                            |
| ---------------- | -------- | ---------------------------------------- |
| `projects.html`  | New      | Full project microdata with data-enrich  |
| `platforms.html` | New      | Platform DAG with data-enrich            |
| `drugs.html`     | New      | Drug pipeline with data-enrich           |
| `courses.html`   | Enriched | IDs, prereqs, attendees, data-enrich     |
| `events.html`    | Enriched | Organizer, attendees, about, data-enrich |
| `blog.html`      | Enriched | Author, keywords, data-enrich            |

## Effort

- New files: ~700 lines
- Modified files: ~150 lines
- Templates: ~350 lines
- Tests: ~150 lines
- **Total: ~1350 lines, 5–6 days**

## Risk

Low-medium. Pass 1 is pure template rendering (low risk). Pass 2 is isolated —
if enrichment fails, the output from Pass 1 is still valid. The main risk is
prompt tuning for consistent inline microdata quality. Mitigation: start with
blog posts (highest value), iterate prompts, then extend to other document
types. Cache means prompt iteration doesn't require repeated LLM calls.
