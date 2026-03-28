# 160 — SEO and LLM Agent Optimization: Plan

## Approach

All new functionality lives in `DocsBuilder`. The `build()` method signature
gains a third parameter (`baseUrl`), and after the existing page loop + static
asset copy, a new post-build phase generates `sitemap.xml` and augments
`llms.txt`. Markdown companions, the alternate `<link>` tag, and the canonical
`<link>` tag are woven into the existing per-page loop. No new classes or files
— everything fits naturally into the builder's current structure.

**Static file convention.** Static files (`robots.txt`, `llms.txt`) live in the
website root alongside markdown content — there is no `public/` subdirectory.
The dead `public/` code path in `#copyStaticAssets` is replaced with root-level
static file copying that picks up non-markdown, non-template files
automatically.

**Ordering strategy for `llms.txt`:** Run sitemap/llms.txt generation _after_
`#copyStaticAssets`. The curated `llms.txt` gets copied to dist as a regular
static file, then the post-build phase reads it back, appends links, and
overwrites it. This keeps `#copyStaticAssets` generic.

**Deterministic output.** The page inventory is sorted alphabetically by URL
path before generating sitemap and llms.txt, so builds are reproducible and
diffs are reviewable.

## Changes

### Step 1 — CLI: add `--base-url` flag

**File:** `libraries/libdoc/bin/fit-doc.js`

Add `"base-url"` to the `parseArgs` options:

```javascript
"base-url": { type: "string" },
```

Pass it through to `build()`:

```javascript
// In runBuild (line ~50)
async function runBuild(builder, docsDir, distDir, baseUrl) {
  // ...
  await builder.build(docsDir, distDir, baseUrl);
}
```

Update the call sites in the main function to extract `values["base-url"]` and
pass it to `runBuild` and `runServe`. Update the usage string to document the
new flag.

**Verify:** `npx fit-doc build --help` shows `--base-url`.

---

### Step 2 — `build()` signature, CNAME fallback, and page inventory

**File:** `libraries/libdoc/builder.js`

**2a.** Change `build(docsDir, distDir)` to `build(docsDir, distDir, baseUrl)`.

**2b.** At the top of `build()`, after the initial setup, resolve the effective
base URL. If `baseUrl` is not provided, check for a `CNAME` file in the source
directory and derive the URL from it:

```javascript
// Resolve base URL: explicit flag > CNAME fallback > undefined
if (!baseUrl) {
  const cnamePath = this.#path.join(docsDir, "CNAME");
  if (this.#fs.existsSync(cnamePath)) {
    const hostname = this.#fs.readFileSync(cnamePath, "utf-8").trim();
    baseUrl = `https://${hostname}`;
  }
}
```

This means `npx fit-doc build --src=website --out=dist` automatically picks up
`website/CNAME` (`www.forwardimpact.team`) and generates sitemap/llms.txt
without needing `--base-url`. The explicit flag takes precedence when both
exist.

**2c.** Collect a page inventory during the per-page loop. After front matter
parsing (line ~269), push each page's metadata into an array:

```javascript
// Before the loop (after pageTitles pass)
const pages = [];

// Inside the loop, after frontMatter.title check
pages.push({
  mdFile,
  urlPath,         // from #urlPathFromMdFile
  title: frontMatter.title,
  description: frontMatter.description || "",
});
```

**2d.** After the loop, sort the page inventory by URL path for deterministic
output:

```javascript
pages.sort((a, b) => a.urlPath.localeCompare(b.urlPath));
```

This array drives sitemap and llms.txt generation in step 6.

**Verify:** No behaviour change yet — build output is identical.

---

### Step 3 — Per-page markdown companion output

**File:** `libraries/libdoc/builder.js`

**3a.** Add a new private method `#transformMarkdownBodyLinks(markdown)` that
transforms markdown-syntax links (`[text](path.md)`) using the same rules as
`#transformMarkdownLinks` but operating on `[...](...)` patterns instead of
`href="..."`:

```javascript
#transformMarkdownBodyLinks(markdown) {
  return markdown.replace(
    /\[([^\]]*)\]\(([^)]*?)\.md(#[^)]*)?\)/g,
    (_match, text, path, hash) => {
      const fragment = hash || "";
      if (path === "index" || path === "./index") {
        return `[${text}](./${fragment})`;
      }
      if (path.endsWith("/index")) {
        return `[${text}](${path.slice(0, -5)}${fragment})`;
      }
      return `[${text}](${path}/${fragment})`;
    },
  );
}
```

**3b.** Inside the per-page loop, after writing the HTML file (line ~362), write
the co-located markdown companion:

```javascript
// Write markdown companion (index.md alongside index.html)
const companionContent = `# ${frontMatter.title}\n\n${this.#transformMarkdownBodyLinks(markdown)}`;
const companionPath = this.#path.join(distDir, outputPath + ".md");
this.#fs.writeFileSync(companionPath, companionContent, "utf-8");
```

The `outputPath` variable already holds the path without extension (e.g.,
`index`, `about/index`, `docs/map/index`). Appending `.md` produces `index.md`,
`about/index.md`, etc. — co-located with the `.html` file.

The content prepends `# {title}` from front matter as the first line. The source
markdown after front matter extraction has no title heading — it relies on the
HTML template to render the title. Without prepending, a companion for "About"
would be an orphaned document with no heading.

**Verify:** Every `index.html` in dist has a sibling `index.md`.

---

### Step 4 — Alternate `<link>` tag, canonical `<link>` tag

**File:** `website/index.template.html`

Add after the stylesheet `<link>` (line 11):

```html
<link rel="alternate" type="text/markdown" href="{{markdownUrl}}" />
{{#canonicalUrl}}
<link rel="canonical" href="{{canonicalUrl}}" />
{{/canonicalUrl}}
```

**File:** `libraries/libdoc/builder.js`

In the template context object (line ~296), add both variables:

```javascript
markdownUrl: "index.md",
canonicalUrl: baseUrl ? baseUrl + urlPath : "",
```

`markdownUrl` is always `index.md` because every page's HTML file is named
`index.html` (either directly for index pages, or inside a subdirectory for
non-index pages). The relative href from the page's own directory is always the
same.

`canonicalUrl` is the full absolute URL (e.g.,
`https://www.forwardimpact.team/about/`) when `baseUrl` is available. This tells
search engines which URL is authoritative when the same content is reachable via
multiple paths (with or without trailing slash, with or without `index.html`).
When `baseUrl` is not available, the value is empty and the `{{#canonicalUrl}}`
conditional omits the tag entirely.

**Verify:** Every built HTML page has the `<link rel="alternate">` tag. Pages
built with a `baseUrl` also have `<link rel="canonical">`.

---

### Step 5 — Refactor `#copyStaticAssets` and add static files

**File:** `libraries/libdoc/builder.js`

**5a.** Replace the dead `public/` code path in `#copyStaticAssets` (lines
136–150) with root-level static file copying. After copying `assets/`, scan the
source directory root for files that are not markdown (`.md`), not the template
(`index.template.html`), and not workflow-managed (`CNAME`), and copy them to
the dist root:

```javascript
#copyStaticAssets(docsDir, distDir) {
  // Copy assets directory (CSS, JS, images)
  if (
    this.#copyDir(
      this.#path.join(docsDir, "assets"),
      this.#path.join(distDir, "assets"),
    )
  ) {
    console.log("  ✓ assets/");
  }

  // Copy root-level static files (robots.txt, llms.txt, etc.)
  const skipFiles = new Set(["index.template.html", "CNAME"]);
  this.#fs
    .readdirSync(docsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.endsWith(".md") &&
        !skipFiles.has(entry.name),
    )
    .forEach((entry) => {
      this.#fs.copyFileSync(
        this.#path.join(docsDir, entry.name),
        this.#path.join(distDir, entry.name),
      );
      console.log(`  ✓ ${entry.name}`);
    });
}
```

This replaces the `public/` directory scanning with root-level file scanning.
The skip list excludes files that are either processed by the builder (`.md`
files, template) or managed by external workflow steps (`CNAME`).

**5b.** Create the static files in the website root.

**File:** `website/robots.txt` (new)

```
User-agent: *
Allow: /

Sitemap: https://www.forwardimpact.team/sitemap.xml
```

**File:** `website/llms.txt` (new)

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

**Verify:** `dist/robots.txt` and `dist/llms.txt` exist after build. No
`public/` directory involved.

---

### Step 6 — Post-build: sitemap.xml and llms.txt link generation

**File:** `libraries/libdoc/builder.js`

**6a.** Add private method `#generateSitemap(pages, baseUrl, distDir)`:

```javascript
#generateSitemap(pages, baseUrl, distDir) {
  const urls = pages
    .map((p) => `  <url>\n    <loc>${baseUrl}${p.urlPath}</loc>\n  </url>`)
    .join("\n");
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
  this.#fs.writeFileSync(this.#path.join(distDir, "sitemap.xml"), xml, "utf-8");
  console.log("  ✓ sitemap.xml");
}
```

Pages are already sorted by `urlPath` (step 2d), so sitemap entries appear in a
stable, deterministic order.

**6b.** Add private method `#augmentLlmsTxt(pages, baseUrl, distDir)`:

Reads `dist/llms.txt` (already copied by `#copyStaticAssets` from the source
root). If it doesn't exist, returns early. Parses the file to find H2 section
headers. Classifies each page into a section based on URL path:

- Top-level product pages (`/map/`, `/pathway/`, `/basecamp/`, `/guide/`,
  `/landmark/`, `/summit/`) → **Products**
- Pages under `/docs/` → **Documentation**
- Everything else (`/`, `/about/`) → **Optional**

For each H2 section, appends page links in llms.txt format:

```
- [Page Title](https://www.forwardimpact.team/about/index.md): Description
```

The link URL uses `baseUrl` + `urlPath` + `index.md`. For the root page (`/`),
the URL is `baseUrl` + `/index.md`. Pages without a description omit the colon
and description.

```javascript
#augmentLlmsTxt(pages, baseUrl, distDir) {
  const llmsPath = this.#path.join(distDir, "llms.txt");
  if (!this.#fs.existsSync(llmsPath)) return;

  const content = this.#fs.readFileSync(llmsPath, "utf-8");
  const lines = content.split("\n");

  // Map pages to sections
  const sections = { Products: [], Documentation: [], Optional: [] };
  const productSlugs = new Set([
    "map", "pathway", "basecamp", "guide", "landmark", "summit",
  ]);

  for (const page of pages) {
    const topSegment = page.urlPath.split("/").filter(Boolean)[0];
    if (page.urlPath.startsWith("/docs/")) {
      sections.Documentation.push(page);
    } else if (topSegment && productSlugs.has(topSegment)) {
      sections.Products.push(page);
    } else {
      sections.Optional.push(page);
    }
  }

  // Build link line for a page
  const linkLine = (page) => {
    const mdUrl = page.urlPath === "/"
      ? `${baseUrl}/index.md`
      : `${baseUrl}${page.urlPath}index.md`;
    const desc = page.description ? `: ${page.description}` : "";
    return `- [${page.title}](${mdUrl})${desc}`;
  };

  // Reassemble: insert links after each H2
  const output = [];
  for (const line of lines) {
    output.push(line);
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      const sectionName = h2Match[1].trim();
      const pageList = sections[sectionName];
      if (pageList?.length) {
        output.push("");
        for (const page of pageList) {
          output.push(linkLine(page));
        }
      }
    }
  }

  this.#fs.writeFileSync(llmsPath, output.join("\n"), "utf-8");
  console.log("  ✓ llms.txt (augmented)");
}
```

Pages within each section are already sorted by `urlPath` (step 2d).

**6c.** In `build()`, after `#copyStaticAssets` (line 366) and before the
"complete" log:

```javascript
if (baseUrl) {
  this.#generateSitemap(pages, baseUrl, distDir);
  this.#augmentLlmsTxt(pages, baseUrl, distDir);
}
```

**Verify:**

- `dist/sitemap.xml` has one `<url>` per page, sorted by URL.
- `dist/llms.txt` has curated content + page links under each H2.
- Without `--base-url` or CNAME, neither file is generated/augmented.

---

### Step 7 — DocsServer content-type update

**File:** `libraries/libdoc/server.js`

Add `md` and `xml` to the `contentTypes` map in `serve()` (line ~130):

```javascript
const contentTypes = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  json: "application/json",
  md: "text/markdown",
  xml: "application/xml",
  png: "image/png",
  // ... rest unchanged
};
```

This ensures the dev server serves markdown companions with `text/markdown` and
sitemap with `application/xml`. Without this, both fall through to `text/plain`.

**Note on production:** GitHub Pages does not support custom MIME type
configuration. `.md` files are typically served as `text/plain`, which is
acceptable for LLM consumption but not ideal. This is a hosting limitation, not
something libdoc can fix. The `<link rel="alternate">` tag provides the semantic
signal that the content is markdown regardless of the served MIME type.

**Verify:** `npx fit-doc serve` returns `Content-Type: text/markdown` for
`/about/index.md`.

---

### Step 8 — GitHub Actions workflow update

No workflow changes needed. The CNAME fallback (step 2b) means the existing
build command `npx fit-doc build --src=website --out=dist` automatically derives
the base URL from `website/CNAME`. The CNAME copy step and schema file copy
steps remain unchanged.

---

### Step 9 — Tests

**File:** `libraries/libdoc/test/libdoc.test.js`

Add test cases for:

1. **Markdown companion output** — Build produces `index.md` alongside each
   `index.html`. Verify content starts with `# {title}` followed by the
   post-front-matter markdown.

2. **Markdown body link transformation** — Source link `[Core](./core.md)` →
   `[Core](core/)` in companion. Test all transformation rules: index.md,
   file.md, dir/index.md, with hash fragments.

3. **Alternate link tag** — Built HTML contains
   `<link rel="alternate" type="text/markdown" href="index.md" />`.

4. **Canonical link tag** — When `baseUrl` is provided, built HTML contains
   `<link rel="canonical" href="{baseUrl}{urlPath}" />`. When `baseUrl` is
   absent, no canonical tag is present.

5. **Sitemap generation** — When `baseUrl` is provided, `sitemap.xml` is written
   with correct `<url>` entries sorted by URL path. When omitted, no
   `sitemap.xml`.

6. **Page sort order** — Verify sitemap and llms.txt entries appear in
   alphabetical URL path order regardless of file discovery order.

7. **llms.txt augmentation** — When `baseUrl` is provided and curated `llms.txt`
   exists in the source root, the output `llms.txt` contains curated content
   plus auto-generated links under each H2. Verify section classification
   (product pages → Products, docs → Documentation, others → Optional). Verify
   links point to `index.md` companion files.

8. **llms.txt skipped when no curated file** — When no `llms.txt` in source
   root, no `llms.txt` in output even with `baseUrl`.

9. **No baseUrl, no CNAME** — Markdown companions and alternate link still
   produced; sitemap, canonical tags, and llms.txt augmentation skipped.

9a. **CNAME fallback** — When `baseUrl` is omitted but a `CNAME` file exists in
the source directory, `build()` derives `https://{hostname}` and generates
sitemap/llms.txt/canonical. Verify the explicit `--base-url` flag takes
precedence over CNAME when both are present.

10. **Static file copying** — Non-markdown, non-template root files (e.g.
    `robots.txt`) are copied to dist. `.md` files, `index.template.html`, and
    `CNAME` are not copied as static files.

All tests use the existing mock pattern (Maps for files, Sets for directories).
Extend the mock `fs` to track `writeFileSync` calls and `existsSync` checks for
the new output files.

---

### Step 10 — Skill updates

**File:** `.claude/skills/libs-web-presentation/SKILL.md`

The libdoc row in the **Libraries** table (line 28) is fine as-is. Add a new
section after the existing **DI Wiring > libdoc** block (line ~141), before
**libtemplate**:

```markdown
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
```

Also update **Recipe 3** (line ~74) to show the `baseUrl` parameter:

```javascript
// CLI: npx fit-doc build --src=website --out=dist
// CLI: npx fit-doc build --src=website --out=dist --base-url=https://example.com
// CLI: npx fit-doc serve --watch
```

---

**File:** `.claude/skills/website/SKILL.md`

**Site Structure** (line ~20): Add `robots.txt` and `llms.txt` to the directory
tree:

```
website/
├── CNAME                    # Custom domain: www.forwardimpact.team
├── index.template.html      # Shared Mustache template for every page
├── robots.txt               # Crawl directives + sitemap reference
├── llms.txt                 # Curated LLM entry point (links appended at build)
├── index.md                 # Landing page (layout: home)
...
```

**Publishing** (line ~86): Update step 2 to mention CNAME fallback and new
outputs:

```markdown
2. **Build**: `npx fit-doc build --src=website --out=dist` — libdoc reads
   `CNAME` to derive the base URL automatically. Produces HTML pages, co-located
   `index.md` markdown companions, `sitemap.xml`, augmented `llms.txt`, and
   copies `robots.txt` to dist.
```

**Common Tasks > Add a new page** (line ~105): Add a step:

```markdown
4. Check if `website/llms.txt` needs a new H2 section for the page's URL
   category. If the page falls under an existing section (Products,
   Documentation, Optional), no change is needed — libdoc appends links
   automatically.
```

Add a new **Common Tasks** subsection:

```markdown
### Update llms.txt sections

The curated `website/llms.txt` defines H2 section headers. libdoc classifies
pages by URL path and appends links under matching sections:

- Top-level product pages (`/map/`, `/pathway/`, etc.) → `## Products`
- Pages under `/docs/` → `## Documentation`
- Everything else → `## Optional`

To add a new section, edit `website/llms.txt` and update the section-to-page
mapping in `libraries/libdoc/builder.js` (`#augmentLlmsTxt`).
```

---

**File:** `.claude/skills/update-docs/SKILL.md`

Add to the **Process > Step 5 (Check for gaps)** section (line ~46):

```markdown
   - Verify `website/llms.txt` section structure matches the current page
     inventory. New page categories may need a new H2 section; removed pages
     should not leave empty sections.
```

Add a row to the **Key Files to Cross-Reference** table (line ~51):

```markdown
| LLM / SEO outputs | `website/llms.txt`, `website/robots.txt` |
```

---

## File Summary

| File                                            | Action                                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libraries/libdoc/bin/fit-doc.js`               | Modify — add `--base-url` option                                                                                                                                            |
| `libraries/libdoc/builder.js`                   | Modify — `build()` signature, CNAME fallback, page inventory with sort, companion output with title prepend, canonical URL, `#copyStaticAssets` refactor, sitemap, llms.txt |
| `libraries/libdoc/server.js`                    | Modify — add `md` and `xml` to content-type map                                                                                                                             |
| `website/index.template.html`                   | Modify — add `<link rel="alternate">` and `<link rel="canonical">` tags                                                                                                     |
| `website/robots.txt`                            | Create                                                                                                                                                                      |
| `website/llms.txt`                              | Create                                                                                                                                                                      |
| `libraries/libdoc/test/libdoc.test.js`          | Modify — add test cases                                                                                                                                                     |
| `.claude/skills/libs-web-presentation/SKILL.md` | Modify                                                                                                                                                                      |
| `.claude/skills/website/SKILL.md`               | Modify                                                                                                                                                                      |
| `.claude/skills/update-docs/SKILL.md`           | Modify                                                                                                                                                                      |

## Ordering

Steps 1–4 can be developed together (they touch different parts of the same
files but have no circular dependencies). Step 5 modifies `#copyStaticAssets`
and creates the static files. Step 6 depends on step 2c/2d (sorted page
inventory) and step 5 (static files copied to dist). Step 7 is a small
independent change to the server. Step 8 is a no-op (CNAME fallback eliminates
the need for workflow changes). Step 9 should be written alongside or after
steps 1–7. Step 10 is independent and can be done last.

Recommended commit sequence:

1. Steps 1–4:
   `feat(libdoc): add base-url flag with CNAME fallback, markdown companions, alternate and canonical link tags`
2. Step 5:
   `feat(libdoc): refactor static file copying, add robots.txt and llms.txt`
3. Steps 6–7:
   `feat(libdoc): generate sitemap.xml, augment llms.txt, update server content types`
4. Step 9: `test(libdoc): add tests for SEO and LLM optimization outputs`
5. Step 10: `docs: update skills for SEO and LLM optimization`
