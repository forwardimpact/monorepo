# Plan 01 — Deterministic Template + Entity-Graph Linking

> Extend templates and the HTML renderer to produce rich microdata using only
> deterministic entity assignment from the existing DSL data. No LLM calls, no
> DSL syntax changes.

**Clean break.** This plan fully replaces the current minimal templates and
rendering logic for courses, events, and blog posts. There are no consumers of
the existing output format — old templates are deleted and replaced, not wrapped
or shimmed.

## Approach

Use the entity graph already built by `buildEntities()` — people, teams,
departments, projects — and add new entity arrays (drugs, platforms) as
hard-coded data keyed to the DSL's `industry` field. The HTML renderer assigns
cross-links deterministically using the seeded RNG to pick attendees, authors,
contributors, and prerequisites.

All linking logic lives in the renderer (`render/html.js`) and new templates.
The DSL, parser, and engine are untouched.

## Architecture

```
universe.dsl ──► Parser ──► Engine (unchanged)
                               │
                               ├── entities.people
                               ├── entities.teams
                               ├── entities.projects
                               │
                               ▼
                          HTML Renderer (extended)
                               │
                               ├── Industry Data Module
                               │    └── drugs[], platforms[] per industry
                               │
                               ├── Link Assigner (seeded RNG)
                               │    └── people → projects, courses, events
                               │    └── projects → drugs, platforms
                               │    └── platforms → platforms (DAG)
                               │    └── courses → courses (prereqs)
                               │
                               └── Templates (new + enriched)
                                    ├── projects.html         (new)
                                    ├── platforms.html         (new)
                                    ├── drugs.html             (new)
                                    ├── courses.html           (enriched)
                                    ├── events.html            (enriched)
                                    └── blog.html              (enriched)
```

## Implementation

### Industry data module

A new file `render/industry-data.js` exports entity arrays per industry:

```js
const PHARMA_DRUGS = [
  { id: 'oncora', name: 'Oncora', drugClass: 'Targeted kinase inhibitor',
    phase: 'Phase III', parent: null },
  { id: 'oncora-xr', name: 'Oncora-XR', drugClass: 'Extended-release inhibitor',
    phase: 'Phase II', parent: 'oncora' },
  // ... 10 drugs
]

const PHARMA_PLATFORMS = [
  { id: 'datalake', name: 'DataLake', category: 'Data Infrastructure',
    version: '2.4', deps: [] },
  { id: 'molecularforge', name: 'MolecularForge', category: 'Computational Discovery',
    version: '5.1', deps: ['bioanalyzer', 'drugdesignstudio'] },
  // ... 15-20 platforms with DAG deps
]
```

### Link assigner

A new file `render/link-assigner.js` uses the seeded RNG to:

1. Assign 3–7 people as contributors to each project
2. Assign 1 project lead (manager from an assigned team)
3. Link projects to 1–3 drugs and 1–3 platforms
4. Build course prerequisite chains (3–4 tracks of 3 courses each)
5. Assign 4–8 attendees to each event from the people roster
6. Pick blog post authors from the people roster

### Template changes

**New `projects.html`:**

```html
{{#projects}}
<article itemscope itemtype="https://schema.org/Project"
         itemid="{{{domain}}}/id/project/{{id}}">
  <h2 itemprop="name">{{name}}</h2>
  <p itemprop="description">{{description}}</p>
  <meta itemprop="identifier" content="{{identifier}}" />
  <meta itemprop="startDate" content="{{startDate}}" />
  <meta itemprop="endDate" content="{{endDate}}" />
  <link itemprop="creator" href="{{{domain}}}/id/person/{{lead}}" />
  {{#contributors}}
  <link itemprop="contributor" href="{{{domain}}}/id/person/{{.}}" />
  {{/contributors}}
  {{#drugs}}
  <link itemprop="about" href="{{{domain}}}/id/drug/{{.}}" />
  {{/drugs}}
  {{#platforms}}
  <link itemprop="isPartOf" href="{{{domain}}}/id/platform/{{.}}" />
  {{/platforms}}
</article>
{{/projects}}
```

Similar templates for drugs, platforms. Enriched templates for courses (add
`coursePrerequisites` link, `identifier`, attendee links), events (add
`organizer`, `attendee` links, `about` links), blogs (add `author` with nested
Person, `about`/`mentions` inline spans).

## Pros

- Zero LLM cost — runs fully offline
- Deterministic — same seed always produces same output
- Fast — no network calls, pure template rendering
- Simple — no DSL or parser changes needed
- Reuses existing infrastructure (RNG, templates, renderer)

## Cons

- Drug/platform data is hard-coded per industry, not DSL-driven
- Descriptions are generic placeholders (no natural language richness)
- Blog post article bodies lack inline entity mentions — only `<link>` tags
- Adding a new industry requires writing a new data module
- No prose variation — every project description reads the same

## Effort

- `render/industry-data.js`: new file, ~200 lines
- `render/link-assigner.js`: new file, ~150 lines
- `render/html.js`: extend to call assigner, ~80 lines changed
- 3 new templates + 3 enriched templates: ~250 lines total
- Tests: ~100 lines
- **Total: ~780 lines, 2–3 days**

## Risk

Low. No parser changes, no LLM dependency. The main risk is that hard-coded
industry data drifts from the DSL entities if someone changes the DSL without
updating the industry module. Mitigation: validation checks that drug/platform
IDs don't collide with DSL entity IDs.
