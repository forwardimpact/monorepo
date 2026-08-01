---
name: fit-doc
description: >
  Ship a documentation site that agents and humans can both navigate.
  Use when you build a static site from markdown, when you preview with
  live reload, or when you configure front matter, templates, llms.txt
  augmentation, content partials, or the pre-build hook.
---

# fit-doc

`fit-doc` is a static site generator. It turns a directory of markdown files
into a complete website. The website has directory-style URLs, a table of
contents, breadcrumbs, and auto-generated metadata files.

```sh
npx fit-doc build --src=docs --out=dist                  # production build
npx fit-doc serve --src=docs --watch --port=3000         # dev server with live reload
```

## Commands

### `fit-doc build`

`fit-doc build` renders all markdown files into HTML. It copies static assets
to the output directory.

| Flag          | Default  | Description                                         |
| ------------- | -------- | --------------------------------------------------- |
| `--src <dir>` | `public` | Source directory with markdown and assets           |
| `--out <dir>` | `dist`   | Output directory                                    |
| `--base-url`  | _(none)_ | Base URL for sitemap, canonical links, and llms.txt |

If you omit `--base-url`, `fit-doc` looks for a `CNAME` file in the source
directory. It derives the base URL from that file (`https://{cname}/`).

### `fit-doc serve`

`fit-doc serve` builds the site. It then starts a local HTTP server. It can
also watch for changes and rebuild automatically.

| Flag          | Default  | Description                   |
| ------------- | -------- | ----------------------------- |
| `--src <dir>` | `public` | Source directory              |
| `--port <n>`  | `3000`   | Port to serve on              |
| `--watch`     | off      | Watch for changes and rebuild |
| `--base-url`  | _(none)_ | Same as build                 |

## Source Directory Layout

A `fit-doc` site needs at minimum an `index.template.html` and one `.md` file.

| File / Directory      | Required | Purpose                                          |
| --------------------- | -------- | ------------------------------------------------ |
| `index.template.html` | yes      | Mustache template applied to every page          |
| `*.md`                | yes      | Pages with YAML front matter                     |
| `CNAME`               | no       | Custom domain that also gives the base URL       |
| `assets/`             | no       | Static files copied verbatim to output           |
| `justfile`            | no       | Pre-build hook (runs `just build` before render) |
| `llms.txt`            | no       | Curated LLM index, auto-augmented at build time  |
| `robots.txt`          | no       | Copied verbatim to output                        |

`fit-doc` excludes files and directories named `CLAUDE.md`, `SKILL.md`, and
`assets/` from page rendering.

## Front Matter

```yaml
---
title: Page Title            # required — <title> and template {{title}}
description: Short summary   # optional — <meta name="description">
layout: home                 # optional — class="layout-{value}" on <main>
toc: false                   # optional — disable auto-generated TOC (default: true)
hero:                        # optional — hero section variables
  image: /assets/scene.svg
  alt: Alt text
  title: Display title       # supports HTML via {{{heroTitle}}}
  subtitle: Subtitle text
  cta:
    - label: Button text
      href: /path/
    - label: Secondary
      href: /other/
      secondary: true        # adds secondary button class
---
```

## Template Variables

The Mustache template receives these variables for each page:

| Variable                                            | Type    | Description                                           |
| --------------------------------------------------- | ------- | ----------------------------------------------------- |
| `title`                                             | string  | From front matter                                     |
| `description`                                       | string  | From front matter                                     |
| `content`                                           | HTML    | Rendered markdown (use triple-stache `{{{content}}}`) |
| `layout`                                            | string  | Layout name from front matter                         |
| `hasToc`                                            | boolean | False when `toc: false` in front matter               |
| `toc`                                               | HTML    | Auto-generated from h2 headings                       |
| `hasBreadcrumbs`                                    | boolean | True for pages 2+ levels deep                         |
| `breadcrumbs`                                       | HTML    | Navigation breadcrumbs                                |
| `markdownUrl`                                       | string  | Always `"index.md"` (companion file)                  |
| `canonicalUrl`                                      | string  | Full URL when base URL is available                   |
| `hasHero`                                           | boolean | True when hero front matter is present                |
| `heroImage`, `heroAlt`, `heroTitle`, `heroSubtitle` | string  | Hero fields                                           |
| `heroCta`                                           | array   | CTA buttons with `label`, `href`, `btnClass`          |

## Auto-Generated Outputs

### Directory-style URLs

Markdown files become directories with `index.html`:

| Source           | Output URL     |
| ---------------- | -------------- |
| `index.md`       | `/`            |
| `about/index.md` | `/about/`      |
| `docs/guide.md`  | `/docs/guide/` |

### Companion markdown files

Every HTML page gets a co-located `index.md` with the rendered markdown content.
Pages include `<link rel="alternate" type="text/markdown" href="index.md">`.

### Link rewrites

`fit-doc` rewrites links to `.md` files in markdown source to directory-style
URLs: `[link](../other.md)` → `href="../other/"`, `[link](dir/index.md)` →
`href="dir/"`.

### `sitemap.xml`

`fit-doc` generates this file when a base URL is available. It lists all pages
sorted by URL path.

### `llms.txt` augmentation

If a curated `llms.txt` exists in the source directory, `fit-doc` copies it to
the output. It then appends markdown links under each H2 section. `fit-doc`
classifies pages by URL prefix:

- Product slugs (top-level pages) → `## Products`
- `/docs/` prefix → `## Documentation`
- Everything else → `## Optional`

To add a custom section, edit `llms.txt`. Then update the mapping in
`libraries/libdoc/src/builder.js` (`#augmentLlmsTxt`).

### Table of contents

`fit-doc` generates the table of contents from h2 headings into a
`<nav class="toc-nav">`. To disable it for one page, set `toc: false` in front
matter.

### Breadcrumbs

`fit-doc` generates breadcrumbs for pages two or more levels deep. It collects
the titles from the front matter of all pages.

## Content Partials

Markers like `<!-- part:card:path -->` pull the target page's front matter
`title` and `description` at build time. The build replaces the marker with
HTML.

| Type   | Output |
| ------ | ------ |
| `card` | `<a href="…"><h3>title</h3><p>description</p></a>` |
| `link` | `<a href="…">title</a>` |

`<path>` resolves relative to the current page's directory (`../sibling`
works). The build fails if the target page does not exist or the type is
unregistered. To add a type, add an entry to `defaultRegistry` in
`libraries/libdoc/src/partials.js`.

## Pre-Build Hook

When a `justfile` exists in the source directory with a `build` recipe,
`fit-doc` runs `just build` before it renders the pages. This lets sites
generate or copy assets as part of the build pipeline. If `just` is not
installed, the hook logs a warning and continues.

## Documentation

- [Publish a Documentation Site](https://www.forwardimpact.team/docs/libraries/every-surface/publish-docs/index.md)
  — Turn a directory of markdown into a static site agents and humans can both
  navigate, with a companion markdown file for every page.
