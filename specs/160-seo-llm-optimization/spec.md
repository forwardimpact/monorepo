# 160 — SEO and LLM Agent Optimization

## Problem

The Forward Impact website (www.forwardimpact.team) has no `sitemap.xml`, no
`robots.txt`, no per-page markdown representations, and no `llms.txt` file. This
means:

1. **Search engines** cannot efficiently discover or prioritize pages. Crawlers
   rely on following links from the home page, which is slow and incomplete for
   deeper documentation pages. Without a sitemap, new or updated pages may take
   weeks to appear in search results.

2. **LLM agents** that visit the site to answer user questions must parse complex
   HTML with navigation, styling, and scripts to extract content. This is
   imprecise and wastes context window tokens on boilerplate. The llms.txt
   standard (https://llmstxt.org) exists specifically to solve this — providing a
   curated, markdown-formatted entry point that LLMs can consume directly.

3. **Per-page markdown** does not exist in the built output. When an LLM agent
   or downstream tool needs the content of a single page in clean markdown, the
   only option is to scrape and reverse-engineer the HTML. Since libdoc already
   has the markdown source, producing a `.md` companion for each HTML page is
   nearly free. The llms.txt standard proposes exactly this convention: pages
   provide a clean markdown version at the same URL with `.md` appended.

libdoc currently builds markdown to HTML and copies static assets. It has no
awareness of the full page inventory and produces no machine-readable discovery
files. The website has no manually curated LLM entry point either.

## Scope

### In scope

- **libdoc: sitemap.xml generation** — Automatically produce a `sitemap.xml` at
  the site root during `build()`, listing every HTML page with its URL.

- **libdoc: per-page markdown output** — For each HTML page produced, write a
  companion `.md` file following the llms.txt convention: the markdown version
  lives at the HTML URL with `.md` appended (e.g., `/about/index.html.md`).

- **libdoc: llms.txt link generation** — At build time, libdoc reads a manually
  curated `llms.txt` from the source directory's `public/` folder and appends
  auto-generated link sections for all built pages. The link generation reuses
  the same page inventory used for `sitemap.xml`.

- **website: llms.txt** — A manually curated file in `website/public/llms.txt`
  containing the H1, blockquote, prose, and H2 section headers. libdoc appends
  the page links at build time.

- **website: robots.txt** — A `website/public/robots.txt` that references the
  sitemap location.

- **CLI and workflow** — A `--base-url` flag for `fit-doc build` and
  corresponding updates to the GitHub Actions website workflow.

- **Skill updates** — Update the `libs-web-presentation`, `website`, and
  `update-docs` Claude skills to document the new outputs and conventions.

### Out of scope

- Open Graph / social meta tags
- JSON-LD structured data / schema.org markup
- RSS or Atom feeds
- Search indexing or full-text search
- Changes to the HTML template or visual design
- `llms-full.txt` (single concatenated file of all page content)

## Changes

### 1. libdoc: `--base-url` CLI flag

Add a `--base-url` option to `fit-doc build` in `bin/fit-doc.js` (which uses
`parseArgs` from `node:util`):

```
fit-doc build --src=website --out=dist --base-url=https://www.forwardimpact.team
```

This value is passed through to `DocsBuilder.build()` as a third parameter:
`build(docsDir, distDir, baseUrl)`. It is required for sitemap generation and
llms.txt link generation. When omitted (or `undefined`), libdoc skips sitemap
and llms.txt link generation. Markdown companions are still produced since they
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
(directory-style, trailing slash). The page inventory used to generate
`sitemap.xml` entries is the same list used for llms.txt link generation
(change 4).

No `<lastmod>`, `<changefreq>`, or `<priority>` elements — keep it minimal.
These are optional in the protocol and add maintenance burden without meaningful
benefit for a site of this size.

Static files copied from `public/` (like `robots.txt`) and files copied by
post-build workflow steps (schema files, CNAME) are not included in the
sitemap — libdoc only knows about pages it builds from markdown sources.

### 3. libdoc: per-page markdown output

For each page built from a `.md` source, DocsBuilder writes a companion markdown
file following the llms.txt convention: the markdown version is served at the
HTML URL with `.md` appended.

Output path mapping:

| HTML output                    | Markdown output                    |
| ------------------------------ | ---------------------------------- |
| `index.html`                   | `index.html.md`                    |
| `about/index.html`             | `about/index.html.md`              |
| `docs/map/index.html`          | `docs/map/index.html.md`           |
| `docs/model/core/index.html`   | `docs/model/core/index.html.md`    |

This follows the llms.txt specification: "pages on websites that have
information that might be useful for LLMs to read provide a clean markdown
version of those pages at the same URL as the original page, but with `.md`
appended."

The markdown content is the source markdown after front matter extraction — the
same content that gets passed to the marked parser.

**Link transformation.** Internal links in the markdown body must be transformed
from source-relative references (e.g., `[Core](./core.md)`) to directory-style
URLs (e.g., `[Core](/docs/model/core/)`), so the markdown companions work as
standalone documents that link to the live site. This requires a new
markdown-specific link transformer — the existing `#transformMarkdownLinks(html)`
operates on HTML `href` attributes (`href="./core.md"` → `href="core/"`),
whereas companion files need transformation of markdown link syntax
(`[text](./core.md)` → `[text](core/)`). The transformation rules are the same
(index.md → `./`, file.md → `file/`, dir/index.md → `dir/`), just applied to
markdown link syntax `[...](...)` instead of HTML `href="..."`.

Links use relative paths (not absolute URLs with the base-url), matching the
same convention as HTML output. This keeps companion files consistent with their
HTML counterparts and avoids coupling them to a specific domain.

### 4. libdoc: llms.txt link generation

libdoc reads the manually curated `llms.txt` from the source `public/`
directory and appends auto-generated link sections before writing it to the
output root. This combines human-authored context (project description, section
headers) with machine-generated completeness (every page linked).

If the curated `llms.txt` does not exist in the source `public/` directory,
libdoc skips llms.txt generation entirely (even when `--base-url` is provided).
This keeps the feature opt-in per site — only sites that author a curated file
get llms.txt output.

**Build ordering.** Currently `#copyStaticAssets` runs at the end of `build()`
and copies all files from `public/` to the dist root. This means a raw
`llms.txt` in `public/` would be copied as-is, overwriting any augmented version
written earlier. To avoid this, sitemap generation and llms.txt link generation
must run **after** `#copyStaticAssets`, overwriting the plain copy with the
augmented version. Alternatively, `#copyStaticAssets` can skip `llms.txt` when
llms.txt generation is active. Either approach works — the plan should pick one.

The curated file provides the H1, blockquote, prose, and H2 section headers
with descriptions for each section. libdoc appends markdown links under each H2
section based on the page inventory — the same inventory used for `sitemap.xml`.

Each link follows the llms.txt format:

```
- [Page Title](https://www.forwardimpact.team/about/index.html.md): Description from front matter
```

Links point to the `.html.md` markdown companion files (not the HTML pages), so
LLMs retrieving linked content get clean markdown. The page title comes from
front matter `title`, and the description from front matter `description`. Pages
without a `description` in front matter omit the colon and description suffix.

The curated `llms.txt` in `website/public/` defines the section structure. For
example:

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
content that is less important or supplementary (e.g., the about page, the
home page).

libdoc appends the relevant page links under each H2, matching pages to sections
based on their URL path structure:

- Product pages at the top level (`/map/`, `/pathway/`, `/basecamp/`, etc.) →
  **Products**
- Documentation pages (`/docs/...`) → **Documentation**
- Everything else (`/`, `/about/`) → **Optional**

The root page (`/`) and the about page are supplementary for LLM consumption —
the product and documentation pages contain the substantive content. The exact
mapping rules and any edge cases are implementation details for the plan.

### 5. website: robots.txt

A new file at `website/public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://www.forwardimpact.team/sitemap.xml
```

This tells crawlers where to find the sitemap. The `Allow: /` is explicit but
redundant (default behavior) — included for clarity.

`#copyStaticAssets` in `build()` already copies individual files from the source
`public/` directory to the dist root, so `robots.txt` is included in builds
automatically with no code changes.

### 6. GitHub Actions workflow update

Update `.github/workflows/website.yaml` to pass `--base-url` to the build
command:

```yaml
- name: Build website
  run: npx fit-doc build --src=website --out=dist --base-url=https://www.forwardimpact.team
```

No other workflow changes needed. The CNAME copy step and schema file copy steps
remain unchanged — those files are not part of libdoc's page inventory and are
not included in the sitemap or llms.txt.

### 7. Skill updates

#### libs-web-presentation skill

Update the libdoc section to document:

- The `--base-url` CLI flag and its effect on sitemap/llms.txt generation
- The `sitemap.xml` automatic generation behavior
- The per-page `.html.md` markdown output and the llms.txt URL convention
- The llms.txt link generation from curated source + auto-generated links
- That sitemap and llms.txt link generation share the same page inventory

#### website skill

Update to document:

- The `llms.txt` source file location (`website/public/llms.txt`), its purpose,
  and that it contains curated section structure with links appended at build
  time
- The `robots.txt` file
- The `.html.md` convention for per-page markdown
- That adding or removing H2 sections in `llms.txt` requires updating the
  section-to-page mapping logic in libdoc

#### update-docs skill

Add a reminder that when pages are added to or removed from the website, the
curated `llms.txt` section structure in `website/public/llms.txt` may need
updating (e.g., adding a new H2 section for a new product area).

## Success Criteria

1. `npx fit-doc build --src=website --out=dist --base-url=https://www.forwardimpact.team`
   produces:
   - `dist/sitemap.xml` with a `<url>` entry for every HTML page
   - An `.html.md` file alongside every `.html` file in the output
   - `dist/llms.txt` containing the curated content plus auto-generated links
   - `dist/robots.txt` copied from `website/public/robots.txt`

2. `dist/sitemap.xml` is valid XML conforming to the Sitemaps protocol

3. Each `.html.md` output file contains the page body in clean markdown with
   directory-style internal links (transformed from source `.md` references, not
   raw source links)

4. `dist/llms.txt` follows the llms.txt specification with an H1, blockquote,
   and H2-delimited link sections where links point to `.html.md` files

5. All `.html.md` links in `dist/llms.txt` resolve to existing files in the
   built output

6. When `--base-url` is omitted, libdoc still produces `.html.md` files but
   skips `sitemap.xml` generation and llms.txt link generation

7. When the curated `llms.txt` does not exist in the source `public/` directory,
   libdoc skips llms.txt generation even when `--base-url` is provided

8. The `libs-web-presentation`, `website`, and `update-docs` skills accurately
   describe the new outputs and conventions

9. Existing tests pass; new tests cover sitemap generation, markdown companion
   output (including link transformation), and llms.txt link appending
