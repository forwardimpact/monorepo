# Plan-A Part 1 — Library Rearchitecture

## Step 1: Create `src/page-tree.js`

Extract page scanning into a standalone function.

**Created:** `libraries/libdoc/src/page-tree.js`

```js
import { urlPathFromMdFile } from "./transforms.js";

export function scanPages(pagesDir, { fs, path, matter }) → Map<urlPath, PageMeta>
```

| Field | Value |
|---|---|
| `filePath` | Relative to `pagesDir`, e.g. `docs/getting-started/index.md` |
| `urlPath` | e.g. `/docs/getting-started/` |
| `title` | From frontmatter |
| `description` | From frontmatter, default `""` |

- Walk `pagesDir` recursively; skip `assets`, `public`, `CLAUDE.md`, `SKILL.md`
  (same rules as current `#findMarkdownFiles`)
- For each `.md` file: parse frontmatter via `matter`, compute `urlPath` via
  `urlPathFromMdFile`, store entry if `title` exists
- Try/catch around `statSync` to handle unreadable entries (matches current
  `#collectMarkdownEntry` behavior)

**Verify:** Unit tests in step 9.

## Step 2: Create `src/partials.js`

Add the partials engine and default type registry.

**Created:** `libraries/libdoc/src/partials.js`

```js
import { urlPathFromMdFile } from "./transforms.js";

export const defaultRegistry = {
  card: (meta, href) =>
    `<a href="${href}">\n<h3>${meta.title}</h3>\n<p>${meta.description}</p>\n</a>`,
  link: (meta, href) =>
    `<a href="${href}">${meta.title}</a>`,
};

export function resolvePartials(markdown, pageTree, currentPageDir, registry, { path })
```

- Regex: `/<!--\s*part:(\w+):([\w./-]+)\s*-->/g`
- Path resolution per match:
  1. `resolved = path.normalize(path.join(currentPageDir, partialPath))`
  2. `urlPath = urlPathFromMdFile(resolved + "/index.md")`
  3. `meta = pageTree.get(urlPath)` — throw if missing
- Href: `path.relative(currentUrlDir, targetUrlDir)` + ensure trailing `/`
  (where `currentUrlDir` and `targetUrlDir` strip the trailing `/` before
  `path.relative`, then re-append)
- Throw `Error` on unknown type (name the type and source file)
- Throw `Error` on missing target (name the partial path and source file)

**Verify:** Unit tests in step 10.

## Step 3: Modify `src/transforms.js`

Change `buildBreadcrumbs` to read `.title` from `PageTree` entries.

**Modified:** `libraries/libdoc/src/transforms.js` (lines 91–114)

| Before | After |
|---|---|
| `@param {Map<string, string>} pageTitles` | `@param {Map<string, {title: string}>} pageTree` |
| `pageTitles.get(ancestorPath) \|\| segments[i]` | `pageTree.get(ancestorPath)?.title \|\| segments[i]` |
| `pageTitles.get(urlPath) \|\| segments[...]` | `pageTree.get(urlPath)?.title \|\| segments[...]` |

Rename the parameter from `pageTitles` to `pageTree` throughout the function.

**Verify:** Existing breadcrumb tests pass after step 11 updates.

## Step 4: Rearchitect `src/builder.js`

Rename class and wire up the new pipeline.

**Modified:** `libraries/libdoc/src/builder.js`

**Add imports:**

```js
import { scanPages } from "./page-tree.js";
import { resolvePartials, defaultRegistry } from "./partials.js";
```

**Rename throughout file:**

| Before | After |
|---|---|
| `class DocsBuilder` | `class PagesBuilder` |
| `docsDir` (all occurrences) | `pagesDir` |
| `pageTitles` (all occurrences) | `pageTree` |

**Remove methods:** `#findMarkdownFiles`, `#collectMarkdownEntry`,
`#collectPageTitles` and their JSDoc (lines 129–256).

**Modify `build()`** (currently lines 397–446):

```js
// Before (current names):
const mdFiles = this.#findMarkdownFiles(docsDir);
const pageTitles = this.#collectPageTitles(mdFiles, docsDir);
const pages = [];
for (const mdFile of mdFiles) {
  const page = await this.#renderPage(mdFile, docsDir, distDir, template, pageTitles, baseUrl);
  if (page) pages.push(page);
}
pages.sort(...);
// ... this.#generateSitemap(pages, baseUrl, distDir);
// ... this.#augmentLlmsTxt(pages, baseUrl, distDir);

// After (with rename applied):
const pageTree = scanPages(pagesDir, {
  fs: this.#fs, path: this.#path, matter: this.#matter,
});
if (pageTree.size === 0) {
  console.warn(`Warning: No Markdown files found in ${pagesDir}`);
}
for (const entry of pageTree.values()) {
  await this.#renderPage(entry.filePath, pagesDir, distDir, template, pageTree, baseUrl);
}
const sortedPages = [...pageTree.values()].sort((a, b) => a.urlPath.localeCompare(b.urlPath));
// ... this.#generateSitemap(sortedPages, baseUrl, distDir);
// ... this.#augmentLlmsTxt(sortedPages, baseUrl, distDir);
```

**Modify `#renderPage()`** (currently lines 324–356) — add partials resolution
before `this.#marked(markdown)`. Remove the `if (!frontMatter.title)` guard
(dead code — `scanPages` already filters titleless pages). Remove the return
statement (the `pages` array is gone; `#renderPage` becomes void):

```js
const pageDir = this.#path.dirname(mdFile);
const resolved = resolvePartials(
  markdown, pageTree, pageDir, defaultRegistry, { path: this.#path },
);
const rawHtml = this.#marked(resolved);
```

**Modify `#buildTemplateVars()`** — parameter `pageTitles` → `pageTree`,
passed to `buildBreadcrumbs(urlPath, pageTree)`.

**Verify:** `bunx fit-doc build --src websites/fit` succeeds.

## Step 5: Rename in `src/server.js`

**Modified:** `libraries/libdoc/src/server.js`

| Before | After |
|---|---|
| `class DocsServer` | `class PagesServer` |
| `DocsBuilder` in JSDoc | `PagesBuilder` |
| `docsDir` parameter in `watch()` | `pagesDir` |
| Logger messages referencing `docsDir` | Reference `pagesDir` |

**Verify:** Constructor validates same dependencies.

## Step 6: Update `src/index.js`

**Modified:** `libraries/libdoc/src/index.js`

```js
export { PagesBuilder } from "./builder.js";
export { PagesServer } from "./server.js";
export { parseFrontMatter } from "./frontmatter.js";
export { scanPages } from "./page-tree.js";
export { resolvePartials, defaultRegistry } from "./partials.js";
```

**Verify:** Imports resolve.

## Step 7: Update `bin/fit-doc.js`

**Modified:** `libraries/libdoc/bin/fit-doc.js`

| Line | Before | After |
|---|---|---|
| 14 | `import { DocsBuilder, DocsServer } from "../src/index.js"` | `import { PagesBuilder, PagesServer } from "../src/index.js"` |
| 79, 116 | `@param {import("../builder.js").DocsBuilder} builder` | `@param {import("../builder.js").PagesBuilder} builder` |
| 117 | `@param {import("../server.js").DocsServer} server` | `@param {import("../server.js").PagesServer} server` |
| 157 | `const docsDir = path.resolve(...)` | `const pagesDir = path.resolve(...)` |
| 161 | `const builder = new DocsBuilder(...)` | `const builder = new PagesBuilder(...)` |
| 174 | `const server = new DocsServer(...)` | `const server = new PagesServer(...)` |

All `docsDir` references in `runBuild`, `runServe`, `runPreBuildHook` →
`pagesDir`.

**Verify:** `bunx fit-doc build --help` succeeds.

## Step 8: Update `package.json`

**Modified:** `libraries/libdoc/package.json`

Add to `exports`:

```json
"./page-tree": "./src/page-tree.js",
"./partials": "./src/partials.js"
```

**Verify:** `bun run --filter @forwardimpact/libdoc test` resolves new exports.

## Step 9: Create page tree tests

**Created:** `libraries/libdoc/test/libdoc-page-tree.test.js`

| Test | Covers |
|---|---|
| Scan 3-page mock dir → map has 3 entries with correct urlPaths, titles, descriptions | SC7 |
| Pages without `title` in frontmatter are excluded from map | SC7 |
| Skips `CLAUDE.md`, `SKILL.md`, `assets/`, `public/` | Existing behavior |

Use the same mock `fs`/`path`/`matter` pattern as existing test files. Import
`scanPages` from `../src/page-tree.js`.

**Verify:** `bun test libraries/libdoc/test/libdoc-page-tree.test.js` passes.

## Step 10: Create partials tests

**Created:** `libraries/libdoc/test/libdoc-partials.test.js`

| Test | Covers |
|---|---|
| `card` partial renders `<a href="..."><h3>title</h3><p>description</p></a>` | SC1 |
| `link` partial renders `<a href="...">title</a>` | SC2 |
| Sibling path resolves: `getting-started` in `docs/` → `/docs/getting-started/` | SC3 |
| Parent path resolves: `../pathway` in `docs/products/` → `/pathway/` | SC3 |
| Unknown type throws with type name in message | SC5 |
| Missing target throws with path and source file in message | SC4 |
| Multiple partials in one page all resolve | Robustness |
| Href is relative URL between current and target pages | SC1, SC2 |

Build a mock `pageTree` map and mock `path` object with `join`, `normalize`,
`dirname`, `relative`. `path.normalize` strips `.` and resolves `..`.
`path.relative` computes relative path between URL-style dirs.

**Verify:** `bun test libraries/libdoc/test/libdoc-partials.test.js` passes.

## Step 11: Update existing test files

**Modified:** `libraries/libdoc/test/test-harness.js`,
`test/libdoc-builder.test.js`, `test/libdoc-companion.test.js`,
`test/libdoc-llms.test.js`

All four files:

| Before | After |
|---|---|
| `import { DocsBuilder } from "../src/index.js"` | `import { PagesBuilder } from "../src/index.js"` |
| `import { DocsBuilder, DocsServer } from "../src/index.js"` | `import { PagesBuilder, PagesServer } from "../src/index.js"` |
| `new DocsBuilder(...)` | `new PagesBuilder(...)` |
| `new DocsServer(...)` | `new PagesServer(...)` |
| `builder instanceof DocsBuilder` | `builder instanceof PagesBuilder` |
| `server instanceof DocsServer` | `server instanceof PagesServer` |

All four files have mock `path` objects that need `normalize` and `relative`
added — `test-harness.js`, `libdoc-companion.test.js`, `libdoc-llms.test.js`
each have inline harnesses, and `libdoc-builder.test.js` has inline `mockPath`
definitions at three test sites. Add to every `mockPath`:

```js
const mockPath = {
  join: (...parts) => parts.join("/"),
  dirname: (p) => p.split("/").slice(0, -1).join("/") || ".",
  normalize: (p) => {
    const parts = p.split("/").filter(Boolean);
    const result = [];
    for (const part of parts) {
      if (part === "..") result.pop();
      else if (part !== ".") result.push(part);
    }
    return result.join("/") || ".";
  },
  relative: (from, to) => {
    const f = from.split("/").filter(Boolean);
    const t = to.split("/").filter(Boolean);
    let i = 0;
    while (i < f.length && i < t.length && f[i] === t[i]) i++;
    const ups = f.length - i;
    return [...Array(ups).fill(".."), ...t.slice(i)].join("/") || ".";
  },
};
```

Constructor-validation tests: rename error message assertions from
`/fs is required/` etc. (unchanged strings — the constructor parameter
validation messages stay the same).

**Verify:** `bun test libraries/libdoc/` exits zero (SC9).

## Step 12: Full verification

- `bun test libraries/libdoc/` exits zero (SC9)
- `bunx fit-doc build --src websites/fit` succeeds (SC8)
- Static inspection: adding a third registry entry requires no other module
  changes (SC10)
