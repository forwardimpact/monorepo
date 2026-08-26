# Websites

`fit-doc` builds five sites
([internals](fit/docs/libraries/every-surface/publish-docs/index.md)). Each
owns one domain, one brand stylesheet, and one publish workflow.

| Site                       | Source               | Domain                   |
| -------------------------- | -------------------- | ------------------------ |
| Forward Impact Engineering | `websites/fit/`      | `www.forwardimpact.team` |
| Gemba                      | `websites/gemba/`    | `www.gemba.team`         |
| Kata Agent Team            | `websites/kata/`     | `www.kata.team`          |
| Jidoka                     | `websites/jidoka/`   | `www.jidoka.team`        |
| Monorepo Structure         | `websites/monorepo/` | `www.monorepo.team`      |

Preview: `bunx fit-doc serve --src=websites/<site> --watch`.

## Page Conventions

Every page is a directory containing `index.md`. No other `.md` filenames.

- **Frontmatter** — `title` (rendered as H1) and `description` (meta) are
  required. Optional: `toc: false`, `layout: product|home`, `hero: {…}`.
  `redirect: <absolute URL>` makes the page a forwarding stub, kept out of
  `sitemap.xml`, `llms.txt`, and every partial target. Quote any value that
  holds a colon, or the front matter fails to parse and the build stops.
- **Headings** — body headings start at `##`. The build renders H1 from
  `title`. A manual `# Title` produces a duplicate.
- **Links** — absolute directory paths (`/docs/products/agent-teams/`),
  never relative, never `index.md`. External links use full URLs.
- **Code blocks** — always specify a language tag (`sh`, `yaml`, `mermaid`).
- **Card grids use content partials.** `<!-- part:card:relative-path -->`
  resolves the target's `title` and `description` at build time. A missing
  target fails the build. A partial resolves inside one site tree only, so
  point at another site with a hand-written link and a full URL. A
  hand-written `<a>` card is only for an external link or a same-page anchor.
- **Nothing checks hand-written markdown links.** Only partials validate.
- **Some pages are enumeration consumers.** `enumeration-drift.topics.yml`
  names them. Moving one breaks `jidoka invariants` until the same commit
  edits that registry. Re-seed a fence with
  `bunx jidoka invariants --seed enumeration-drift`.
- **Cross-links** — every non-hub page ends with `## What's next`, partials
  only, max six cards, after `## Verify` where one exists. A Big Hire links
  to its children and sibling Big Hire trees. A Little Hire links back to its
  parent and siblings. A Getting Started page links to the primary guide.

## Page Types

The docs tier differs per site. FIT splits `docs/` into `products/`,
`libraries/`, `services/`, `reference/`, `internals/`, and
`getting-started/`. Gemba, Kata, and Jidoka are single-product sites and use
a flat `docs/<task-slug>/` tree plus `docs/getting-started/`.

### Product Pages

Only FIT has them. Frontmatter carries `layout: product` and a hero. The body
runs a situation paragraph, then **What becomes possible** grouped by the
[JTBD.md](/JTBD.md) persona names, then product sections, then
**Getting Started**. See `map/index.md`. A single-product site carries this
job on its `layout: home` page instead.

### Hub Pages

Use `toc: false` and a grid of partials under `##` job headings with a
persona label. See `gear/index.md`.

### Getting Started Pages

The minimal path from zero to a first result: install, configure, see output.
No alternatives and no theory. 50-150 lines. See
[README.md § Getting Started Map](README.md#getting-started-map).

### Guide Pages

Every guide sits under a job heading on its hub page. Each job holds two
guide types, and this nesting is the same on all five sites:

- **Big Hire** — end-to-end workflow, situation to outcome, 150-400 lines.
  Directory root.
- **Little Hire** — bounded task that assumes the Big Hire is done, 80-200
  lines. Nested under the Big Hire directory.

A job may own several Big Hire trees. Slugs are published URLs in shipped CLI
`documentation` arrays and skill packs (products/CLAUDE.md § Linking rule).
Retitling is safe. Never move a page without leaving a `redirect` stub.

Frame every guide around the reader's progress, never around features. See
[README.md § Guide Map](README.md#guide-map).

## Design Assets

`fit-doc` runs the site `justfile` as a pre-build hook. Its `build` recipe
copies `base.css`, `layout.css`, `components.css`, and `main.js` from
`design/assets/` into `websites/<site>/assets/`. FIT also copies its
illustrations from `design/fit/assets/`. `.gitignore` excludes those four
filenames and every `websites/**/*.svg`. Asset paths in pages are absolute.

`websites/<site>/assets/main.css` is the one tracked asset per site and the
only one you edit in a site tree. It holds that brand's tokens, fonts, and
surfaces. `design/index.md` holds the shared language and lists every brand.
FIT alone ships illustrations. The others inline their SVG.

## Publishing Pipeline

`.github/workflows/website.yml` is one reusable publisher. A caller passes
`site` and everything else derives from it. Each caller is
`website-<site>.yaml`, uploads `<site>-pages`, and dispatches to
`forwardimpact/<site>-pages`, which deploys to GitHub Pages.

Every caller filters on `websites/<site>/**`, `design/assets/**`, and
`libraries/libdoc/**`. A site with a brand directory adds
`design/<brand>/**`. Add that line with the directory, or a brand change
rebuilds nothing.

FIT also passes `copy-schema: true`, which puts the libskill JSON and map RDF
schemas at `/schema/json/` and `/schema/rdf/`.
