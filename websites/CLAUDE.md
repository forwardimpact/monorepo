# Websites

Four sites built by `fit-doc`
([internals](fit/docs/internals/fit-doc/index.md)). Two are live; two are
built and pending a publish workflow.

| Site                       | Source                | Domain                   | Status |
| -------------------------- | --------------------- | ------------------------ | ------ |
| Forward Impact Engineering | `websites/fit/`       | `www.forwardimpact.team` | Live   |
| Kata Agent Team            | `websites/kata/`      | `www.kata.team`          | Live   |
| Co-Aligned                 | `websites/coaligned/` | `www.coaligned.team`     | Built  |
| Monorepo Structure         | `websites/monorepo/`  | `www.monorepo.team`      | Built  |

Preview locally:

```sh
bunx fit-doc serve --src=websites/fit --watch
bunx fit-doc serve --src=websites/kata --watch
bunx fit-doc serve --src=websites/coaligned --watch
bunx fit-doc serve --src=websites/monorepo --watch
```

## Page Conventions

Every page is a directory containing `index.md`. No other `.md` filenames.

- **Frontmatter** — `title` (rendered as H1) and `description` (meta) are
  required. Optional: `toc: false`, `layout: product|home`, `hero: {…}`.
- **Headings** — body headings start at `##` (the build renders H1 from
  `title`; a manual `# Title` produces a duplicate).
- **Links** — absolute directory paths (`/docs/products/agent-teams/`),
  never relative, never `index.md`. External links use full URLs.
- **Code blocks** — always specify a language tag (`sh`, `yaml`, `mermaid`).
- **Card grids use content partials.** `<!-- part:card:relative-path -->`
  markers resolve to the target page's `title` and `description` at build
  time; the build fails if the target is missing. Hand-written `<a>` cards
  are only for external links or same-page anchors.
- **Hand-written markdown links are not checked.** Only partials validate
  their targets.
- **Cross-links** — every non-hub page ends with `## What's next` using
  partials only (max six cards). When a page has `## Verify`,
  `## What's next` follows it. Card targets follow JTBD structure: Big Hire
  guides link to Little Hire children and sibling Big Hire trees; Little Hire
  guides link back to the parent Big Hire and siblings; Getting Started pages
  link to the product page and primary guide.

## Page Types

### Product Pages

Product pages (`/map/`, `/pathway/`, etc.) follow a consistent structure:

1. Frontmatter with `layout: product` and hero section (light metaphor
   reference in subtitle, then progress framing)
2. Situation paragraph — 2-3 sentences describing the moment someone realizes
   they need this product (no blockquote)
3. **What becomes possible** — organized by persona, each with a progress
   statement and concrete outputs. Canonical persona names from
   [JTBD.md](/JTBD.md): Engineering Leaders, Empowered Engineers, Platform
   Builders. Only personas with a relevant outcome for that product appear.
4. Product-specific detail sections
5. **Getting Started** — install commands and persona-labeled guide links

### Hub Pages

Collection pages use `toc: false` and a grid of content partials to link to
children. Cards are organized under `##` job headings with a persona label.
Partial paths are relative to the page's directory — `agent-teams` for a
sibling, `../docs/libraries` for a cross-tree reference. See `gear/index.md`
for an example.

### Getting Started Pages

Per-persona entry points. Minimal path from zero to first meaningful result with
a single product — install, configure, see output. No exploration, no
alternatives, no background theory. Links forward to the relevant guide for
depth. 50–150 lines.

See [README.md § Getting Started Map](README.md#getting-started-map).

### Guide Pages

Guides under `docs/products/`, `docs/libraries/`, and `docs/services/` sit
under job headings on their hub page. Each job contains two guide types:

- **Big Hire** — end-to-end workflow from situation to outcome (150–400 lines).
  Directory root.
- **Little Hire** — bounded task assuming the Big Hire is done (80–200 lines).
  Nested under the Big Hire directory.

A job may own several Big Hire trees: when jobs merge, trees stay put. Slugs
are published URLs in shipped CLI `documentation` arrays and skill packs
(products/CLAUDE.md § Linking rule) — retitle pages, never move them without
redirects.

All guides are framed around the reader's progress, not product features. See
[README.md § Guide Map](README.md#guide-map).

## Design Assets

Sources live in `design/fit/` and are copied into `websites/fit/assets/` via a
pre-build hook. Asset paths in pages are absolute (`/assets/scene-guide.svg`).

- `design/fit/index.md` — palette, typography, CSS tokens
- `design/fit/scenes.md` — product scene illustrations
- `design/fit/icons.md` — product icon system

## Publishing Pipeline

Live sites share the same deployment pattern. Workflows in
`.github/workflows/`:

| Workflow            | Artifact     | Pages repo                 |
| ------------------- | ------------ | -------------------------- |
| `website-fit.yaml`  | `fit-pages`  | `forwardimpact/fit-pages`  |
| `website-kata.yaml` | `kata-pages` | `forwardimpact/kata-pages` |

The Co-Aligned and Monorepo sites are built but do not yet have publish
workflows; they will be added when the sites are ready to ship.

Push to `main` (path-filtered) triggers: build with `fit-doc`, upload artifact,
dispatch to the pages repo via GitHub App token. The pages repo deploys to
GitHub Pages.

The FIT workflow also copies JSON and RDF schemas from `products/map/schema/`
into `dist/schema/`, published at `/schema/json/` and `/schema/rdf/`.
