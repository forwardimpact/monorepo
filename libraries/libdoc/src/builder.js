import { gfmHeadingId } from "marked-gfm-heading-id";
import { markedHighlight } from "marked-highlight";
import { createLogger } from "@forwardimpact/libtelemetry";
import {
  buildBreadcrumbs,
  buildHeroVars,
  classifyPagesIntoSections,
  generateToc,
  insertSectionLinks,
  transformMarkdownBodyLinks,
  transformMarkdownLinks,
  urlPathFromMdFile,
} from "./transforms.js";
import { scanPages } from "./page-tree.js";
import { resolvePartials, defaultRegistry } from "./partials.js";

/**
 * Pages builder for converting Markdown files to HTML
 */
export class PagesBuilder {
  #fs;
  #path;
  #marked;
  #matter;
  #mustacheRender;
  #prettier;
  #logger;

  /**
   * Creates a new PagesBuilder instance
   * @param {object} fs - File system module
   * @param {object} path - Path module
   * @param {Function} markedParser - Marked parser function
   * @param {Function} matterParser - Front matter parser function
   * @param {Function} mustacheRender - Mustache render function
   * @param {object} prettier - Prettier module for HTML formatting
   * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime - Injected runtime bag
   */
  constructor(
    fs,
    path,
    markedParser,
    matterParser,
    mustacheRender,
    prettier,
    runtime,
  ) {
    if (!fs) throw new Error("fs is required");
    if (!path) throw new Error("path is required");
    if (!markedParser) throw new Error("markedParser is required");
    if (!matterParser) throw new Error("matterParser is required");
    if (!mustacheRender) throw new Error("mustacheRender is required");
    if (!prettier) throw new Error("prettier is required");
    if (!runtime) throw new Error("runtime is required");

    this.#fs = fs;
    this.#path = path;
    this.#marked = markedParser;
    this.#matter = matterParser;
    this.#mustacheRender = mustacheRender;
    this.#prettier = prettier;
    this.#logger = createLogger("libdoc", runtime);

    // Configure marked with extensions
    this.#marked.use(
      gfmHeadingId({
        prefix: "",
      }),
    );

    this.#marked.use(
      markedHighlight({
        langPrefix: "language-",
        // Prism.js handles highlighting on the client side
        highlight(code, _lang) {
          return code;
        },
      }),
    );
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
   * @param {string} pagesDir - Source pages directory
   * @param {string} distDir - Destination distribution directory
   */
  #copyStaticAssets(pagesDir, distDir) {
    if (
      this.#copyDir(
        this.#path.join(pagesDir, "assets"),
        this.#path.join(distDir, "assets"),
      )
    ) {
      this.#logger.info("  ✓ assets/");
    }

    const skipFiles = new Set(["index.template.html", "CNAME", "justfile"]);
    this.#fs
      .readdirSync(pagesDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          !entry.name.endsWith(".md") &&
          !skipFiles.has(entry.name),
      )
      .forEach((entry) => {
        this.#fs.copyFileSync(
          this.#path.join(pagesDir, entry.name),
          this.#path.join(distDir, entry.name),
        );
        this.#logger.info(`  ✓ ${entry.name}`);
      });
  }

  /**
   * Generate sitemap.xml from page inventory
   * @param {Array<{urlPath: string}>} pages - Sorted page inventory
   * @param {string} baseUrl - Base URL for the site
   * @param {string} distDir - Destination distribution directory
   */
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
    this.#fs.writeFileSync(
      this.#path.join(distDir, "sitemap.xml"),
      xml,
      "utf-8",
    );
    this.#logger.info("  ✓ sitemap.xml");
  }

  /**
   * Augment llms.txt with auto-generated page links under each H2 section
   * @param {Array<{urlPath: string, title: string, description: string}>} pages - Sorted page inventory
   * @param {string} baseUrl - Base URL for the site
   * @param {string} distDir - Destination distribution directory
   */
  #augmentLlmsTxt(pages, baseUrl, distDir) {
    const llmsPath = this.#path.join(distDir, "llms.txt");
    if (!this.#fs.existsSync(llmsPath)) return;

    const content = this.#fs.readFileSync(llmsPath, "utf-8");
    const sections = classifyPagesIntoSections(pages);

    const linkLine = (page) => {
      const mdUrl =
        page.urlPath === "/"
          ? `${baseUrl}/index.md`
          : `${baseUrl}${page.urlPath}index.md`;
      const desc = page.description ? `: ${page.description}` : "";
      return `- [${page.title}](${mdUrl})${desc}`;
    };

    const output = insertSectionLinks(content.split("\n"), sections, linkLine);

    this.#fs.writeFileSync(llmsPath, output.join("\n"), "utf-8");
    this.#logger.info("  ✓ llms.txt (augmented)");
  }

  /**
   * Resolve the base URL from an explicit value or CNAME file
   * @param {string|undefined} baseUrl - Explicit base URL
   * @param {string} pagesDir - Source pages directory
   * @returns {string|undefined}
   */
  #resolveBaseUrl(baseUrl, pagesDir) {
    if (baseUrl) return baseUrl;
    const cnamePath = this.#path.join(pagesDir, "CNAME");
    if (this.#fs.existsSync(cnamePath)) {
      const hostname = this.#fs.readFileSync(cnamePath, "utf-8").trim();
      return `https://${hostname}`;
    }
    return undefined;
  }

  /**
   * Build template variables from front matter and rendered HTML
   * @param {object} frontMatter - Parsed front matter
   * @param {string} html - Rendered HTML content
   * @param {string} urlPath - URL path for this page
   * @param {import("./page-tree.js").PageTree} pageTree - Map of URL paths to page metadata
   * @param {string|undefined} baseUrl - Base URL for canonical links
   * @returns {object} Mustache template variables
   */
  #buildTemplateVars(frontMatter, html, urlPath, pageTree, baseUrl) {
    const toc = frontMatter.toc !== false ? generateToc(html) : "";
    const breadcrumbs = buildBreadcrumbs(urlPath, pageTree);

    return {
      title: frontMatter.title,
      description: frontMatter.description || "",
      content: html,
      toc,
      hasToc: !!toc,
      layout: frontMatter.layout || "",
      ...buildHeroVars(frontMatter),
      hasBreadcrumbs: !!breadcrumbs,
      breadcrumbs,
      markdownUrl: "index.md",
      canonicalUrl: baseUrl ? baseUrl + urlPath : "",
    };
  }

  /**
   * Compute output path and write HTML + companion Markdown files
   * @param {string} mdFile - Relative path to the markdown file
   * @param {string} distDir - Destination distribution directory
   * @param {string} finalHtml - Formatted HTML content
   * @param {string} companionContent - Companion Markdown content
   */
  #writePageFiles(mdFile, distDir, finalHtml, companionContent) {
    const baseName = mdFile.replace(".md", "");
    const isIndex = baseName === "index" || baseName.endsWith("/index");
    const outputPath = isIndex ? baseName : this.#path.join(baseName, "index");
    const outputDir = this.#path.dirname(this.#path.join(distDir, outputPath));

    this.#fs.mkdirSync(outputDir, { recursive: true });
    this.#fs.writeFileSync(
      this.#path.join(distDir, outputPath + ".html"),
      finalHtml,
      "utf-8",
    );
    this.#logger.info(`  ✓ ${outputPath}.html`);

    this.#fs.writeFileSync(
      this.#path.join(distDir, outputPath + ".md"),
      companionContent,
      "utf-8",
    );
  }

  /**
   * Render a single markdown file to HTML and write output files
   * @param {string} mdFile - Relative path to the markdown file
   * @param {string} pagesDir - Source pages directory
   * @param {string} distDir - Destination distribution directory
   * @param {string} template - HTML template string
   * @param {import("./page-tree.js").PageTree} pageTree - Map of URL paths to page metadata
   * @param {string|undefined} baseUrl - Base URL for canonical links
   * @returns {Promise<void>}
   */
  async #renderPage(mdFile, pagesDir, distDir, template, pageTree, baseUrl) {
    const { data: frontMatter, content: markdown } = this.#matter(
      this.#fs.readFileSync(this.#path.join(pagesDir, mdFile), "utf-8"),
    );

    const pageDir = this.#path.dirname(mdFile);
    const resolved = resolvePartials(
      markdown,
      pageTree,
      pageDir,
      defaultRegistry,
      { path: this.#path },
      mdFile,
    );
    const rawHtml = this.#marked(resolved);
    const html = transformMarkdownLinks(rawHtml, baseUrl);
    const urlPath = urlPathFromMdFile(mdFile);
    const vars = this.#buildTemplateVars(
      frontMatter,
      html,
      urlPath,
      pageTree,
      baseUrl,
    );
    const outputHtml = this.#mustacheRender(template, vars);
    const finalHtml = await this.#formatAndPostProcess(outputHtml);
    const companionContent = `# ${frontMatter.title}\n\n${transformMarkdownBodyLinks(resolved, baseUrl)}`;

    this.#writePageFiles(mdFile, distDir, finalHtml, companionContent);
  }

  /**
   * Format HTML with prettier and unescape Mermaid code blocks
   * @param {string} outputHtml - Raw HTML string
   * @returns {Promise<string>}
   */
  async #formatAndPostProcess(outputHtml) {
    const formattedHtml = await this.#prettier.format(outputHtml, {
      parser: "html",
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
    });

    const mermaidBlocks = formattedHtml.match(
      /<code class="language-mermaid">[\s\S]*?<\/code>/g,
    );
    if (!mermaidBlocks) return formattedHtml;

    return formattedHtml.replace(
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

  /**
   * Build documentation from Markdown files
   * @param {string} pagesDir - Source pages directory
   * @param {string} distDir - Destination distribution directory
   * @param {string} [baseUrl] - Base URL for sitemap, canonical links, and llms.txt
   * @returns {Promise<void>}
   */
  async build(pagesDir, distDir, baseUrl) {
    this.#logger.info("Building documentation...");

    baseUrl = this.#resolveBaseUrl(baseUrl, pagesDir);

    if (this.#fs.existsSync(distDir)) {
      this.#fs.rmSync(distDir, { recursive: true });
    }
    this.#fs.mkdirSync(distDir, { recursive: true });

    const templatePath = this.#path.join(pagesDir, "index.template.html");
    if (!this.#fs.existsSync(templatePath)) {
      throw new Error(`index.template.html not found in ${pagesDir}`);
    }
    const template = this.#fs.readFileSync(templatePath, "utf-8");

    const pageTree = scanPages(pagesDir, {
      fs: this.#fs,
      path: this.#path,
      matter: this.#matter,
    });

    if (pageTree.size === 0) {
      console.warn(`Warning: No Markdown files found in ${pagesDir}`);
    }

    for (const entry of pageTree.values()) {
      await this.#renderPage(
        entry.filePath,
        pagesDir,
        distDir,
        template,
        pageTree,
        baseUrl,
      );
    }

    const sortedPages = [...pageTree.values()].sort((a, b) =>
      a.urlPath.localeCompare(b.urlPath),
    );

    this.#copyStaticAssets(pagesDir, distDir);

    if (baseUrl) {
      this.#generateSitemap(sortedPages, baseUrl, distDir);
      this.#augmentLlmsTxt(sortedPages, baseUrl, distDir);
    }

    this.#logger.info("Documentation build complete!");
  }
}
