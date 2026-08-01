---
title: "Publish a Documentation Site"
description: "Turn a directory of markdown into a static site agents and humans can both navigate. You get directory-style URLs, a companion markdown file for every page, and auto-generated llms.txt, sitemap, table of contents, and breadcrumbs."
---

Documentation that only renders to HTML serves humans well and agents poorly. An
agent that fetches a page gets markup. It must strip the markup before it can
read the words. `fit-doc` builds a static site. Every HTML page ships with a
co-located `index.md` of the same content. So a human opens the page and an
agent fetches the markdown. One source serves two readers. You write plain
markdown with YAML front matter. `fit-doc` produces directory-style URLs, a
table of contents, breadcrumbs, and the metadata files that make a site
discoverable.

## Prerequisites

- Node.js 22+
- A source directory with at least an `index.template.html` and one `.md` file

`fit-doc` runs through `npx`, so there is nothing to install globally:

```sh
npx fit-doc build --src=docs --out=dist
```

## 1. Lay out the source directory

A site is a directory of markdown pages plus one Mustache template that wraps
every page. `fit-doc` requires only two files.

| File / Directory      | Required | Purpose                                          |
| --------------------- | -------- | ------------------------------------------------ |
| `index.template.html` | yes      | Mustache template applied to every page          |
| `*.md`                | yes      | Pages with YAML front matter                     |
| `assets/`             | no       | Static files copied verbatim to the output       |
| `CNAME`               | no       | Custom domain. `fit-doc` derives the base URL    |
| `llms.txt`            | no       | Curated index for agents, augmented at build     |
| `robots.txt`          | no       | Copied verbatim to the output                    |

`fit-doc` never renders files named `CLAUDE.md` and `SKILL.md` as pages. It
also never renders the `assets/` directory as pages.

## 2. Write a page

Each page is a markdown file with YAML front matter. `title` and `description`
are the two fields you will set on almost every page:

```markdown
---
title: Getting Started
description: Install the tool and run your first build.
---

## Install

Run the build command and open the output.
```

Body headings start at `##`. The `title` from front matter becomes the page's
`<h1>`. So a manual `# Heading` in the body produces a duplicate.

## 3. Wrap pages in a template

The template is plain HTML with Mustache placeholders. `fit-doc` fills it once
per page. A minimal template needs the title and the rendered content:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{{title}}</title>
    <meta name="description" content="{{description}}" />
  </head>
  <body>
    <main class="layout-{{layout}}">
      <h1>{{title}}</h1>
      {{{content}}}
    </main>
  </body>
</html>
```

Use the triple-stache `{{{content}}}`. `fit-doc` then inserts the rendered
markdown as HTML. It does not escape the markdown. The template also receives
`toc`, `breadcrumbs`, `canonicalUrl`, and the hero fields when a page declares
them in front matter.

## 4. Build the site

```sh
npx fit-doc build --src=docs --out=dist
```

`fit-doc` reports each page it writes:

```text
Building documentation...
  ✓ guide/index.html
  ✓ index.html
Documentation build complete!
```

Every markdown file becomes a directory that holds `index.html`. This gives
clean directory-style URLs:

| Source           | Output URL     |
| ---------------- | -------------- |
| `index.md`       | `/`            |
| `about/index.md` | `/about/`      |
| `docs/guide.md`  | `/docs/guide/` |

Alongside each `index.html`, `fit-doc` writes a co-located `index.md` with the
same rendered content. An agent appends `index.md` to any page URL to fetch the
markdown of that page.

`fit-doc` rewrites links between markdown files to match. A `[guide](guide.md)`
in the source becomes `href="guide/"` in the output. So you author links against
the files you can see. The build resolves them to published paths.

## 5. Preview with live reload

While you write, serve the site locally and rebuild on every change:

```sh
npx fit-doc serve --src=docs --watch --port=3000
```

The server builds once. It then watches the source directory and rebuilds when a
file changes. Drop `--watch` to serve a static build with no rebuild.

## 6. Add a base URL for discoverability

A base URL lets `fit-doc` emit absolute links in the metadata files. Pass it
explicitly. You can also drop a `CNAME` file in the source directory. `fit-doc`
then derives `https://{cname}/` from it:

```sh
npx fit-doc build --src=docs --out=dist --base-url=https://example.com
```

With a base URL available, the build adds:

- **`sitemap.xml`** — every page listed by absolute URL, sorted by path.
- **Canonical links** — each page's `canonicalUrl` template variable resolves to
  its full address.
- **`llms.txt` augmentation** — if you ship a curated `llms.txt`, `fit-doc`
  copies it to the output. It then appends a markdown link to every page,
  grouped by URL prefix. Top-level pages go under `## Products`, `/docs/` pages
  under `## Documentation`, and the rest under `## Optional`.

## Link cards between pages

A collection page can link to its children. You do not hand-write anchors. A
content-partial marker pulls the target page's `title` and `description` at
build time. The marker is an HTML comment of the form `part:TYPE:PATH`. You wrap
it in `<!--` and `-->`. `TYPE` is `card` or `link`. `PATH` is the target page's
path relative to the current page's directory.

A `card` marker can point at a sibling page named `about`. It resolves to a card
that links to `about/`. The target's title becomes the card heading. Its
description becomes the card text. A `link` marker resolves to a plain inline
anchor instead. Because the path is relative, `../sibling` reaches across the
tree. The build fails if the target page does not exist. That keeps internal
navigation honest.

## Verify

- [ ] `npx fit-doc build --src=docs --out=dist` exits zero and reports each
      page.
- [ ] `dist/index.html` exists and `dist/index.md` holds the same content.
- [ ] A `[link](other.md)` in source renders as `href="other/"` in the output.
- [ ] The `--base-url` flag produces `dist/sitemap.xml` with absolute page URLs.
- [ ] A `card` partial marker renders a card with the target page's title and
      description.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../render-templates -->

</div>
