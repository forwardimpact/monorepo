# Plan 04 — LLM Generates Entire Linked Documents

> Give the LLM the full entity graph and ontology, then have it generate
> complete HTML documents with rich microdata — no templates, no deterministic
> structure. The LLM owns both prose and markup.

**Clean break.** This plan fully replaces the current template-based rendering
pipeline for organizational HTML. There are no consumers of the existing output
format — old templates for courses, events, and blog posts are deleted, not
wrapped or shimmed. The LLM document generator replaces them entirely.

## Approach

Instead of templates that stamp out structural microdata with LLM prose filling
body slots, this plan delegates entire document generation to the LLM. Each
document type gets a detailed prompt containing:

1. The full entity roster (people, teams, projects, drugs, platforms)
2. The target Schema.org ontology with exact `itemtype`/`itemprop` patterns
3. The copilot-ld reference document as a few-shot example
4. Cross-linking requirements (minimum links per entity, multi-hop targets)

The LLM produces a complete, valid HTML file. Post-generation validation
ensures structural correctness and link integrity.

## Architecture

```
universe.dsl ──► Parser ──► Engine
                               │
                               ├── Full entity graph
                               │    people[], teams[], projects[],
                               │    drugs[] (from DSL or industry data),
                               │    platforms[] (from DSL or industry data)
                               │
                               ▼
                          Document Generator
                               │
                               │  For each document type:
                               │  1. Build entity context
                               │  2. Load reference example
                               │  3. Compose system + user prompt
                               │  4. Call LLM (ProseEngine.generateStructured)
                               │  5. Validate output HTML
                               │  6. Repair or retry on failure
                               │
                               ▼
                          Validator (HTML parse + IRI check)
                               │
                               ├── pass → write to examples/organizational/
                               └── fail → retry with error context (max 2)
```

## Prompt Design

### System prompt

```markdown
You are an expert knowledge engineer generating Schema.org microdata documents
for a pharmaceutical company's knowledge base.

Output requirements:
- Valid HTML5 with Schema.org microdata (itemscope, itemtype, itemid, itemprop)
- Entity IRIs use the pattern: https://{{domain}}/id/{{type}}/{{slug}}
- Every entity must have at least 3 cross-links to entities in other documents
- Use <link itemprop="..."> for structural relationships
- Use inline <span itemprop="..."> for contextual mentions in prose
- Descriptions must be rich, varied, and domain-appropriate
- Do NOT invent entity IRIs — use only IRIs from the provided roster
```

### User prompt (per document type)

```markdown
Generate a complete HTML document: "{{orgName}} Cross-Functional Projects"

## Entity Roster

### People (use these exact IRIs)
{{#people}}
- {{name}} ({{iri}}) — {{discipline}} {{level}}, {{teamName}}
{{/people}}

### Projects (generate entries for each)
{{#projects}}
- {{name}} ({{iri}}) — {{type}}, teams: {{teamNames}},
  {{startDate}} to {{endDate}}
{{/projects}}

### Drugs (link projects to these)
{{#drugs}}
- {{name}} ({{iri}}) — {{phase}}
{{/drugs}}

### Platforms (link projects to these)
{{#platforms}}
- {{name}} ({{iri}}) — {{category}}
{{/platforms}}

## Requirements
- Generate 1 <article> per project
- Each project must have: name, description, identifier, startDate, endDate
- Each project must link to: creator (1 person), contributors (3-7 people),
  about (1-3 drugs), isPartOf (1-3 platforms, 1-2 departments)
- Use Schema.org Project type with proper microdata

## Reference Example
Here is an example of the target quality:

```html
{{referenceExample}}
```

Generate the full HTML document now.
```

### Document types and prompts

| Document | Entity count | Prompt context size | Reference file |
| -------- | ------------ | ------------------- | -------------- |
| Projects | 5–12 projects | ~3K tokens | projects-cross-functional.html |
| Platforms | 15–28 platforms | ~4K tokens | technology-platforms-dependencies.html |
| Drugs | 5–10 drugs | ~3K tokens | drugs-development-pipeline.html |
| Courses | 10–16 courses | ~3K tokens | courses-learning-catalog.html |
| Events | 5–10 events | ~3K tokens | events-program-calendar.html |
| Blog posts | 15–45 posts | ~8K tokens | blog-posts.html |

## ProseEngine Integration

Use `ProseEngine.generateStructured()` with pre-built message arrays:

```js
async function generateDocument(type, entityContext, referenceHtml) {
  const systemPrompt = prompts.render('doc-system', entityContext)
  const userPrompt = prompts.render(`doc-${type}`, {
    ...entityContext,
    referenceExample: referenceHtml,
  })

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  return prose.generateStructured(`doc_${type}`, messages)
}
```

Each document is one LLM call (or cached). Blog posts may need splitting into
batches of 10–15 per call to stay within output token limits.

## Validation and Retry

After each LLM-generated document:

1. **HTML parse** — check for valid HTML structure
2. **Microdata extraction** — parse all `itemid`, `itemprop`, `href` values
3. **IRI validation** — every referenced IRI must exist in the entity roster
4. **Link density** — each entity must have ≥3 cross-links
5. **Schema.org type check** — `itemtype` values must be valid Schema.org types

On failure, retry once with the validation errors appended to the prompt:

```markdown
The previous output had these issues:
- Line 45: IRI "https://bionova.example/id/person/unknown" not in roster
- Line 78: Missing itemprop="startDate" on Project entity
- Blog post 3 has only 1 cross-link (minimum 3)

Regenerate the document fixing these issues.
```

## Pros

- Highest prose quality — LLM generates contextually rich descriptions
- Inline microdata is naturally woven into prose (copilot-ld quality)
- Few-shot reference examples guide consistent output format
- Fewest new code files — no template authoring needed
- Can generate entirely new document types by adding a prompt
- Blog post bodies have natural inline entity mentions with microdata

## Cons

- Highest LLM cost — 6–10 large calls (8K–30K output tokens each)
- Least deterministic — output varies between runs even with same seed
- Longest generation time — each document takes 30–120 seconds
- LLM may hallucinate entities not in the roster (requires validation)
- Output token limits may truncate large documents (blog posts with 45 entries)
- Retry loops add complexity and cost
- Hard to diff or review changes to generated output
- Cache invalidation when entity roster changes requires full regeneration

## Effort

- `render/doc-generator.js`: new file, ~200 lines
- 6 prompt files (`prompts/doc-*.prompt.md`): ~600 lines total
- `validate-links.js`: ~150 lines
- `render/html.js`: ~80 lines (dispatch to doc-generator)
- `render/industry-data.js`: ~200 lines (drugs/platforms if not DSL-driven)
- Reference example extraction: ~50 lines
- **Total: ~1280 lines, 5–6 days**

## Risk

High. The LLM is the entire rendering engine — any model change, prompt drift,
or output format issue breaks the pipeline. Mitigation: aggressive caching
(cache per-document), validation with repair, and fallback to template-based
rendering if LLM output fails validation after 2 retries. The cached output
is the real source of truth after initial generation.
