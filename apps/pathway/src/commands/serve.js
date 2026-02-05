/**
 * Serve Command
 *
 * Serves the Engineering Pathway web application with local data.
 * Uses Node.js built-in http module (no external dependencies).
 */

import { createServer } from "http";
import { readFile, stat } from "fs/promises";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { generateAllIndexes } from "@forwardimpact/schema/index-generator";
import { loadFrameworkConfig } from "@forwardimpact/schema/loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "..");
const rootDir = join(__dirname, "../..");

/**
 * Resolve package directory using Node's module resolution.
 * Works in both monorepo (development) and installed (production) contexts.
 * @param {string} packageName - Package specifier (e.g., '@forwardimpact/schema')
 * @returns {string} Absolute path to package lib directory
 */
function resolvePackageLib(packageName) {
  // import.meta.resolve returns file:// URL to package's main entry (lib/index.js)
  const mainUrl = import.meta.resolve(packageName);
  // Convert to path and get lib directory
  return dirname(fileURLToPath(mainUrl));
}

const schemaLibDir = resolvePackageLib("@forwardimpact/schema");
const modelLibDir = resolvePackageLib("@forwardimpact/model");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
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
 * Run the serve command
 * @param {Object} params - Command parameters
 * @param {string} params.dataDir - Path to data directory
 * @param {Object} params.options - Command options
 */
export async function runServeCommand({ dataDir, options }) {
  const port = options.port || 3000;

  // Load framework config for display
  let framework;
  try {
    framework = await loadFrameworkConfig(dataDir);
  } catch {
    // Fallback if framework config fails
    framework = { emojiIcon: "🚀", title: "Engineering Pathway" };
  }

  // Generate _index.yaml files before serving
  console.log("Generating index files...");
  await generateAllIndexes(dataDir);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    let pathname = url.pathname;

    // Handle trailing slash for directories
    if (pathname.endsWith("/") && pathname !== "/") {
      pathname = pathname.slice(0, -1);
    }

    let filePath;

    if (pathname.startsWith("/data/")) {
      // Serve from user's data directory
      filePath = join(dataDir, pathname.slice(6));
    } else if (pathname.startsWith("/templates/")) {
      // Serve from templates directory
      filePath = join(rootDir, pathname);
    } else if (pathname.startsWith("/schema/lib/")) {
      // Serve @forwardimpact/schema package files (resolved via Node module resolution)
      filePath = join(schemaLibDir, pathname.slice(12));
    } else if (pathname.startsWith("/model/lib/")) {
      // Serve @forwardimpact/model package files (resolved via Node module resolution)
      filePath = join(modelLibDir, pathname.slice(11));
    } else if (pathname === "/" || pathname === "") {
      // Serve index.html for root
      filePath = join(publicDir, "index.html");
    } else {
      // Serve from package's public directory
      filePath = join(publicDir, pathname);
    }

    // Check if path is a directory, serve index.html if so
    if (await isDirectory(filePath)) {
      filePath = join(filePath, "index.html");
    }

    await serveFile(res, filePath);
  });

  server.listen(port, () => {
    console.log(`
${framework.emojiIcon} ${framework.title} running at http://localhost:${port}
📁 Data directory: ${dataDir}

Press Ctrl+C to stop the server.
`);
  });

  // Keep the process running
  return new Promise(() => {});
}
