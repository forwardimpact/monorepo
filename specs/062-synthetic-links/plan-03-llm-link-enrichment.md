# Plan 03 — LLM Prose with Injected Entity Links

> Use the existing ProseEngine to generate natural-language content where the
> LLM prompt includes the full entity roster and linking instructions. The LLM
> produces prose with embedded Schema.org microdata links to real entities from
> the DSL.

**Clean break.** This plan fully replaces the current templates and prose
generation for all organizational HTML output. There are no consumers of the
existing output format — old templates are deleted and replaced, not wrapped or
shimmed. The prose cache is regenerated from scratch.

## Approach

Keep the deterministic skeleton for structural pages (projects, platforms,
drugs) using templates, but use the LLM to generate blog posts, article bodies,
course descriptions, and event descriptions where the prose naturally weaves in
references to other entities. The LLM receives the entity graph as context and
is instructed to embed `itemprop="about"`, `itemprop="mentions"`, and
`itemprop="author"` microdata linking to specific entity IRIs.

This extends the existing Tier 1 prose generation to produce *linked* prose
rather than isolated text blocks.

## Architecture

```
universe.dsl ──► Parser ──► Engine
                               │
                               ├── entities (people, teams, projects)
                               ├── industry data (drugs, platforms) [Plan 01 style]
                               │
                               ▼
                          Link Assigner (deterministic)
                               │  assigns: authors, attendees, project members,
                               │  course prereqs, platform DAG
                               │
                               ▼
                          ProseEngine (extended)
                               │
                               ├── Structural prose keys (existing)
                               │    blog_0, article_clinical, faq_0, ...
                               │
                               ├── Linked prose keys (new)
                               │    blog_linked_0, event_desc_0, course_desc_0, ...
                               │
                               │  Context includes:
                               │    - Entity roster (people, drugs, platforms)
                               │    - Assigned links for this entity
                               │    - IRI patterns
                               │    - Microdata format instructions
                               │
                               ▼
                          HTML Renderer
                               │  Injects LLM prose into templates
                               │  Templates provide structural microdata
                               │  LLM prose provides inline microdata
                               │
                               ▼
                          examples/organizational/
```

## Prompt Design

### System prompt (new: `prompts/linked-prose-system.prompt.md`)

```markdown
You are a technical writer for {{orgName}} ({{industry}}).

When writing content, naturally reference other entities using Schema.org
microdata. Use these exact patterns:

To mention a person:
<span itemprop="mentions" itemscope itemtype="https://schema.org/Person"
  itemid="{{iri}}"><span itemprop="name">{{name}}</span></span>

To reference a product/drug as a topic:
<span itemprop="about" itemscope itemtype="https://schema.org/Drug"
  itemid="{{iri}}"><span itemprop="name">{{name}}</span></span>

To reference a platform:
<span itemprop="about" itemscope itemtype="https://schema.org/SoftwareApplication"
  itemid="{{iri}}"><span itemprop="name">{{name}}</span></span>

Rules:
- Use 3–6 entity references per article
- Reference entities from the provided roster only
- Use varied vocabulary — do not repeat phrases
- Keep microdata attributes exact (itemprop, itemscope, itemtype, itemid)
```

### User prompt example (blog post)

```markdown
Write a 200-word blog post for {{orgName}}'s engineering blog.

Topic: {{topic}}
Author: {{authorName}} ({{authorIri}})
Date: {{date}}

Available entities to reference (use 3-5):
{{#drugs}}
- Drug: {{name}} ({{iri}}) — {{phase}}
{{/drugs}}
{{#platforms}}
- Platform: {{name}} ({{iri}}) — {{category}}
{{/platforms}}
{{#people}}
- Person: {{name}} ({{iri}}) — {{team}}
{{/people}}
{{#projects}}
- Project: {{name}} ({{iri}})
{{/projects}}

Write the post body as HTML paragraphs with inline microdata references.
```

### ProseEngine extension

Add a new method `generateLinked()` that passes entity context to the LLM:

```js
async generateLinked(key, entityContext) {
  const messages = [
    { role: 'system', content: prompts.render('linked-prose-system', entityContext) },
    { role: 'user', content: prompts.render(`linked-${key}`, entityContext) },
  ]
  return this.generateStructured(`linked_${key}`, messages)
}
```

## What Gets LLM Prose

| Output type | Structural (template) | LLM-generated prose |
| ----------- | --------------------- | ------------------- |
| Projects | itemid, dates, lead, contributors, about links | description |
| Platforms | itemid, category, version, deps, project links | description |
| Drugs | itemid, class, phase, ingredient, platform links | description, pharmacology |
| Courses | itemid, prereqs, provider | description (with entity mentions) |
| Events | itemid, organizer, attendees, about links | description (with entity mentions) |
| Blog posts | itemid, author, date | articleBody (with inline microdata) |
| Articles | itemid, topic | body (with inline microdata) |

## Template Changes

Blog template becomes a hybrid — structural wrapper from template, body from
LLM:

```html
<article itemscope itemtype="https://schema.org/BlogPosting"
         itemid="{{{domain}}}/id/blog/{{slug}}">
  <h2 itemprop="headline">{{headline}}</h2>
  <meta itemprop="identifier" content="{{identifier}}" />
  <meta itemprop="keywords" content="{{keywords}}" />
  <span>By <span itemprop="author" itemscope itemtype="https://schema.org/Person"
    itemid="{{{authorIri}}}"><span itemprop="name">{{authorName}}</span></span></span>
  <time itemprop="datePublished" datetime="{{date}}">{{dateDisplay}}</time>
  <div itemprop="articleBody">
    {{{linkedBody}}}
  </div>
</article>
```

The `{{{linkedBody}}}` is triple-mustache (unescaped) because it contains HTML
microdata from the LLM.

## Pros

- Blog posts and articles read naturally — entities are woven into prose
- Rich inline microdata (not just `<link>` tags) matches copilot-ld quality
- Structural pages are still deterministic and fast
- Leverages existing ProseEngine and caching infrastructure
- Cache means LLM cost is one-time; subsequent runs are free
- Different LLM models can produce different prose styles

## Cons

- LLM output quality varies — microdata formatting may be inconsistent
- Requires validation that LLM-produced IRIs match actual entity IRIs
- ~50–80 LLM calls for a full BioNova generation (15 blogs + 4 articles +
  15 courses + 10 events + projects + drugs + platforms)
- Prompt engineering iteration needed to get consistent microdata
- If LLM hallucinates an entity IRI, the graph has a dangling link

## Validation

Post-generation validation scans all HTML files for `itemid` attributes and
checks:

1. Every `href` value in `<link itemprop=...>` resolves to a known entity IRI
2. Every `itemid` in inline microdata matches a known entity IRI
3. Blog post authors are actual people from the roster
4. Course prerequisites reference actual course IDs
5. No duplicate `itemid` values within a file

Add a `validate-links.js` to the pipeline that runs after rendering.

## Effort

- `prompts/linked-prose-system.prompt.md`: ~50 lines
- `prompts/linked-blog.prompt.md` + 4 more: ~200 lines total
- `engine/prose.js` extension: ~60 lines
- `render/html.js` extension: ~150 lines
- `render/industry-data.js`: ~200 lines (same as Plan 01)
- `render/link-assigner.js`: ~150 lines (same as Plan 01)
- 3 new templates + 3 enriched templates: ~300 lines
- `validate-links.js`: ~100 lines
- **Total: ~1210 lines, 4–5 days**

## Risk

Medium. LLM microdata formatting is the main risk — the LLM may produce
malformed HTML, wrong `itemprop` values, or hallucinated IRIs. Mitigation:
post-generation validation with auto-repair for common issues (strip unknown
IRIs, fix attribute names). The cache means bad output can be regenerated
selectively.
