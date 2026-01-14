/**
 * Site Command
 *
 * Generates a static site from the Engineering Pathway data.
 * Copies all necessary files (HTML, JS, CSS) and data to an output directory.
 */

import { cp, mkdir, rm, access, realpath } from "fs/promises";
import { join, dirname, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { generateAllIndexes } from "../model/index-generator.js";
import { loadFrameworkConfig } from "../model/loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = join(__dirname, "..");

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
  "model",
  "pages",
  "slides",
  "components",
  "formatters",
];

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
    framework = { emoji: "🚀", title: "Engineering Pathway" };
  }

  console.log(`
${framework.emoji} Generating ${framework.title} static site...
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
