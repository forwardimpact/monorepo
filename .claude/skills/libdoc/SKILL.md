---
name: libdoc
description:
  "Documentation build and serve tools. Use when building static sites from
  Markdown, serving docs locally, or parsing YAML front matter."
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

| Variable                                | Description                                   |
| --------------------------------------- | --------------------------------------------- |
| `{{title}}`                             | Page title from front matter                  |
| `{{{content}}}`                         | Rendered HTML content (triple braces for raw) |
| `{{#hasToc}}`                           | Conditional: true if `toc` is not `false`     |
| `{{{toc}}}`                             | Generated table of contents HTML              |
| `{{#description}}` / `{{/description}}` | Conditional description block                 |

```html
<!DOCTYPE html>
<html>
  <head>
    <title>{{title}}</title>
  </head>
  <body>
    <h1>{{title}}</h1>
    {{#hasToc}}
    <nav>{{{toc}}}</nav>
    {{/hasToc}} {{{content}}}
  </body>
</html>
```

### 2. Markdown Files with Front Matter

Each `.md` file needs YAML front matter:

```yaml
---
title: Page Title
description: Optional page description
toc: true # Set to false to hide table of contents
---
Your markdown content here...
```

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
