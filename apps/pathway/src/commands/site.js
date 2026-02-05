/**
 * Site Command
 *
 * Generates a static site from the Engineering Pathway data.
 * Copies all necessary files (HTML, JS, CSS) and data to an output directory.
 */

import { cp, mkdir, rm, access, realpath } from "fs/promises";
import { join, dirname, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { generateAllIndexes } from "@forwardimpact/schema/index-generator";
import { loadFrameworkConfig } from "@forwardimpact/schema/loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = join(__dirname, "..");

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

/**
 * Files and directories to copy from app/
 */
const PUBLIC_ASSETS = [
  // HTML entry points
  "index.html",
  "slides.html",
  "handout.html",
  // JavaScript entry points
  "main.js",
  "slide-main.js",
  "handout-main.js",
  "types.js",
  // Directories
  "css",
  "lib",
  "pages",
  "slides",
  "components",
  "formatters",
];

/**
 * Files and directories to copy from project root
 */
const ROOT_ASSETS = ["templates"];

/**
 * Run the site command
 * @param {Object} params - Command parameters
 * @param {string} params.dataDir - Path to data directory
 * @param {Object} params.options - Command options
 */
export async function runSiteCommand({ dataDir, options }) {
  const outputDir = options.output || join(process.cwd(), "site");
  const clean = options.clean !== false;

  // Load framework config for display
  let framework;
  try {
    framework = await loadFrameworkConfig(dataDir);
  } catch {
    framework = { emojiIcon: "🚀", title: "Engineering Pathway" };
  }

  console.log(`
${framework.emojiIcon} Generating ${framework.title} static site...
`);

  // Clean output directory if requested
  if (clean) {
    try {
      await access(outputDir);
      console.log(`🗑️  Cleaning ${outputDir}...`);
      await rm(outputDir, { recursive: true });
    } catch {
      // Directory doesn't exist, nothing to clean
    }
  }

  // Create output directory
  await mkdir(outputDir, { recursive: true });

  // Generate index files in data directory
  console.log("📇 Generating index files...");
  await generateAllIndexes(dataDir);

  // Copy app assets
  console.log("📦 Copying application files...");
  for (const asset of PUBLIC_ASSETS) {
    const src = join(appDir, asset);
    const dest = join(outputDir, asset);

    try {
      await access(src);
      await cp(src, dest, { recursive: true });
      console.log(`   ✓ ${asset}`);
    } catch (err) {
      console.log(`   ⚠️  Skipped ${asset}: ${err.message}`);
    }
  }

  // Copy root assets (templates, etc.)
  const rootDir = join(appDir, "..");
  for (const asset of ROOT_ASSETS) {
    const src = join(rootDir, asset);
    const dest = join(outputDir, asset);

    try {
      await access(src);
      await cp(src, dest, { recursive: true });
      console.log(`   ✓ ${asset}`);
    } catch (err) {
      console.log(`   ⚠️  Skipped ${asset}: ${err.message}`);
    }
  }

  // Copy @forwardimpact/schema and @forwardimpact/model packages
  // These are needed by the browser's import map
  console.log("📚 Copying package dependencies...");
  await cp(schemaLibDir, join(outputDir, "schema/lib"), { recursive: true });
  console.log(`   ✓ schema/lib`);
  await cp(modelLibDir, join(outputDir, "model/lib"), { recursive: true });
  console.log(`   ✓ model/lib`);

  // Copy data directory (dereference symlinks to copy actual content)
  console.log("📁 Copying data files...");
  const dataOutputDir = join(outputDir, "data");

  // Check if source and destination are the same (e.g., when --output=.)
  const resolvedDataDir = await realpath(dataDir).catch(() => resolve(dataDir));
  const resolvedDataOutputDir = resolve(dataOutputDir);

  if (resolvedDataDir === resolvedDataOutputDir) {
    console.log(`   ✓ data/ (already in place)`);
  } else {
    await cp(dataDir, dataOutputDir, { recursive: true, dereference: true });
    console.log(`   ✓ data/ (from ${relative(process.cwd(), dataDir)})`);
  }

  // Show summary
  console.log(`
✅ Site generated successfully!

Output: ${outputDir}

To serve locally:
  cd ${relative(process.cwd(), outputDir) || "."}
  npx serve .
`);
}
