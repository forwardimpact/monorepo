# 160 — SEO and LLM Agent Optimization: Plan

## Approach

All new functionality lives in `DocsBuilder`. The `build()` method signature
gains a third parameter (`baseUrl`), and after the existing page loop + static
asset copy, a new post-build phase generates `sitemap.xml` and augments
`llms.txt`. Markdown companions and the alternate `<link>` tag are woven into
the existing per-page loop. No new classes or files — everything fits naturally
into the builder's current structure.

**Static file convention.** Static files (`robots.txt`, `llms.txt`) live in the
website root alongside markdown content — there is no `public/` subdirectory.
The dead `public/` code path in `#copyStaticAssets` is replaced with root-level
static file copying that picks up non-markdown, non-template files automatically.

**Ordering strategy for `llms.txt`:** Run sitemap/llms.txt generation *after*
`#copyStaticAssets`. The curated `llms.txt` gets copied to dist as a regular
static file, then the post-build phase reads it back, appends links, and
overwrites it. This keeps `#copyStaticAssets` generic.

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

### Step 2 — `build()` signature and page inventory

**File:** `libraries/libdoc/builder.js`

**2a.** Change `build(docsDir, distDir)` to
`build(docsDir, distDir, baseUrl)`.

**2b.** Collect a page inventory during the per-page loop. After front matter
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
the markdown companion:

```javascript
// Write markdown companion (.html.md)
const companionMarkdown = this.#transformMarkdownBodyLinks(markdown);
const companionPath = this.#path.join(distDir, outputPath + ".html.md");
this.#fs.writeFileSync(companionPath, companionMarkdown, "utf-8");
```

The `markdown` variable already holds the post-front-matter content (line 269).
The output path reuses the same `outputPath` variable used for the HTML file.

**Verify:** Every `.html` in dist has a sibling `.html.md`.

---

### Step 4 — Alternate `<link>` tag in HTML template

**File:** `website/index.template.html`

Add after the stylesheet `<link>` (line 11):

```html
<link rel="alternate" type="text/markdown" href="{{markdownUrl}}" />
```

**File:** `libraries/libdoc/builder.js`

In the template context object (line ~296), add `markdownUrl`:

```javascript
markdownUrl: "index.html.md",
```

The value is always `index.html.md` because every page's HTML file is named
`index.html` (either directly for index pages, or inside a subdirectory for
non-index pages). The relative href from the page's own directory is always the
same.

**Verify:** Every built HTML page has the `<link rel="alternate">` tag in
`<head>`.

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

**6b.** Add private method
`#augmentLlmsTxt(pages, baseUrl, distDir)`:

Reads `dist/llms.txt` (already copied by `#copyStaticAssets` from the source
root). If it doesn't exist, returns early. Parses the file to find H2 section
headers. Classifies each page into a section based on URL path:

- Top-level product pages (`/map/`, `/pathway/`, `/basecamp/`, `/guide/`,
  `/landmark/`, `/summit/`) → **Products**
- Pages under `/docs/` → **Documentation**
- Everything else (`/`, `/about/`) → **Optional**

For each H2 section, appends page links in llms.txt format:

```
- [Page Title](https://www.forwardimpact.team/path/index.html.md): Description
```

The link URL uses `baseUrl` + `urlPath` (with trailing slash removed) +
`index.html.md`. Pages without a description omit the colon and description.

Implementation approach — split the curated file at H2 boundaries, build a
map of section name → lines, append page links to each section, then
reassemble:

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
    const htmlMdUrl = page.urlPath === "/"
      ? `${baseUrl}/index.html.md`
      : `${baseUrl}${page.urlPath}index.html.md`;
    const desc = page.description ? `: ${page.description}` : "";
    return `- [${page.title}](${htmlMdUrl})${desc}`;
  };

  // Reassemble: insert links after each H2
  const output = [];
  let currentSection = null;
  for (const line of lines) {
    output.push(line);
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      currentSection = h2Match[1].trim();
      const pageList = sections[currentSection];
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

**6c.** In `build()`, after `#copyStaticAssets` (line 366) and before the
"complete" log:

```javascript
if (baseUrl) {
  this.#generateSitemap(pages, baseUrl, distDir);
  this.#augmentLlmsTxt(pages, baseUrl, distDir);
}
```

**Verify:**
- `dist/sitemap.xml` has one `<url>` per page.
- `dist/llms.txt` has curated content + page links under each H2.
- Without `--base-url`, neither file is generated/augmented.

---

### Step 7 — GitHub Actions workflow update

**File:** `.github/workflows/website.yaml`

Change the build step (line 34) from:

```yaml
run: npx fit-doc build --src=website --out=dist
```

to:

```yaml
run: npx fit-doc build --src=website --out=dist --base-url=https://www.forwardimpact.team
```

**Verify:** Workflow passes with the new flag.

---

### Step 8 — Tests

**File:** `libraries/libdoc/test/libdoc.test.js`

Add test cases for:

1. **Markdown companion output** — Build produces `.html.md` alongside each
   `.html`. Verify content is the post-front-matter markdown.

2. **Markdown body link transformation** — Source link `[Core](./core.md)` →
   `[Core](core/)` in companion. Test all transformation rules: index.md,
   file.md, dir/index.md, with hash fragments.

3. **Alternate link tag** — Built HTML contains
   `<link rel="alternate" type="text/markdown" href="index.html.md" />`.

4. **Sitemap generation** — When `baseUrl` is provided, `sitemap.xml` is written
   with correct `<url>` entries. When omitted, no `sitemap.xml`.

5. **llms.txt augmentation** — When `baseUrl` is provided and curated
   `llms.txt` exists in the source root, the output `llms.txt` contains curated
   content plus auto-generated links under each H2. Verify section
   classification (product pages → Products, docs → Documentation, others →
   Optional).

6. **llms.txt skipped when no curated file** — When no `llms.txt` in source
   root, no `llms.txt` in output even with `baseUrl`.

7. **No baseUrl** — Markdown companions and alternate link still produced;
   sitemap and llms.txt augmentation skipped.

8. **Static file copying** — Non-markdown, non-template root files (e.g.
   `robots.txt`) are copied to dist. `.md` files, `index.template.html`, and
   `CNAME` are not copied as static files.

All tests use the existing mock pattern (Maps for files, Sets for directories).
Extend the mock `fs` to track `writeFileSync` calls and `existsSync` checks for
the new output files.

---

### Step 9 — Skill updates

**File:** `.claude/skills/libs-web-presentation/SKILL.md`

Add to the libdoc section:

- `--base-url` CLI flag: enables sitemap.xml and llms.txt link generation
- `sitemap.xml`: auto-generated from page inventory, minimal format
- `.html.md` companions: written for every page, markdown body with transformed
  links
- `<link rel="alternate" type="text/markdown">`: template variable
  `markdownUrl`, always `index.html.md`
- `llms.txt`: curated file in source root + auto-appended links per H2 section
- Page inventory shared between sitemap and llms.txt generation
- `#copyStaticAssets` copies root-level non-markdown, non-template files (no
  `public/` directory)

**File:** `.claude/skills/website/SKILL.md`

Add:

- `website/llms.txt`: curated section structure, links appended at build time by
  libdoc
- `website/robots.txt`: references sitemap location
- `.html.md` convention: every page has a markdown companion
- Adding/removing H2 sections in `llms.txt` requires updating section mapping
  in `builder.js`

**File:** `.claude/skills/update-docs/SKILL.md`

Add a reminder that adding or removing website pages may require updating the
curated `website/llms.txt` section structure.

---

## File Summary

| File | Action |
|------|--------|
| `libraries/libdoc/bin/fit-doc.js` | Modify — add `--base-url` option |
| `libraries/libdoc/builder.js` | Modify — `build()` signature, page inventory, companion output, `#copyStaticAssets` refactor, sitemap, llms.txt |
| `website/index.template.html` | Modify — add `<link rel="alternate">` tag |
| `website/robots.txt` | Create |
| `website/llms.txt` | Create |
| `.github/workflows/website.yaml` | Modify — add `--base-url` flag |
| `libraries/libdoc/test/libdoc.test.js` | Modify — add test cases |
| `.claude/skills/libs-web-presentation/SKILL.md` | Modify |
| `.claude/skills/website/SKILL.md` | Modify |
| `.claude/skills/update-docs/SKILL.md` | Modify |

## Ordering

Steps 1–4 can be developed together (they touch different parts of the same
files but have no circular dependencies). Step 5 modifies `#copyStaticAssets`
and creates the static files. Step 6 depends on step 2b (page inventory) and
step 5 (static files copied to dist). Step 7 is independent. Step 8 should be
written alongside or after steps 1–6. Step 9 is independent and can be done
last.

Recommended commit sequence:

1. Steps 1–4: `feat(libdoc): add base-url flag, markdown companions, and alternate link tag`
2. Step 5: `feat(libdoc): refactor static file copying, add robots.txt and llms.txt`
3. Step 6: `feat(libdoc): generate sitemap.xml and augment llms.txt at build time`
4. Step 7: `chore(website): pass base-url in GitHub Actions build step`
5. Step 8: `test(libdoc): add tests for SEO and LLM optimization outputs`
6. Step 9: `docs: update skills for SEO and LLM optimization`
