import { urlPathFromMdFile } from "./transforms.js";

export const defaultRegistry = {
  card: (meta, href) =>
    `<a href="${href}">\n<h3>${meta.title}</h3>\n<p>${meta.description}</p>\n</a>`,
  link: (meta, href) => `<a href="${href}">${meta.title}</a>`,
};

const PARTIAL_RE = /<!--\s*part:(\w+):([\w./-]+)\s*-->/g;

/**
 * Replace <!-- part:type:path --> markers with HTML from the registry
 * @param {string} markdown - Markdown content
 * @param {import("./page-tree.js").PageTree} pageTree
 * @param {string} currentPageDir - Directory of the current page (relative to pagesDir)
 * @param {Record<string, (meta: import("./page-tree.js").PageMeta, href: string) => string>} registry
 * @param {{ path: object }} deps
 * @param {string} [sourceFile] - Source file path for error messages
 * @returns {string}
 */
export function resolvePartials(
  markdown,
  pageTree,
  currentPageDir,
  registry,
  { path },
  sourceFile,
) {
  const src = sourceFile || currentPageDir + "/index.md";
  return markdown.replace(PARTIAL_RE, (_match, type, partialPath) => {
    if (!registry[type]) {
      throw new Error(`Unknown partial type "${type}" in ${src}`);
    }

    const resolved = path.normalize(path.join(currentPageDir, partialPath));
    const urlPath = urlPathFromMdFile(resolved + "/index.md");
    const meta = pageTree.get(urlPath);

    if (!meta) {
      throw new Error(
        `Partial target "${partialPath}" not found in page tree (referenced from ${src})`,
      );
    }

    // A redirect page may not be a partial target. A card or a link built from
    // a stub would carry the stub's own title and would bounce the reader to
    // another address. The build stops instead. The author then points the
    // marker at a page that stays on this site, or writes the external link
    // by hand.
    if (meta.redirect) {
      throw new Error(
        `Partial target "${partialPath}" is a redirect stub (referenced from ${src}). Point the marker at a page on this site, or write the link by hand.`,
      );
    }

    const currentUrlPath = urlPathFromMdFile(
      currentPageDir === "." ? "index.md" : currentPageDir + "/index.md",
    );
    const fromDir = currentUrlPath.replace(/\/$/, "") || "/";
    const toDir = urlPath.replace(/\/$/, "") || "/";
    let href = path.relative(fromDir, toDir);
    if (!href.endsWith("/")) href += "/";

    return registry[type](meta, href);
  });
}
