import { gfmHeadingId } from "marked-gfm-heading-id";
import { markedHighlight } from "marked-highlight";

/**
 * Documentation builder for converting Markdown files to HTML
 */
export class DocsBuilder {
  #fs;
  #path;
  #marked;
  #matter;
  #mustacheRender;
  #prettier;

  /**
   * Creates a new DocsBuilder instance
   * @param {object} fs - File system module
   * @param {object} path - Path module
   * @param {Function} markedParser - Marked parser function
   * @param {Function} matterParser - Front matter parser function
   * @param {Function} mustacheRender - Mustache render function
   * @param {object} prettier - Prettier module for HTML formatting
   */
  constructor(fs, path, markedParser, matterParser, mustacheRender, prettier) {
    if (!fs) throw new Error("fs is required");
    if (!path) throw new Error("path is required");
    if (!markedParser) throw new Error("markedParser is required");
    if (!matterParser) throw new Error("matterParser is required");
    if (!mustacheRender) throw new Error("mustacheRender is required");
    if (!prettier) throw new Error("prettier is required");

    this.#fs = fs;
    this.#path = path;
    this.#marked = markedParser;
    this.#matter = matterParser;
    this.#mustacheRender = mustacheRender;
    this.#prettier = prettier;

    // Configure marked with extensions
    this.#marked.use(
      gfmHeadingId({
        prefix: "", // No prefix for heading IDs
      }),
    );

    this.#marked.use(
      markedHighlight({
        langPrefix: "language-", // Adds 'language-' prefix to code block classes
        highlight(code, _lang) {
          // Return the code as-is with proper language class
          // Prism.js will handle highlighting on the client side
          return code;
        },
      }),
    );
  }

  /**
   * Transform .md links to match the HTML output structure
   * - index.md → ./
   * - file.md → file/
   * - dir/index.md → dir/
   * - dir/file.md → dir/file/
   * @param {string} html - HTML content to transform
   * @returns {string} HTML with transformed links
   */
  #transformMarkdownLinks(html) {
    return html.replace(
      /href="([^"]*?)\.md(#[^"]*)?"/g,
      (_match, path, hash) => {
        const fragment = hash || "";
        // Handle index.md links
        if (path === "index" || path === "./index") {
          return `href="./${fragment}"`;
        }
        if (path.endsWith("/index")) {
          return `href="${path.slice(0, -5)}${fragment}"`;
        }
        // Non-index files become directories
        return `href="${path}/${fragment}"`;
      },
    );
  }

  /**
   * Generate table of contents from h2 headings
   * @param {string} html - HTML content to extract headings from
   * @returns {string} HTML list of ToC links
   */
  #generateToc(html) {
    const headings = Array.from(
      html.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g),
      (m) => `<li><a href="#${m[1]}">${m[2]}</a></li>`,
    );
    return headings.length ? `<ul>${headings.join("\n")}</ul>` : "";
  }

  /**
   * Copy directory recursively
   * @param {string} src - Source directory
   * @param {string} dest - Destination directory
   * @returns {boolean} True if directory was copied
   */
  #copyDir(src, dest) {
    if (!this.#fs.existsSync(src)) return false;

    this.#fs.mkdirSync(dest, { recursive: true });
    const entries = this.#fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = this.#path.join(src, entry.name);
      const destPath = this.#path.join(dest, entry.name);
      entry.isDirectory()
        ? this.#copyDir(srcPath, destPath)
        : this.#fs.copyFileSync(srcPath, destPath);
    }
    return true;
  }

  /**
   * Copy static assets to distribution directory
   * @param {string} docsDir - Source docs directory
   * @param {string} distDir - Destination distribution directory
   */
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

    // Copy public files (favicon, etc.)
    const publicDir = this.#path.join(docsDir, "public");
    if (!this.#fs.existsSync(publicDir)) return;

    this.#fs
      .readdirSync(publicDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .forEach((entry) => {
        this.#fs.copyFileSync(
          this.#path.join(publicDir, entry.name),
          this.#path.join(distDir, entry.name),
        );
        console.log(`  ✓ ${entry.name}`);
      });
  }

  /**
   * Compute URL path from a markdown file's relative path
   * @param {string} mdFile - Relative path to markdown file
   * @returns {string} URL path (e.g. "/docs/pathway/")
   */
  #urlPathFromMdFile(mdFile) {
    const baseName = mdFile.replace(".md", "");
    const isIndex = baseName === "index" || baseName.endsWith("/index");
    if (isIndex) {
      return baseName === "index"
        ? "/"
        : "/" + baseName.replace(/\/index$/, "") + "/";
    }
    return "/" + baseName + "/";
  }

  /**
   * Build breadcrumb HTML for pages two or more levels deep
   * @param {string} urlPath - URL path of the current page
   * @param {Map<string, string>} pageTitles - Map of URL paths to page titles
   * @returns {string} Breadcrumb HTML or empty string
   */
  #buildBreadcrumbs(urlPath, pageTitles) {
    const segments = urlPath.split("/").filter(Boolean);
    if (segments.length < 2) return "";

    const parts = [];
    for (let i = 0; i < segments.length - 1; i++) {
      const ancestorPath = "/" + segments.slice(0, i + 1).join("/") + "/";
      const title = pageTitles.get(ancestorPath) || segments[i];
      parts.push(`<a href="${ancestorPath}">${title}</a>`);
    }

    const currentTitle =
      pageTitles.get(urlPath) || segments[segments.length - 1];
    parts.push(`<span>${currentTitle}</span>`);

    return parts.join(" / ");
  }

  /**
   * Recursively find all Markdown files in a directory
   * @param {string} dir - Directory to search
   * @param {string} baseDir - Base directory for relative paths
   * @returns {string[]} Array of relative paths to Markdown files
   */
  #findMarkdownFiles(dir, baseDir = dir) {
    const results = [];
    const entries = this.#fs.readdirSync(dir);

    for (const entryName of entries) {
      if (["assets", "public"].includes(entryName)) continue;
      if (["CLAUDE.md", "SKILL.md"].includes(entryName)) continue;
      const fullPath = this.#path.join(dir, entryName);

      // Use statSync to check if it's a directory or file
      try {
        const stat = this.#fs.statSync(fullPath);
        if (stat.isDirectory && stat.isDirectory()) {
          results.push(...this.#findMarkdownFiles(fullPath, baseDir));
        } else if (entryName.endsWith(".md")) {
          // Get path relative to base directory
          const relativePath = fullPath.slice(baseDir.length + 1);
          results.push(relativePath);
        }
      } catch {
        // Skip files that can't be stat'd (e.g., template files)
        if (entryName.endsWith(".md")) {
          const relativePath = fullPath.slice(baseDir.length + 1);
          results.push(relativePath);
        }
      }
    }
    return results;
  }

  /**
   * Build documentation from Markdown files
   * @param {string} docsDir - Source documentation directory
   * @param {string} distDir - Destination distribution directory
   * @returns {Promise<void>}
   */
  async build(docsDir, distDir) {
    console.log("Building documentation...");

    // Clean and create dist directory
    if (this.#fs.existsSync(distDir)) {
      this.#fs.rmSync(distDir, { recursive: true });
    }
    this.#fs.mkdirSync(distDir, { recursive: true });

    // Read and validate template
    const templatePath = this.#path.join(docsDir, "index.template.html");
    if (!this.#fs.existsSync(templatePath)) {
      throw new Error("index.template.html not found in docs directory");
    }
    const template = this.#fs.readFileSync(templatePath, "utf-8");

    // Process each Markdown file (recursive)
    const mdFiles = this.#findMarkdownFiles(docsDir);

    if (mdFiles.length === 0) {
      console.warn("Warning: No Markdown files found in docs/");
    }

    // First pass: collect page titles by URL path for breadcrumbs
    const pageTitles = new Map();
    for (const mdFile of mdFiles) {
      const { data } = this.#matter(
        this.#fs.readFileSync(this.#path.join(docsDir, mdFile), "utf-8"),
      );
      if (data.title) {
        pageTitles.set(this.#urlPathFromMdFile(mdFile), data.title);
      }
    }

    for (const mdFile of mdFiles) {
      const { data: frontMatter, content: markdown } = this.#matter(
        this.#fs.readFileSync(this.#path.join(docsDir, mdFile), "utf-8"),
      );

      if (!frontMatter.title) {
        console.error(`Error: Missing 'title' in front matter of ${mdFile}`);
        continue;
      }

      // Convert Markdown to HTML and transform .md links
      const rawHtml = this.#marked(markdown);
      const html = this.#transformMarkdownLinks(rawHtml);
      const toc = frontMatter.toc !== false ? this.#generateToc(html) : "";

      // Extract hero and layout data from front matter
      const hero = frontMatter.hero;
      const heroCta =
        hero?.cta?.map((item) => ({
          ...item,
          btnClass: item.secondary ? "btn-secondary" : "btn-primary",
        })) || [];

      // Generate breadcrumbs for pages two or more levels deep
      const urlPath = this.#urlPathFromMdFile(mdFile);
      const breadcrumbs = this.#buildBreadcrumbs(urlPath, pageTitles);

      // Render template with context
      const outputHtml = this.#mustacheRender(template, {
        title: frontMatter.title,
        description: frontMatter.description || "",
        content: html,
        toc,
        hasToc: !!toc,
        layout: frontMatter.layout || "",
        hasHero: !!hero,
        heroImage: hero?.image || "",
        heroAlt: hero?.alt || "",
        heroTitle: hero?.title || frontMatter.title,
        heroSubtitle: hero?.subtitle || frontMatter.description || "",
        heroCta,
        hasHeroCta: heroCta.length > 0,
        hasBreadcrumbs: !!breadcrumbs,
        breadcrumbs,
      });

      // Format HTML with prettier
      const formattedHtml = await this.#prettier.format(outputHtml, {
        parser: "html",
        printWidth: 80,
        tabWidth: 2,
        useTabs: false,
      });

      // Post-process: Unescape HTML entities in Mermaid code blocks
      // Prettier escapes entities, but Mermaid.js needs raw syntax
      let finalHtml = formattedHtml;
      const mermaidBlocks = formattedHtml.match(
        /<code class="language-mermaid">[\s\S]*?<\/code>/g,
      );
      if (mermaidBlocks) {
        finalHtml = formattedHtml.replace(
          /<code class="language-mermaid">([\s\S]*?)<\/code>/g,
          (_match, code) => {
            const unescapedCode = code
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");
            return `<code class="language-mermaid">${unescapedCode}</code>`;
          },
        );
      }

      // Determine output path:
      // index.md → index.html
      // dir/index.md → dir/index.html
      // example.md → example/index.html
      // dir/example.md → dir/example/index.html
      const baseName = mdFile.replace(".md", "");
      const isIndex = baseName === "index" || baseName.endsWith("/index");
      const outputPath = isIndex
        ? baseName
        : this.#path.join(baseName, "index");
      const outputDir = this.#path.dirname(
        this.#path.join(distDir, outputPath),
      );

      this.#fs.mkdirSync(outputDir, { recursive: true });
      this.#fs.writeFileSync(
        this.#path.join(distDir, outputPath + ".html"),
        finalHtml,
        "utf-8",
      );
      console.log(`  ✓ ${outputPath}.html`);
    }

    this.#copyStaticAssets(docsDir, distDir);
    console.log("Documentation build complete!");
  }
}
