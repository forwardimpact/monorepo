import { urlPathFromMdFile } from "./transforms.js";

/**
 * @typedef {{ filePath: string, urlPath: string, title: string, description: string, redirect: string }} PageMeta
 * @typedef {Map<string, PageMeta>} PageTree
 */

/**
 * Walk pagesDir recursively and build a PageTree map
 * @param {string} pagesDir - Root directory to scan
 * @param {{ fs: object, path: object, matter: Function }} deps
 * @returns {PageTree}
 */
export function scanPages(pagesDir, { fs, path, matter }) {
  /** @type {PageTree} */
  const pageTree = new Map();
  walk(pagesDir, pagesDir, pageTree, { fs, path, matter });
  return pageTree;
}

function collectPage(fullPath, baseDir, pageTree, { matter, content }) {
  const filePath = fullPath.slice(baseDir.length + 1);
  const { data } = matter(content);
  if (!data.title) return;
  const urlPath = urlPathFromMdFile(filePath);
  pageTree.set(urlPath, {
    filePath,
    urlPath,
    title: data.title,
    description: data.description || "",
    // A page with a `redirect` value stays in the tree. Breadcrumbs on its
    // descendants and the build's own lookups then keep resolving its title.
    redirect: data.redirect || "",
  });
}

const SKIP_ENTRIES = new Set(["assets", "public", "CLAUDE.md", "SKILL.md"]);

function isDirectory(fs, fullPath) {
  try {
    const stat = fs.statSync(fullPath);
    return stat.isDirectory && stat.isDirectory();
  } catch {
    return false;
  }
}

function walk(dir, baseDir, pageTree, deps) {
  const { fs, path } = deps;
  const entries = fs.readdirSync(dir);

  for (const entryName of entries) {
    if (SKIP_ENTRIES.has(entryName)) continue;

    const fullPath = path.join(dir, entryName);

    if (isDirectory(fs, fullPath)) {
      walk(fullPath, baseDir, pageTree, deps);
    } else if (entryName.endsWith(".md")) {
      let content;
      try {
        content = fs.readFileSync(fullPath, "utf-8");
      } catch {
        // Skip files that cannot be read.
        continue;
      }
      // A front-matter parse error must stop the build. Swallowing it drops
      // the page from the tree, and the site then publishes without it and
      // with no warning. One unquoted colon in a description is enough.
      try {
        collectPage(fullPath, baseDir, pageTree, { ...deps, content });
      } catch (err) {
        throw new Error(
          `Cannot parse front matter in ${fullPath}: ${err.message}`,
        );
      }
    }
  }
}
