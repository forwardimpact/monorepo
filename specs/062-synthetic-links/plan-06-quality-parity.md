# Plan 06 — Quality Parity: Close Gaps Against Reference Dataset

> Follow-up to Plan 05 (hybrid two-pass). Address all findings from the
> benchmark comparison between generated output (`examples/organizational/`)
> and the reference dataset (`tmp/copilot-ld/examples/knowledge/`).

## Findings Summary

Plan 05 delivered the structural architecture (two-pass pipeline, industry
data, link assigner, enricher, validator). Benchmarking against the reference
dataset reveals gaps in five areas: **IRI integrity**, **org structure depth**,
**entity volume**, **document type coverage**, and **validation**.

### Metrics (generated vs reference)

| Metric                     | Generated | Reference | Gap    |
| -------------------------- | --------- | --------- | ------ |
| Unique entity IRIs         | 120       | 738       | 6×     |
| Schema.org types           | 22        | 27        | 5 missing |
| Unique itemprop values     | 40        | 69        | 42%    |
| Structural `<link>` tags   | 85        | 115       | 74%    |
| Inline `mentions` spans    | 53        | 106       | 50%    |
| IRI domain consistency     | 4 domains | 1 domain  | Broken |

## Work Items

### WI-1: Fix LLM IRI Hallucination (P0)

**Problem.** Pass 2 enrichment prompts tell the LLM which entities to mention
with their IRIs, but the LLM sometimes invents additional entities with IRIs
outside the universe domain (`example.org`, `www.example.com`). These
hallucinated IRIs create disconnected graph nodes that break traversal.

**Fix.** Add an explicit constraint to the enrichment system prompt and
post-process the LLM output to strip or rewrite any `itemid` attributes that
don't match the universe domain.

Changes:
- `render/enricher.js` — Add domain to `buildEnrichMessages()` signature;
  append constraint to system prompt: "Only use the exact IRIs provided. Do
  not invent new IRIs. All itemid values must start with
  `https://{domain}/id/`."
- `render/enricher.js` — After LLM returns prose, regex-scan for any
  `itemid="..."` values that don't start with `https://{domain}/`. Strip the
  `itemid` and `itemscope`/`itemtype` from those spans, keeping only the
  text content.
- `render/validate-links.js` — Add `checkEnrichedIriNamespace()` that scans
  final HTML output (not just linked entities) for off-domain `itemid` values.

**Lines:** ~40

### WI-2: Embed People in Org Structure (P1)

**Problem.** The `organization-departments-teams.html` template renders
departments and teams but does not embed people. The reference dataset has
134 `member` + 134 `worksFor` + 134 `jobTitle` properties — every person
appears in their team with role metadata. Our output has 0 person references
in the org structure.

**Fix.** Enrich the `departments.html` template and its rendering in `html.js`
to embed each person in their team.

Changes:
- `templates/departments.html` — Inside each team block, iterate over
  `members` array. Each member gets `itemprop="member"` with
  `itemscope itemtype="Person"`, `itemid` pointing to
  `https://{domain}/person/{id}`, plus `name`, `jobTitle`, and
  `link itemprop="worksFor"` back to the team.
- `render/html.js` — When building department template data, attach
  `members` to each team: `entities.people.filter(p => p.team_id === t.id)`
  with `iri`, `name`, `level`, `discipline` (for jobTitle derivation).
- `templates/leadership.html` — Add `itemid` IRIs to manager entries and
  `link itemprop="worksFor"` to their department.

**Lines:** ~80

### WI-3: Scale Content Counts for BioNova Universe (P1)

**Problem.** Generated volumes are driven by DSL `content guide_html` counts.
The default.dsl has minimal counts (2 blogs, 2 courses, 2 events). Even the
BioNova universe has lower counts than the reference (15 blogs vs 45, 15
courses vs 16, 10 events vs 8). The blog and course counts need to match or
exceed the reference for evaluation parity.

**Fix.** No code changes. Update `examples/universe.dsl` content block:

```dsl
content guide_html {
  articles 4
  article_topics [clinical, data_ai, drug_discovery, manufacturing]
  blogs 45
  faqs 35
  howtos 2
  howto_topics [clinical_data, gmp_procedures]
  reviews 40
  comments 55
  courses 16
  events 8
}
```

Also update `basecamp_markdown` persona count to match reference depth:

```dsl
content basecamp_markdown {
  personas 5
  persona_levels [L1, L2, L3, L4, L5]
  briefings_per_persona 8
  notes_per_persona 15
}
```

**Lines:** ~10 (DSL only)

### WI-4: Multiple Article Files (P1)

**Problem.** The reference has 4 separate article files (`articles-clinical-
study-reports.html`, `articles-data-ai.html`, `articles-drug-discovery.html`,
`articles-manufacturing-analytics.html`) each with 200+ lines and rich
cross-links. Our pipeline renders a single `articles-engineering-culture.html`
with 27 lines and 0 structural links.

**Fix.** Render one article file per `article_topic` defined in the DSL,
with Schema.org `ScholarlyArticle` type and cross-links to relevant drugs,
platforms, projects, and people.

Changes:
- `templates/article.html` — Rewrite. Use `ScholarlyArticle` type with
  `itemid`, `author` person with IRI, `about` links to drugs/platforms/
  projects, `datePublished`, `keywords`, `data-enrich` body block. One
  article per topic.
- `render/html.js` — Replace single article render with loop over
  `article_topics`. For each topic, select relevant entities (e.g.
  "drug_discovery" links to all drugs, "clinical" links to clinical-stream
  platform and trial-manager). Output files:
  `articles-{topic}.html`.
- `render/link-assigner.js` — Add `articles` to `LinkedEntities`. Assign
  drugs, platforms, people, and projects to each article topic
  deterministically.
- `render/enricher.js` — Add `article` case to `buildEnrichContext()`.

**Lines:** ~120

### WI-5: Enrich Reviews with Ratings (P2)

**Problem.** The reference has 41 reviews with `Rating` sub-entities
(`ratingValue`, `bestRating`, `worstRating`). Our reviews have no ratings.

**Fix.** Enrich the `reviews.html` template.

Changes:
- `templates/reviews.html` — Add `reviewRating` block with
  `itemscope itemtype="Rating"`, `ratingValue`, `bestRating` (5),
  `worstRating` (1). Add `itemAbout` link to a reviewed entity (course,
  event, or platform). Add `author` person with IRI.
- `render/html.js` — When building review data, assign a deterministic
  rating (seeded RNG, 1–5) and link to a reviewed entity.

**Lines:** ~40

### WI-6: Enrich Comments with Author/Date (P2)

**Problem.** The reference has 55 comments with `author` (Person IRI),
`dateCreated`, and `text` properties. Our comments lack person IRIs and dates.

**Fix.** Enrich the `comments.html` template.

Changes:
- `templates/comments.html` — Add `author` person with `itemid` IRI,
  `dateCreated` meta, `about` link to the parent entity being commented on
  (blog post, review, or article).
- `render/html.js` — Assign each comment an author (from people pool) and
  a deterministic date. Link to a parent entity.

**Lines:** ~30

### WI-7: Enrich FAQ with Cross-links (P2)

**Problem.** The reference FAQ page uses `FAQPage` type with 35 Q&A pairs,
each with `about` links to relevant entities. Our FAQ has 12 microdata
attributes and no cross-links.

**Fix.** Enrich the `faq.html` template.

Changes:
- `templates/faq.html` — Add `itemid` per question, `about` links to drugs/
  platforms/projects. Use `FAQPage` wrapper type.
- `render/html.js` — Assign cross-links from entity pool to each FAQ.

**Lines:** ~30

### WI-8: Blog Collection Wrapper (P2)

**Problem.** The reference wraps all blog posts in a `Blog` collection entity
with `blogPost` itemprop links. Each post has `isPartOf` linking back. This
supports collection traversal queries.

**Fix.**

Changes:
- `templates/blog.html` — Wrap all posts in
  `<section itemscope itemtype="Blog" itemid="https://{domain}/id/blog">`.
  Each post gets `itemprop="blogPost"` on the article and
  `<link itemprop="isPartOf" href="...blog">` back-link.

**Lines:** ~10

### WI-9: Wire validateLinks into Pipeline Output (P2)

**Problem.** `validateLinks()` was created but never integrated into the
pipeline. It only validates `LinkedEntities`, not the final HTML output. The
IRI hallucination bug (WI-1) proves that post-render HTML validation is needed.

**Fix.** Add HTML-level validation after Pass 2.

Changes:
- `render/validate-links.js` — Add `validateHTML(htmlFiles, domain)` that
  scans all rendered HTML for: (a) orphaned `itemid` values not matching
  any known entity, (b) `itemid` values outside domain namespace, (c)
  `<link href>` targets that don't appear as any `itemid` in the corpus.
- `pipeline.js` — Call `validateLinks()` and `validateHTML()` after Pass 2.
  Log results. Fail pipeline if critical checks fail.

**Lines:** ~60

## Implementation Order

```
WI-1  Fix IRI hallucination         (P0, prerequisite for quality data)
  ↓
WI-2  Embed people in org structure  (P1, highest single-metric impact)
  ↓
WI-3  Scale BioNova content counts   (P1, DSL-only, instant volume boost)
  ↓
WI-4  Multiple article files         (P1, adds 4 new document types)
  ↓
WI-5  Enrich reviews with ratings    (P2, template enrichment)
WI-6  Enrich comments with authors   (P2, template enrichment)
WI-7  Enrich FAQ with cross-links    (P2, template enrichment)
WI-8  Blog collection wrapper        (P2, template enrichment)
  ↓
WI-9  Wire validation into pipeline  (P2, quality gate)
```

WI-5 through WI-8 are independent and can be done in parallel.

## Files Changed

| File | WIs | Lines |
| ---- | --- | ----- |
| `render/enricher.js` | 1, 4 | ~30 |
| `render/validate-links.js` | 1, 9 | ~80 |
| `render/html.js` | 2, 4, 5, 6, 7 | ~80 |
| `render/link-assigner.js` | 4 | ~30 |
| `templates/departments.html` | 2 | ~30 |
| `templates/leadership.html` | 2 | ~10 |
| `templates/article.html` | 4 | ~40 |
| `templates/reviews.html` | 5 | ~20 |
| `templates/comments.html` | 6 | ~15 |
| `templates/faq.html` | 7 | ~15 |
| `templates/blog.html` | 8 | ~10 |
| `pipeline.js` | 9 | ~15 |
| `examples/universe.dsl` | 3 | ~10 |

## Effort

- Code changes: ~385 lines across 13 files
- No new modules — all changes extend existing files
- WI-1 is the most important (data quality gate)
- WI-2 has the biggest metric impact (adds ~200 Person entities to org graph)

## Expected Outcome

After all WIs, regenerating with the BioNova universe should produce:

| Metric                   | Current | Target | Reference |
| ------------------------ | ------- | ------ | --------- |
| Unique entity IRIs       | 120     | 700+   | 738       |
| Schema.org types         | 22      | 27     | 27        |
| Unique itemprop values   | 40      | 65+    | 69        |
| Structural `<link>` tags | 85      | 200+   | 115       |
| Inline `mentions` spans  | 53      | 150+   | 106       |
| IRI domain consistency   | 4       | 1      | 1         |
| HTML files               | 14      | 18+    | 22        |

The generated dataset should exceed the reference in structural link density
(thanks to the deterministic platform DAG and drug cross-links) while matching
it in volume and type diversity. The IRI hallucination fix ensures every
entity in the graph is reachable via valid, consistent IRIs.
