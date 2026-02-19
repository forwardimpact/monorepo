---
name: libdoc
description: Documentation build and serve tools. Use when building static sites from Markdown, serving docs locally, or parsing YAML front matter.
---

# libdoc Skill

## When to Use

- Building static documentation sites from markdown
- Serving documentation locally during development
- Parsing YAML front matter from markdown files
- Generating HTML from markdown with templates

## Key Concepts

**DocsBuilder**: Processes markdown files with front matter, applies Mustache
templates, and outputs static HTML.

**DocsServer**: Local development server with live reload for documentation
preview.

**parseFrontMatter**: Extracts YAML metadata from markdown file headers.

## Usage Patterns

### Pattern 1: Build documentation

```javascript
import { DocsBuilder } from "@forwardimpact/libdoc";

const builder = new DocsBuilder({
  srcDir: "docs",
  outDir: "public",
});
await builder.build();
```

### Pattern 2: Parse front matter

```javascript
import { parseFrontMatter } from "@forwardimpact/libdoc";

const { data, content } = parseFrontMatter(markdownContent);
console.log(data.title); // From YAML header
```

## Integration

Used to build the Forward Impact documentation site. Output served via static
file hosting.

### CLI Usage

```sh
# Build documentation
npx fit-doc build --src=docs --out=dist

# Serve with live reload
npx fit-doc serve --watch
```

## Creating Templates

Documentation sites require three components in the source directory:

### 1. Template File (`index.template.html`)

Mustache template with these variables:

| Variable                                | Description                                         |
| --------------------------------------- | --------------------------------------------------- |
| `{{title}}`                             | Page title from front matter                        |
| `{{{content}}}`                         | Rendered HTML content (triple braces for raw)       |
| `{{#hasToc}}`                           | Conditional: true if `toc` is not `false`           |
| `{{{toc}}}`                             | Generated table of contents HTML                    |
| `{{#description}}` / `{{/description}}` | Conditional description block                       |
| `{{#layout}}`                           | Conditional: true if `layout` set in front matter   |
| `{{layout}}`                             | Layout name (e.g. `product`, `home`)                |
| `{{#hasHero}}`                           | Conditional: true if `hero` object in front matter  |
| `{{heroImage}}`                         | Hero image path from `hero.image`                   |
| `{{heroAlt}}`                           | Hero image alt text from `hero.alt`                 |
| `{{heroTitle}}`                         | Hero heading (defaults to `title`)                  |
| `{{heroSubtitle}}`                      | Hero subtitle from `hero.subtitle`                  |
| `{{#hasHeroCta}}`                       | Conditional: true if hero has CTA buttons           |
| `{{#heroCta}}`                          | Array of CTA items with `href`, `label`, `btnClass` || `{{#hasBreadcrumbs}}`                      | Conditional: true if page is 2+ levels deep         |
| `{{{breadcrumbs}}}`                        | Breadcrumb navigation HTML (raw)                    |
Content is always wrapped in a `<div class="page-content">` inside `<main>`.
When `layout` is set, `class="layout-{layout}"` is applied to `<main>` to
override the default styling. The default styling (no layout) matches prose
formatting: max-width 680px, top padding for header clearance.

```html
<!DOCTYPE html>
<html>
  <head>
    <title>{{title}}</title>
  </head>
  <body>
    <main{{#layout}} class="layout-{{layout}}"{{/layout}}>
      {{#hasHero}}
      <div class="hero">...</div>
      {{/hasHero}}
      <div class="page-content">{{{content}}}</div>
    </main>
  </body>
</html>
```

### 2. Markdown Files with Front Matter

Each `.md` file needs YAML front matter:

```yaml
---
title: Page Title
description: Optional page description
toc: true      # Set to false to hide table of contents
layout: product  # Optional: adds class to <main> for layout-specific styling
hero:          # Optional: renders hero section from template
  image: /assets/heros/example.svg
  alt: Hero image description
  title: Override Title   # Defaults to title
  subtitle: Hero subtitle # Defaults to description
  cta:
    - label: Primary
      href: /docs/
    - label: Secondary
      href: /github
      secondary: true
---
Your markdown content here...
```

**Layout values:**

- _(default / no layout)_ — max-width 680px, top padding for header clearance
  (technical docs, prose)
- `product` — max-width 720px, blockquotes styled as value boxes, lists get
  checkmarks (product pages)
- `home` — no max-width constraint, no top padding (full-width landing pages)

### 3. Assets Directory (Optional)

Static files in `assets/` are copied to the output directory. Typically includes
CSS and JavaScript:

```
docs/
├── index.template.html
├── assets/
│   ├── main.css
│   └── main.js
├── index.md
└── guide/
    └── index.md
```

### Output Structure

- `index.md` → `dist/index.html`
- `guide.md` → `dist/guide/index.html`
- `nested/page.md` → `dist/nested/page/index.html`
