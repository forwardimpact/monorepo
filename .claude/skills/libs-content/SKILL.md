---
name: libs-web-presentation
description: >
  Web presentation and content rendering. libui provides DOM helpers, reactive
  state, and routing for web apps. libformat converts markdown to HTML or ANSI.
  libweb provides auth, CORS, and validation middleware for Hono. libdoc builds
  static documentation sites. libtemplate loads Mustache templates. Use when
  building web interfaces, rendering content, or serving documentation.
---

# Web Presentation

## When to Use

- Building interactive web app pages with DOM helpers and routing
- Rendering markdown content as HTML or ANSI terminal output
- Adding JWT auth, CORS, or input validation middleware to Hono apps
- Building static documentation sites from markdown folders
- Loading and rendering Mustache templates

## Libraries

| Library     | Main API                                                   | Purpose                                             |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------- |
| libui       | `createElement`, `createRouter`, `createStore`             | Functional DOM helpers, SPA routing, reactive state |
| libformat   | `HtmlFormatter`, `TerminalFormatter`                       | Markdown to HTML or ANSI conversion                 |
| libweb      | `AuthMiddleware`, `CorsMiddleware`, `ValidationMiddleware` | Security middleware for Hono                        |
| libdoc      | `DocsBuilder`, `DocsServer`, `parseFrontMatter`            | Static documentation site generation                |
| libtemplate | `TemplateLoader`, `createTemplateLoader`                   | Mustache template loading with overrides            |

## Decision Guide

- **libui vs libformat** — `libui` for interactive web apps with routing,
  reactive state, and component rendering. `libformat` for converting markdown
  content to HTML or terminal output (no interactivity).
- **libweb** — Middleware only, used in the web service (Hono framework). Not
  needed for static sites or CLI tools.
- **libdoc vs libtemplate** — `DocsBuilder` for complete documentation sites
  from markdown folders with front matter, TOC, and navigation. `TemplateLoader`
  for individual Mustache template rendering in any context (renderers, code
  generation).
- **libui is pure functions** — Functional DOM approach, no classes, no DI. This
  is intentional and exempt from OO+DI conventions.

## Composition Recipes

### Recipe 1: Web app page with routing

```javascript
import { div, h2, p, render } from "@forwardimpact/libui/render";
import { createPagesRouter } from "@forwardimpact/libui/router-pages";
import { createStore } from "@forwardimpact/libui/state";

const store = createStore({ currentPage: "home" });

createPagesRouter({
  routes: {
    "/": () => render(div({}, h2({}, "Home"), p({}, "Welcome"))),
    "/about": () => render(div({}, h2({}, "About"))),
  },
  notFound: () => render(div({}, p({}, "Not found"))),
});
```

### Recipe 2: Markdown rendering for API response

```javascript
import { createHtmlFormatter } from "@forwardimpact/libformat";

const formatter = createHtmlFormatter();
const html = formatter.format("# Hello\n\nThis is **bold** text.");
```

### Recipe 3: Documentation site build

```javascript
import { DocsBuilder } from "@forwardimpact/libdoc";

const builder = new DocsBuilder({ srcDir: "website", outDir: "public" });
await builder.build();

// CLI: bunx fit-doc build --src=website --out=dist
// CLI: bunx fit-doc build --src=website --out=dist --base-url=https://example.com
// CLI: bunx fit-doc serve --watch
```

## DI Wiring

### libui

```javascript
// Pure functions — no DI, no classes
import { div, h2, p, render, createElement } from "@forwardimpact/libui/render";
import { createStore } from "@forwardimpact/libui/state";
import { createPagesRouter } from "@forwardimpact/libui/router-pages";
import { createReactive, createComputed } from "@forwardimpact/libui/reactive";
import { loadYamlFile, loadDirIndex } from "@forwardimpact/libui/yaml-loader";
```

### libformat

```javascript
// HtmlFormatter — accepts sanitize function and Marked module
const formatter = new HtmlFormatter(sanitize, marked);

// createHtmlFormatter — factory, auto-injects production deps
const formatter = createHtmlFormatter();

// TerminalFormatter — accepts markedTerminal module
const formatter = new TerminalFormatter(markedTerminal);

// createTerminalFormatter — factory
const formatter = createTerminalFormatter();
```

### libweb

```javascript
// AuthMiddleware — factory accepts config
const auth = createAuthMiddleware(config);
app.use(auth.create());
app.use(auth.create({ optional: true }));

// ValidationMiddleware — factory, no config
const validation = createValidationMiddleware();
app.post("/path", validation.create({ required: ["field"], types: { field: "string" } }), handler);

// CorsMiddleware — factory, no config
const cors = createCorsMiddleware();
app.use(cors.create({ origin: ["https://app.example.com"] }));
```

### libdoc

```javascript
// DocsBuilder — accepts options object
const builder = new DocsBuilder({ srcDir: "website", outDir: "public" });

// parseFrontMatter — pure function
import { parseFrontMatter } from "@forwardimpact/libdoc";
const { data, content } = parseFrontMatter(markdownContent);
```

#### libdoc build outputs

`DocsBuilder.build(docsDir, distDir, baseUrl)` produces these additional outputs
beyond HTML pages:

- **`--base-url` flag / CNAME fallback** — When `baseUrl` is provided (via CLI
  flag or derived from a `CNAME` file in the source directory), libdoc generates
  `sitemap.xml`, `<link rel="canonical">` tags, and augmented `llms.txt`.
- **`sitemap.xml`** — Auto-generated from the page inventory, sorted
  alphabetically by URL path. Minimal format (no `<lastmod>` or `<priority>`).
- **Co-located `index.md` companions** — Every page gets an `index.md` alongside
  its `index.html`. Content is `# {title}` followed by the source markdown with
  links transformed from `.md` references to directory-style URLs.
- **Template variables** — `markdownUrl` (always `"index.md"`), `canonicalUrl`
  (full absolute URL when `baseUrl` is available, empty string otherwise).
- **`llms.txt` link generation** — If a curated `llms.txt` exists in the source
  root, libdoc copies it to dist then appends page links under each H2 section.
  Section mapping: product slugs → Products, `/docs/` prefix → Documentation,
  everything else → Optional.
- **Static file copying** — `#copyStaticAssets` copies root-level non-markdown,
  non-template files (e.g., `robots.txt`, `llms.txt`) to dist. Skips `.md`
  files, `index.template.html`, and `CNAME`.
- **DocsServer** — Serves `.md` files as `text/markdown` and `.xml` files as
  `application/xml`.

### libtemplate

```javascript
// TemplateLoader — accepts defaults directory path
const loader = new TemplateLoader(defaultsDir);
const rendered = loader.render(name, dataDir, variables);

// createTemplateLoader — convenience factory
const loader = createTemplateLoader(defaultsDir);
```

## Dependencies

- Use the `yaml` package (not `js-yaml`) for YAML parsing
- Use `marked` ^15.x for markdown parsing
- Run `just audit-vulnerabilities` after adding dependencies
