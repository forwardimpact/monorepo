---
name: libs-content
description: >
  Use when building interactive web pages with DOM helpers, reactive state, or
  SPA routing; rendering markdown content as sanitized HTML or as ANSI terminal
  output; adding JWT auth, CORS, or input validation middleware to a Hono app;
  building a static documentation site from markdown folders; loading Mustache
  templates with defaults-plus-overrides resolution; wrapping a UI component in
  an error boundary; or converting markdown to HTML for an API response.
---

# Content

## When to Use

- Building interactive web app pages with DOM helpers and routing
- Rendering markdown content as HTML or ANSI terminal output
- Adding JWT auth, CORS, or input validation middleware to Hono apps
- Building static documentation sites from markdown folders
- Loading and rendering Mustache templates

## Libraries

| Library     | Capabilities                                                                                                               | Key Exports                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| libui       | Create DOM elements, reactive state, stores, and SPA routers; wrap components in error boundaries; render markdown to HTML | `createElement`, `createRouter`, `createPagesRouter`, `createStore`, `createReactive`, `withErrorBoundary`, `markdownToHtml`             |
| libformat   | Convert markdown to sanitized HTML or ANSI terminal output                                                                 | `HtmlFormatter`, `TerminalFormatter`, `createHtmlFormatter`, `createTerminalFormatter`                                                   |
| libweb      | Add JWT auth, CORS, or request validation middleware to a Hono application                                                 | `AuthMiddleware`, `CorsMiddleware`, `ValidationMiddleware`, `createAuthMiddleware`, `createCorsMiddleware`, `createValidationMiddleware` |
| libdoc      | Build a static documentation site with front matter, llms.txt, sitemap; serve markdown files locally                       | `DocsBuilder`, `DocsServer`, `parseFrontMatter`                                                                                          |
| libtemplate | Load Mustache templates from a package defaults directory with per-installation override support                           | `TemplateLoader`, `createTemplateLoader`                                                                                                 |

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

// TerminalFormatter — accepts Marked module and markedTerminal plugin
const formatter = new TerminalFormatter(marked, markedTerminal);

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
app.post(
  "/path",
  validation.create({ required: ["field"], types: { field: "string" } }),
  handler,
);

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

## Cross-references

- For CLI rendering helpers (tables, colorized output, help text), see
  `libs-cli-and-tooling` — `libcli` is the canonical CLI infrastructure.
- For structured logging from web apps and CLIs, see `libs-grpc-services` —
  `libtelemetry.createLogger` is the repository-wide logger.
