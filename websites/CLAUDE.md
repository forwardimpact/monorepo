# Websites

`fit-doc` builds four sites ([internals](fit/docs/internals/fit-doc/index.md)).
Three are live. One is built and waits for a publish workflow.

| Site                       | Source                | Domain                   | Status |
| -------------------------- | --------------------- | ------------------------ | ------ |
| Forward Impact Engineering | `websites/fit/`       | `www.forwardimpact.team` | Live   |
| Kata Agent Team            | `websites/kata/`      | `www.kata.team`          | Live   |
| Jidoka                     | `websites/jidoka/`    | `www.jidoka.team`        | Live   |
| Monorepo Structure         | `websites/monorepo/`  | `www.monorepo.team`      | Built  |

Preview locally:

```sh
bunx fit-doc serve --src=websites/fit --watch
bunx fit-doc serve --src=websites/kata --watch
bunx fit-doc serve --src=websites/jidoka --watch
bunx fit-doc serve --src=websites/monorepo --watch
```

## Page Conventions

Every page is a directory containing `index.md`. No other `.md` filenames.

- **Frontmatter** — `title` (rendered as H1) and `description` (meta) are
  required. Optional: `toc: false`, `layout: product|home`, `hero: {…}`.
- **Headings** — body headings start at `##`. The build renders H1 from
  `title`. A manual `# Title` produces a duplicate.
- **Links** — absolute directory paths (`/docs/products/agent-teams/`),
  never relative, never `index.md`. External links use full URLs.
- **Code blocks** — always specify a language tag (`sh`, `yaml`, `mermaid`).
- **Card grids use content partials.** `<!-- part:card:relative-path -->`
  markers resolve to the target page's `title` and `description` at build
  time. The build fails if the target is missing. Hand-written `<a>` cards
  are only for external links or same-page anchors.
- **Nothing checks hand-written markdown links.** Only partials validate
  their targets.
- **Cross-links** — every non-hub page ends with `## What's next` and uses
  partials only (max six cards). When a page has `## Verify`,
  `## What's next` follows it. Card targets follow JTBD structure. Big Hire
  guides link to Little Hire children and sibling Big Hire trees. Little Hire
  guides link back to the parent Big Hire and siblings. Getting Started pages
  link to the product page and primary guide.

## Page Types

### Product Pages

Product pages (`/map/`, `/pathway/`, etc.) follow a consistent structure:

1. Frontmatter with `layout: product` and hero section (light metaphor
   reference in subtitle, then the progress frame)
2. Situation paragraph — 2-3 sentences that describe the moment someone
   realizes they need this product (no blockquote)
3. **What becomes possible** — organized by persona, each with a progress
   statement and concrete outputs. Canonical persona names from
   [JTBD.md](/JTBD.md): Engineering Leaders, Empowered Engineers, Platform
   Builders. Only personas with a relevant outcome for that product appear.
4. Product-specific detail sections
5. **Getting Started** — install commands and persona-labeled guide links

### Hub Pages

Collection pages use `toc: false` and a grid of content partials to link to
children. Cards sit under `##` job headings with a persona label. Partial
paths are relative to the page's directory: `agent-teams` for a sibling,
`../docs/libraries` for a cross-tree reference. See `gear/index.md` for an
example.

### Getting Started Pages

Per-persona entry points. The minimal path runs from zero to a first
meaningful result with a single product: install, configure, see output. No
exploration, no alternatives, no background theory. The page links forward to
the relevant guide for depth. 50–150 lines.

See [README.md § Getting Started Map](README.md#getting-started-map).

### Guide Pages

Guides under `docs/products/`, `docs/libraries/`, and `docs/services/` sit
under job headings on their hub page. Each job contains two guide types:

- **Big Hire** — end-to-end workflow from situation to outcome (150–400 lines).
  Directory root.
- **Little Hire** — bounded task that assumes the Big Hire is done (80–200
  lines). Nested under the Big Hire directory.

A job may own several Big Hire trees. When jobs merge, the trees stay put.
Slugs are published URLs in shipped CLI `documentation` arrays and skill packs
(products/CLAUDE.md § Linking rule). You can retitle pages. Never move them
without redirects.

Frame every guide around the reader's progress. Do not frame it around product
features. See [README.md § Guide Map](README.md#guide-map).

## Design Assets

A pre-build hook copies sources from `design/fit/` into `websites/fit/assets/`.
Asset paths in pages are absolute (`/assets/scene-guide.svg`).

- `design/fit/index.md` — palette, typography, CSS tokens
- `design/fit/scenes.md` — product scene illustrations
- `design/fit/icons.md` — product icon system

## Publishing Pipeline

Live sites share the same deployment pattern. Workflows in
`.github/workflows/`:

| Workflow              | Artifact       | Pages repo                   |
| --------------------- | -------------- | ---------------------------- |
| `website-fit.yaml`    | `fit-pages`    | `forwardimpact/fit-pages`    |
| `website-kata.yaml`   | `kata-pages`   | `forwardimpact/kata-pages`   |
| `website-jidoka.yaml` | `jidoka-pages` | `forwardimpact/jidoka-pages` |

The Monorepo site is built but not yet published.

A push to `main` (path-filtered) triggers: build with `fit-doc`, upload
artifact, dispatch to the pages repo through a GitHub App token. The pages repo
deploys to GitHub Pages.

The FIT workflow also copies schemas (JSON from `libraries/libskill/schema/`,
RDF from `products/map/schema/`) into `dist/schema/` and publishes them at
`/schema/json/` and `/schema/rdf/`.
