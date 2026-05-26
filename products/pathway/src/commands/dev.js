/**
 * Dev Command
 *
 * Runs a live development server for the Engineering Pathway web application.
 * Uses Node.js built-in http module (no external dependencies).
 */

import { createServer } from "http";
import { readFile, stat } from "fs/promises";
import { readFileSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createIndexGenerator } from "@forwardimpact/map/index-generator";
import { createDataLoader } from "@forwardimpact/map/loader";

const logger = createLogger("pathway");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "..");
const rootDir = join(__dirname, "../..");

// `bun build --compile` injects FIT_PATHWAY_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_PATHWAY_VERSION ||
  JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")).version;

/**
 * Resolve package directory using Node's module resolution.
 * Works in both monorepo (development) and installed (production) contexts.
 * @param {string} packageName - Package specifier (e.g., '@forwardimpact/map')
 * @returns {string} Absolute path to package lib directory
 */
function resolvePackageLib(packageName) {
  // Top-level `import.meta.resolve(...)` runs at module load and fails inside
  // a `bun build --compile` bunfs root (no node_modules tree) — even on
  // `--help`, because `bin/fit-pathway.js` statically imports this module.
  // Call this lazily from the command handler that needs it.
  const mainUrl = import.meta.resolve(packageName);
  return dirname(fileURLToPath(mainUrl));
}

function resolveVendorDirs() {
  const mustacheDir = dirname(fileURLToPath(import.meta.resolve("mustache")));
  const yamlBrowserDir = join(
    dirname(dirname(fileURLToPath(import.meta.resolve("yaml")))),
    "browser",
    "dist",
  );
  return { mustacheDir, yamlBrowserDir };
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Get MIME type for a file extension
 * @param {string} ext - File extension including dot
 * @returns {string} MIME type
 */
function getMimeType(ext) {
  return MIME_TYPES[ext.toLowerCase()] || "application/octet-stream";
}

/**
 * Serve a static file
 * @param {import('http').ServerResponse} res - HTTP response
 * @param {string} filePath - Path to file
 */
async function serveFile(res, filePath) {
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.setHeader("Content-Type", getMimeType(ext));
    res.end(content);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("Not Found");
    } else {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain");
      res.end("Internal Server Error");
    }
  }
}

/**
 * Check if a path is a directory
 * @param {string} path - Path to check
 * @returns {Promise<boolean>}
 */
async function isDirectory(path) {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Build the static file route table for the dev server.
 * @param {{ dataDir: string }} params
 * @returns {Array<{ match: (p: string) => boolean, resolve: (p: string) => string }>}
 */
function buildRoutes({ dataDir }) {
  const mapLibDir = resolvePackageLib("@forwardimpact/map");
  const modelLibDir = resolvePackageLib("@forwardimpact/libskill");
  const uiLibDir = resolvePackageLib("@forwardimpact/libui");
  const { mustacheDir, yamlBrowserDir } = resolveVendorDirs();
  const prefix = (p, dir, sliceLen) => ({
    match: (path) => path.startsWith(p),
    resolve: (path) => join(dir, path.slice(sliceLen)),
  });
  return [
    prefix("/data/", dataDir, 6),
    {
      match: (p) => p.startsWith("/templates/"),
      resolve: (p) => join(rootDir, p),
    },
    prefix("/map/lib/", mapLibDir, 9),
    prefix("/model/lib/", modelLibDir, 11),
    prefix("/ui/lib/", uiLibDir, 8),
    {
      match: (p) => p.startsWith("/ui/css/"),
      resolve: (p) => join(uiLibDir, "css", p.slice(8)),
    },
    {
      match: (p) => p === "/vendor/mustache.mjs",
      resolve: () => join(mustacheDir, "mustache.mjs"),
    },
    prefix("/vendor/yaml/", yamlBrowserDir, 13),
    {
      match: (p) => p === "/" || p === "",
      resolve: () => join(publicDir, "index.html"),
    },
  ];
}

function resolveRoute(pathname, routes) {
  const route = routes.find((r) => r.match(pathname));
  return route ? route.resolve(pathname) : join(publicDir, pathname);
}

/**
 * Run the dev command
 * @param {Object} params - Command parameters
 * @param {string} params.dataDir - Path to data directory
 * @param {Object} params.options - Command options
 */
export async function runDevCommand({ dataDir, options }) {
  const port = options.port || 3000;

  // Load standard config for display
  let standard;
  try {
    const loader = createDataLoader();
    standard = await loader.loadStandardConfig(dataDir);
  } catch {
    // Fallback if standard config fails
    standard = { emojiIcon: "🚀", title: "Engineering Pathway" };
  }

  // Generate _index.yaml files before serving
  logger.info("Generating index files...");
  const indexGenerator = createIndexGenerator();
  await indexGenerator.generateAllIndexes(dataDir);

  const routes = buildRoutes({ dataDir });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    let pathname = url.pathname;

    // Handle trailing slash for directories
    if (pathname.endsWith("/") && pathname !== "/") {
      pathname = pathname.slice(0, -1);
    }

    if (pathname === "/version.json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ version: VERSION }));
      return;
    }

    let filePath = resolveRoute(pathname, routes);

    // Check if path is a directory, serve index.html if so
    if (await isDirectory(filePath)) {
      filePath = join(filePath, "index.html");
    }

    await serveFile(res, filePath);
  });

  server.listen(port, () => {
    logger.info(`
${standard.emojiIcon} ${standard.title} running at http://localhost:${port}
📁 Data directory: ${dataDir}

Press Ctrl+C to stop the server.
`);
  });

  // Keep the process running
  return new Promise(() => {});
}
