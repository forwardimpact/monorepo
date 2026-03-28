# 160 — SEO and LLM Agent Optimization

## Problem

The Forward Impact website (www.forwardimpact.team) has no `sitemap.xml`, no
`robots.txt`, no per-page markdown representations, and no `llms.txt` file. This
means:

1. **Search engines** cannot efficiently discover or prioritize pages. Crawlers
   rely on following links from the home page, which is slow and incomplete for
   deeper documentation pages. Without a sitemap, new or updated pages may take
   weeks to appear in search results.

2. **LLM agents** that visit the site to answer user questions must parse
   complex HTML with navigation, styling, and scripts to extract content. This
   is imprecise and wastes context window tokens on boilerplate. The llms.txt
   standard (https://llmstxt.org) exists specifically to solve this — providing
   a curated, markdown-formatted entry point that LLMs can consume directly.

3. **Per-page markdown** does not exist in the built output. When an LLM agent
   or downstream tool needs the content of a single page in clean markdown, the
   only option is to scrape and reverse-engineer the HTML. Since libdoc already
   has the markdown source, producing a `.md` companion for each HTML page is
   nearly free. The llms.txt standard proposes this convention: pages provide a
   clean markdown version alongside their HTML counterpart.

libdoc currently builds markdown to HTML and copies static assets. It has no
awareness of the full page inventory and produces no machine-readable discovery
files. The website has no manually curated LLM entry point either.

## Scope

### In scope

- **libdoc: sitemap.xml generation** — Automatically produce a `sitemap.xml` at
  the site root during `build()`, listing every HTML page with its URL.

- **libdoc: per-page markdown output** — For each HTML page produced, write a
  co-located `index.md` companion in the same directory (e.g., `about/index.md`
  alongside `about/index.html`). This avoids the `.html.md` double extension
  that causes MIME type problems on GitHub Pages and other static hosts.

- **libdoc: markdown alternate link and canonical URL in HTML** — Add a
  `<link rel="alternate" type="text/markdown">` tag to the HTML template so
  every page advertises its markdown companion in the `<head>`. Add a
  `<link rel="canonical">` tag when a base URL is available to prevent
  duplicate-content issues from trailing-slash ambiguity. Same discovery pattern
  as RSS feeds.

- **libdoc: llms.txt link generation** — At build time, libdoc reads a manually
  curated `llms.txt` from the source directory root and appends auto-generated
  link sections for all built pages. The link generation reuses the same page
  inventory used for `sitemap.xml`.

- **libdoc: static file copying** — Replace the dead `public/` directory code
  path in `#copyStaticAssets` with root-level static file copying. Non-markdown,
  non-template files in the source directory root (like `robots.txt` and
  `llms.txt`) are copied to the dist root. This aligns with the website
  convention where all content lives directly in `website/`.

- **website: llms.txt** — A manually curated file at `website/llms.txt`
  containing the H1, blockquote, prose, and H2 section headers. libdoc appends
  the page links at build time.

- **website: robots.txt** — A `website/robots.txt` that references the sitemap
  location.

- **CLI and workflow** — A `--base-url` flag for `fit-doc build` and
  corresponding updates to the GitHub Actions website workflow.

- **Skill updates** — Update the `libs-web-presentation`, `website`, and
  `update-docs` Claude skills to document the new outputs and conventions.

### Out of scope

- Open Graph / social meta tags
- JSON-LD structured data / schema.org markup
- RSS or Atom feeds
- Search indexing or full-text search
- Visual design changes to the HTML template (the `<link rel="alternate">` tag
  added by this spec is metadata only — no visible change)
- `llms-full.txt` (single concatenated file of all page content)

## Changes

### 1. libdoc: `--base-url` CLI flag and CNAME fallback

Add a `--base-url` option to `fit-doc build` in `bin/fit-doc.js` (which uses
`parseArgs` from `node:util`):

```
fit-doc build --src=website --out=dist --base-url=https://www.forwardimpact.team
```

This value is passed through to `DocsBuilder.build()` as a third parameter:
`build(docsDir, distDir, baseUrl)`. It is required for sitemap generation and
llms.txt link generation.

**CNAME fallback.** When `--base-url` is omitted, `build()` checks for a `CNAME`
file in the source directory root. If found, it reads the hostname (e.g.,
`www.forwardimpact.team`) and constructs `https://{hostname}` as the base URL.
This means sites with a `CNAME` file get sitemap and llms.txt generation
automatically without needing to pass `--base-url`. The explicit flag takes
precedence when both are present.

When neither `--base-url` nor `CNAME` is available, libdoc skips sitemap and
llms.txt link generation. Markdown companions are still produced since they
don't need an absolute URL.

### 2. libdoc: sitemap.xml generation

During `build()`, after all pages are processed, DocsBuilder produces a
`sitemap.xml` in the output root. The sitemap follows the Sitemaps protocol
(sitemaps.org):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.forwardimpact.team/</loc>
  </url>
  <url>
    <loc>https://www.forwardimpact.team/about/</loc>
  </url>
  <!-- one <url> entry per generated HTML page -->
</urlset>
```

Each generated HTML page gets a `<loc>` entry using its clean URL path
(directory-style, trailing slash). Pages are sorted alphabetically by URL path
so the output is deterministic across builds and reviewable in diffs. The page
inventory used to generate `sitemap.xml` entries is the same sorted list used
for llms.txt link generation (change 5).

No `<lastmod>`, `<changefreq>`, or `<priority>` elements — keep it minimal.
These are optional in the protocol and add maintenance burden without meaningful
benefit for a site of this size.

Static files copied from the source root (like `robots.txt`) and files copied by
post-build workflow steps (schema files, CNAME) are not included in the sitemap
— libdoc only knows about pages it builds from markdown sources.

### 3. libdoc: per-page markdown output

For each page built from a `.md` source, DocsBuilder writes a co-located
`index.md` companion in the same output directory as the `index.html` file.

Output path mapping:

| HTML output                  | Markdown output            |
| ---------------------------- | -------------------------- |
| `index.html`                 | `index.md`                 |
| `about/index.html`           | `about/index.md`           |
| `docs/map/index.html`        | `docs/map/index.md`        |
| `docs/model/core/index.html` | `docs/model/core/index.md` |

**Why co-located `index.md` instead of `.html.md`?** The llms.txt specification
suggests appending `.md` to the HTML URL (e.g., `index.html.md`), but `.html.md`
is a non-standard double extension that most static hosts (GitHub Pages,
Cloudflare Pages, Netlify) serve as `application/octet-stream` or `text/plain`
rather than `text/markdown`. Co-located `index.md` files use a standard
extension that hosts handle correctly, and the `<link rel="alternate">` tag
provides the same discovery mechanism the llms.txt convention intends.

**Title prepend.** The companion markdown prepends `# {title}` (from front
matter) as the first line, followed by a blank line, then the body. The source
markdown after front matter extraction has no title heading — it relies on the
HTML template to render the title. Without prepending, a companion file for
"About" would be an orphaned document with no heading identifying its subject.

**Link transformation.** Internal links in the markdown body must be transformed
from source-relative references (e.g., `[Core](./core.md)`) to directory-style
URLs (e.g., `[Core](core/)`), so the markdown companions work as standalone
documents that link to the live site. This requires a new markdown-specific link
transformer — the existing `#transformMarkdownLinks(html)` operates on HTML
`href` attributes (`href="./core.md"` → `href="core/"`), whereas companion files
need transformation of markdown link syntax (`[text](./core.md)` →
`[text](core/)`). The transformation rules are the same (index.md → `./`,
file.md → `file/`, dir/index.md → `dir/`), just applied to markdown link syntax
`[...](...)` instead of HTML `href="..."`.

Links use relative paths (not absolute URLs with the base-url), matching the
same convention as HTML output. This keeps companion files consistent with their
HTML counterparts and avoids coupling them to a specific domain.

### 4. libdoc: markdown alternate link and canonical URL in HTML

Add two `<link>` tags to `index.template.html`:

```html
<link rel="alternate" type="text/markdown" href="{{markdownUrl}}" />
{{#canonicalUrl}}
<link rel="canonical" href="{{canonicalUrl}}" />
{{/canonicalUrl}}
```

**Alternate link.** Same discovery pattern used for RSS/Atom feeds. An LLM agent
or tool visiting any page can find the markdown version from the HTML itself,
without needing to know the `index.md` URL convention or having seen `llms.txt`
first. The builder passes `markdownUrl` in the template context — a relative URL
pointing to the companion file in the same directory. The value is always
`index.md` (relative to the page's own directory) since every page's HTML file
is named `index.html`. Every page built from markdown has a companion file, so
no conditional guard is needed.

**Canonical link.** When `baseUrl` is available (from `--base-url` or CNAME
fallback), the builder passes `canonicalUrl` — the full absolute URL of the page
(e.g., `https://www.forwardimpact.team/about/`). This tells search engines which
URL is authoritative when the same content is reachable via multiple paths (with
or without trailing slash, with or without `index.html`). When `baseUrl` is not
available, the tag is omitted via the `{{#canonicalUrl}}` conditional.

### 5. libdoc: static file copying and llms.txt link generation

**Static file copying.** `#copyStaticAssets` currently has a dead code path that
copies files from a `public/` subdirectory — this has never been exercised
because no `public/` directory exists. Replace this with root-level static file
copying: scan the source directory root for non-markdown (`.md`), non-template
(`index.template.html`) files and copy them to the dist root. This picks up
`robots.txt`, `llms.txt`, and any future static files without requiring a
separate directory. Skip directories (already handled: `assets/` is copied
separately, subdirectories like `docs/` contain markdown content) and known
non-distributable files (`CNAME`, which is copied by the workflow).

**llms.txt link generation.** libdoc reads the manually curated `llms.txt` from
the source directory root and appends auto-generated link sections before
writing it to the output root. This combines human-authored context (project
description, section headers) with machine-generated completeness (every page
linked).

If the curated `llms.txt` does not exist in the source directory, libdoc skips
llms.txt generation entirely (even when `--base-url` is provided). This keeps
the feature opt-in per site — only sites that author a curated file get llms.txt
output.

**Build ordering.** `#copyStaticAssets` copies `llms.txt` as-is from the source
root. Since llms.txt link generation needs to augment this file, sitemap and
llms.txt generation must run **after** `#copyStaticAssets`. The plan should
confirm this ordering.

The curated file provides the H1, blockquote, prose, and H2 section headers with
descriptions for each section. libdoc appends markdown links under each H2
section based on the page inventory — the same inventory used for `sitemap.xml`.

Each link follows the llms.txt format:

```
- [Page Title](https://www.forwardimpact.team/about/index.md): Description from front matter
```

Links point to the co-located markdown companion files (not the HTML pages), so
LLMs retrieving linked content get clean markdown. The page title comes from
front matter `title`, and the description from front matter `description`. Pages
without a `description` in front matter omit the colon and description suffix.

The curated `llms.txt` in `website/` defines the section structure. For example:

```markdown
# Forward Impact

> Engineering framework platform. Define what good engineering looks like,
> generate career paths, AI agent profiles, and team capability analysis.
> Six products: Map, Pathway, Basecamp, Guide, Landmark, Summit.

Forward Impact helps engineering organizations define skills, levels, and
behaviours in a shared framework that humans and AI agents both use. The
data model is YAML-based and drives all products.

## Products

## Documentation

## Optional
```

The `## Optional` section follows the llms.txt specification convention for
content that is less important or supplementary (e.g., the about page, the home
page).

libdoc appends the relevant page links under each H2, matching pages to sections
based on their URL path structure:

- Product pages at the top level (`/map/`, `/pathway/`, `/basecamp/`, etc.) →
  **Products**
- Documentation pages (`/docs/...`) → **Documentation**
- Everything else (`/`, `/about/`) → **Optional**

The root page (`/`) and the about page are supplementary for LLM consumption —
the product and documentation pages contain the substantive content. The exact
mapping rules and any edge cases are implementation details for the plan.

### 6. website: robots.txt

A new file at `website/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://www.forwardimpact.team/sitemap.xml
```

This tells crawlers where to find the sitemap. The `Allow: /` is explicit but
redundant (default behavior) — included for clarity.

This file lives in the website root alongside other content files. The updated
`#copyStaticAssets` (change 5) copies it to the dist root automatically. The
`CNAME` file also lives at `website/CNAME` but is copied by a separate workflow
step — not by libdoc — so `#copyStaticAssets` skips it.

### 7. GitHub Actions workflow update

No workflow changes needed. The CNAME fallback (change 1) means
`npx fit-doc build --src=website --out=dist` automatically derives the base URL
from `website/CNAME`. The existing build command works as-is. The CNAME copy
step and schema file copy steps remain unchanged — those files are not part of
libdoc's page inventory and are not included in the sitemap or llms.txt.

### 8. libdoc: DocsServer content-type update

Add `md: "text/markdown"` and `xml: "application/xml"` to the content-type map
in `DocsServer.serve()` so the dev server serves markdown companions and the
sitemap with correct MIME types.

### 9. Skill updates

#### libs-web-presentation skill

Update the libdoc section to document:

- The `--base-url` CLI flag, CNAME fallback, and their effect on
  sitemap/llms.txt generation
- The `sitemap.xml` automatic generation behavior with sorted page inventory
- The co-located `index.md` companion convention for per-page markdown
- The `<link rel="alternate" type="text/markdown">` tag and `markdownUrl`
  template variable
- The `<link rel="canonical">` tag and `canonicalUrl` template variable
  (conditional on baseUrl)
- The llms.txt link generation from curated source + auto-generated links
- That `#copyStaticAssets` copies root-level non-markdown, non-template files
- That DocsServer serves `.md` files with `text/markdown` content type

#### website skill

Update to document:

- The `llms.txt` source file location (`website/llms.txt`), its purpose, and
  that it contains curated section structure with links appended at build time
- The `robots.txt` file
- The co-located `index.md` convention for per-page markdown
- That adding or removing H2 sections in `llms.txt` requires updating the
  section-to-page mapping logic in libdoc

#### update-docs skill

Add a reminder that when pages are added to or removed from the website, the
curated `llms.txt` section structure in `website/llms.txt` may need updating
(e.g., adding a new H2 section for a new product area).

## Success Criteria

1. `npx fit-doc build --src=website --out=dist --base-url=https://www.forwardimpact.team`
   produces:
   - `dist/sitemap.xml` with a `<url>` entry for every HTML page, sorted by URL
   - A co-located `index.md` alongside every `index.html` in the output
   - `dist/llms.txt` containing the curated content plus auto-generated links
   - `dist/robots.txt` copied from `website/robots.txt`

2. `dist/sitemap.xml` is valid XML conforming to the Sitemaps protocol

3. Each `index.md` output file starts with `# {title}` and contains the page
   body in clean markdown with directory-style internal links (transformed from
   source `.md` references, not raw source links)

4. Every generated HTML page contains a
   `<link rel="alternate" type="text/markdown" href="index.md">` tag in the
   `<head>` pointing to its co-located companion, and the href resolves to an
   existing file in the built output

5. Every generated HTML page contains a `<link rel="canonical">` tag when
   `baseUrl` is available, with the full absolute URL of the page

6. `dist/llms.txt` follows the llms.txt specification with an H1, blockquote,
   and H2-delimited link sections where links point to `index.md` companion
   files

7. All markdown links in `dist/llms.txt` resolve to existing files in the built
   output

8. When neither `--base-url` nor a `CNAME` file is available, libdoc still
   produces `index.md` companions and the `<link rel="alternate">` tag but skips
   `sitemap.xml` generation, `<link rel="canonical">`, and llms.txt link
   generation

8a. When `--base-url` is omitted but a `CNAME` file exists in the source
directory, libdoc derives the base URL as `https://{hostname}` and generates
sitemap, canonical tags, and llms.txt normally

9. When the curated `llms.txt` does not exist in the source directory, libdoc
   skips llms.txt generation even when `--base-url` is provided

10. The `libs-web-presentation`, `website`, and `update-docs` skills accurately
    describe the new outputs and conventions

11. Existing tests pass; new tests cover sitemap generation, markdown companion
    output (including title prepend and link transformation), alternate link
    tag, canonical link tag, page sort order, and llms.txt link appending
