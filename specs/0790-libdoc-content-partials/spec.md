# Spec 0790 — libdoc content partials and builder rearchitecture

## Problem

The fit website's hub pages contain hand-written card grids where each card
duplicates the target page's title and description. Eighteen hub pages use
`<div class="grid">` card grids — `docs/products/index.md` has 20 cards,
`docs/libraries/index.md` has 22, and `docs/services/index.md` has 9, with
the remainder spread across product pages, getting-started pages, and
`docs/index.md`. Across the site, over 90 card links carry hardcoded titles
and descriptions copied from their target page's frontmatter.

When a page's title or description changes, every card referencing it must be
found and updated manually. The build system has no way to detect stale card
content — the mismatch is invisible until a reader notices. This friction
discourages improving titles and descriptions because the blast radius is
unknown.

The builder (`libraries/libdoc/src/builder.js`) already does a two-pass build:
first collecting page titles for breadcrumbs, then rendering pages. Adding
partials resolution requires the second pass to look up any page's frontmatter
by path — not just its title. The current architecture intermixes file
discovery, frontmatter parsing, markdown rendering, template application, and
output writing in a single class, making this extension harder than it needs
to be.

**Persona and job:** Platform Builders — stand up typed services and shared
infrastructure. Content partials eliminate a class of manual synchronization
that scales with the number of hub pages.

## Goal

Add a content partials system to libdoc so that markdown authors write
`<!-- part:card:path -->` or `<!-- part:link:path -->` instead of manually
copying titles and descriptions. Rearchitect the builder around an upfront
site tree scan that maps every page's path and frontmatter, making partials
resolution (and future extensions) straightforward.

## Scope (in)

### 1. Site tree scan

An upfront pass that walks the docs directory and produces an in-memory map of
every page: its file path, URL path, and parsed frontmatter. This map is the
single source of truth for the build — breadcrumb title lookup, partials
resolution, sitemap generation, and llms.txt augmentation all read from it.

- Replaces the current two-step process (file discovery then title collection)
  with a single scan that collects everything needed.
- The map is built once and passed (not mutated) through the build pipeline.
- libdoc sites are small enough (tens to low hundreds of pages) that holding
  all frontmatter in memory is not a concern.

### 2. Content partials

A processing step that finds `<!-- part:type:path -->` markers in markdown
content and replaces each with HTML generated from the referenced page's
frontmatter.

- **Marker syntax.** `<!-- part:<type>:<path> -->` where `<type>` selects the
  rendering template and `<path>` is resolved relative to the current page's
  directory (the directory containing the source markdown file).
- **Path resolution.** Paths follow the same conventions as filesystem paths:
  `getting-started` resolves to a sibling directory, `../pathway` resolves to
  a parent's sibling. The resolved path must correspond to a page in the site
  tree (a directory containing `index.md`). The build fails with a clear error
  if a partial references a path that does not exist in the site tree.
- **Partial types.** The system accepts a registry of named partial types, each
  providing a function that receives the referenced page's metadata and returns
  an HTML string. Two types ship initially:

  **`card`** — renders a linked card with title and description:

  ```html
  <a href="../relative/link/">
  <h3>[title from frontmatter]</h3>
  <p>[description from frontmatter]</p>
  </a>
  ```

  **`link`** — renders an inline link with the page title as text:

  ```html
  <a href="../relative/link/">[title from frontmatter]</a>
  ```

- **Href computation.** The `href` value is a relative URL from the current
  page's URL path to the referenced page's URL path — the same kind of
  relative path a hand-written link would use.
- **Processing order.** Partial output participates in markdown rendering —
  the `card` type's `<h3>` inside an `<a>` follows the same pattern hub pages
  use today. See Notes for rationale.
- **Unknown types.** The build fails with a clear error if a partial marker
  uses an unregistered type.

### 3. Builder rearchitecture

Restructure the builder so that distinct concerns — site tree scanning,
partials resolution, markdown rendering, template application, and output
writing — live in separate modules with explicit dependencies rather than
interleaved in a single class.

- The site tree map is the shared data structure that flows through the build
  pipeline: scan produces it, partials resolution reads it, rendering reads it,
  sitemap/llms.txt generation reads it.
- New modules follow the existing dependency injection pattern.
- The public API (`build(docsDir, distDir, baseUrl)`) and CLI interface remain
  unchanged. The rearchitecture is internal.

### 4. Migration of existing hub pages

Convert the existing hand-written card grids on hub pages to use
`<!-- part:card:path -->` markers. Convert inline cross-references where
appropriate to use `<!-- part:link:path -->` markers.

- Hub pages affected: every page under `websites/fit/` that contains a
  `<div class="grid">` card grid linking to other pages within the site.
  Currently 17 pages including `docs/index.md`, `docs/products/index.md`,
  `docs/libraries/index.md`, `docs/services/index.md`,
  `docs/getting-started/index.md`, `docs/internals/index.md`,
  `docs/reference/index.md`, product pages (`map/`, `pathway/`, `guide/`,
  `landmark/`, `summit/`, `outpost/`, `gear/`), and getting-started sub-pages.
- The `<div class="grid">` wrapper and `## Job Heading` sections remain
  hand-written — only the `<a>` card content inside them is replaced by
  partials.

## Scope (out)

- Migration of `websites/fit/index.md`. The landing page is fully handcrafted
  and stays that way.
- New partial types beyond `card` and `link`. The registry design supports
  future types; this spec delivers only these two.
- Changes to the mustache template (`index.template.html`) or CSS. The partial
  output uses the same HTML structure the hub pages use today.
- Changes to the dev server (`server.js`) beyond ensuring it works with the
  rearchitected builder.
- Build-time broken link detection. Partials validate that their target exists,
  but hand-written links are not checked.
- Changes to the `fit-doc` CLI interface or its `--help` output.
- Performance optimization. The site tree scan adds one upfront pass over tens
  of files; no caching or incremental build is needed.

## Success criteria

| # | Claim | Verification |
|---|-------|--------------|
| 1 | `<!-- part:card:path -->` renders an `<a>` containing an `<h3>` with the target page's frontmatter title and a `<p>` with its description. | Write a test page with a card partial pointing to a page with known frontmatter; build; the output HTML contains the expected `<a><h3>title</h3><p>description</p></a>` structure. |
| 2 | `<!-- part:link:path -->` renders an `<a>` with the target page's frontmatter title as link text. | Write a test page with a link partial pointing to a page with known frontmatter; build; the output HTML contains `<a href="...">title</a>`. |
| 3 | Partial paths resolve relative to the source page's directory. | A partial in `docs/index.md` with path `getting-started` resolves to `docs/getting-started/index.md`. A partial with path `../pathway` resolves to `pathway/index.md`. Both verified by building and checking output. |
| 4 | The build fails with a clear error when a partial references a nonexistent page. | Add `<!-- part:card:nonexistent -->` to a page; run build; the process exits non-zero with an error message naming the partial path and the source file. |
| 5 | The build fails with a clear error when a partial uses an unknown type. | Add `<!-- part:unknown:path -->` to a page; run build; the process exits non-zero with an error message naming the unknown type. |
| 6 | Migrated hub pages produce identical HTML output. | Diff the built output of every migrated hub page before and after migration; the rendered HTML is identical (modulo whitespace normalization by prettier). |
| 7 | The site tree scan produces a map containing every page's URL path, title, and description. | Unit test: scan a test directory with 3 pages; the returned map has 3 entries with correct url paths, titles, and descriptions. |
| 8 | The builder's public API is unchanged. | `build(docsDir, distDir, baseUrl)` signature and return type are identical; `bunx fit-doc build --src websites/fit` succeeds. |
| 9 | Existing tests pass. | `bun test libraries/libdoc/` exits zero. |
| 10 | Adding a new partial type requires only adding an entry to the type registry — no changes to the partials engine or builder. | Static inspection: adding a third partial type requires one new registry entry and no other module changes. |

## Notes

### Why resolve before markdown rendering

Resolving partials in the markdown source (before `marked` processes it) means
the partial output is plain HTML that `marked` passes through unchanged. This
matches how hub pages work today — their `<a><h3>...</h3></a>` blocks inside
`<div class="grid">` are raw HTML in markdown that `marked` preserves. If
partials were resolved after rendering, the output would need to avoid
double-escaping and could not participate in markdown structures.

### Rearchitecture scope

The rearchitecture is motivated by the partials feature but scoped to make the
builder maintainable, not to redesign the entire system. The goal is fewer
concepts per module and explicit data flow — the site tree map flows from scan
to partials to render to output — not a plugin architecture or event system.
