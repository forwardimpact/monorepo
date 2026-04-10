/**
 * Build Command
 *
 * Generates a static site from the Engineering Pathway data.
 * Copies all necessary files (HTML, JS, CSS) and data to an output directory.
 * Optionally delegates to build-bundle and build-packs to produce the
 * distribution surfaces (bundle.tar.gz + install.sh for the curl|bash flow,
 * and agent/skill packs for ecosystem tools like `npx skills` and APM) when
 * `framework.distribution.siteUrl` is configured.
 */

import { cp, mkdir, rm, access, realpath, writeFile } from "fs/promises";
import { readFileSync } from "fs";
import { join, dirname, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { createIndexGenerator } from "@forwardimpact/map/index-generator";
import { createDataLoader } from "@forwardimpact/map/loader";
import { generateBundle } from "./build-bundle.js";
import { generatePacks } from "./build-packs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = join(__dirname, "..");

/**
 * Resolve package directory using Node's module resolution.
 * Works in both monorepo (development) and installed (production) contexts.
 * @param {string} packageName - Package specifier (e.g., '@forwardimpact/map')
 * @returns {string} Absolute path to package lib directory
 */
function resolvePackageLib(packageName) {
  // import.meta.resolve returns file:// URL to package's main entry (lib/index.js)
  const mainUrl = import.meta.resolve(packageName);
  // Convert to path and get lib directory
  return dirname(fileURLToPath(mainUrl));
}

const mapLibDir = resolvePackageLib("@forwardimpact/map");
const modelLibDir = resolvePackageLib("@forwardimpact/libskill");
const uiLibDir = resolvePackageLib("@forwardimpact/libui");

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
 * Run the build command
 * @param {Object} params - Command parameters
 * @param {string} params.dataDir - Path to data directory
 * @param {Object} params.options - Command options
 */
export async function runBuildCommand({ dataDir, options }) {
  const outputDir = options.output || join(process.cwd(), "public");
  const clean = options.clean !== false;

  // Load framework config for display
  let framework;
  try {
    const loader = createDataLoader();
    framework = await loader.loadFrameworkConfig(dataDir);
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
  const indexGenerator = createIndexGenerator();
  await indexGenerator.generateAllIndexes(dataDir);

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

  // Copy @forwardimpact/map and @forwardimpact/libskill packages
  // These are needed by the browser's import map
  console.log("📚 Copying package dependencies...");
  await cp(mapLibDir, join(outputDir, "map/lib"), { recursive: true });
  console.log(`   ✓ map/lib`);
  await cp(modelLibDir, join(outputDir, "model/lib"), { recursive: true });
  console.log(`   ✓ model/lib`);
  // Copy libui JS (src/) and CSS (src/css/)
  await cp(uiLibDir, join(outputDir, "ui/lib"), { recursive: true });
  // CSS is within uiLibDir/css/ so it's already copied as ui/lib/css/
  // Create ui/css/ symlink-like copy for the CSS @import paths
  await cp(join(uiLibDir, "css"), join(outputDir, "ui/css"), {
    recursive: true,
  });
  console.log(`   ✓ ui/lib + ui/css`);

  // Copy vendor dependencies for offline usage
  console.log("📦 Copying vendor dependencies...");
  const vendorDir = join(outputDir, "vendor");
  await mkdir(vendorDir, { recursive: true });

  // mustache (ESM module)
  const mustacheSrc = fileURLToPath(import.meta.resolve("mustache"));
  const mustacheMjs = join(dirname(mustacheSrc), "mustache.mjs");
  await cp(mustacheMjs, join(vendorDir, "mustache.mjs"));
  console.log("   ✓ vendor/mustache.mjs");

  // yaml (browser ESM build — not in package exports, resolve via filesystem)
  // import.meta.resolve("yaml") → .../yaml/dist/index.js, go up two levels
  const yamlPkg = dirname(dirname(fileURLToPath(import.meta.resolve("yaml"))));
  const yamlBrowserDist = join(yamlPkg, "browser", "dist");
  await cp(yamlBrowserDist, join(vendorDir, "yaml"), { recursive: true });
  console.log("   ✓ vendor/yaml/");

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

  // Write version.json for the web app footer
  const version = getPathwayVersion();
  await writeFile(
    join(outputDir, "version.json"),
    JSON.stringify({ version }) + "\n",
  );
  console.log(`   ✓ version.json (${version})`);

  // Generate distribution surfaces if siteUrl is configured
  const siteUrl = options.url || framework.distribution?.siteUrl;
  if (siteUrl) {
    const templatesDir = join(appDir, "..", "templates");
    await generateBundle({
      outputDir,
      dataDir,
      siteUrl,
      framework,
      version,
      templatesDir,
    });
    await generatePacks({
      outputDir,
      dataDir,
      siteUrl,
      framework,
      version,
      templatesDir,
    });
  }

  // Show summary
  console.log(`
✅ Site generated successfully!

Output: ${outputDir}
${siteUrl ? `\nDistribution:\n  ${outputDir}/bundle.tar.gz\n  ${outputDir}/install.sh\n  ${outputDir}/packs/ (agent/skill packs)\n  ${outputDir}/packs/{name}/.well-known/skills/ (per-pack skill repositories)\n  ${outputDir}/packs/.well-known/skills/ (aggregate skill repository)\n  ${outputDir}/apm.yml\n` : ""}
To serve locally:
  cd ${relative(process.cwd(), outputDir) || "."}
  npx serve .
`);
}

/**
 * Read the pathway package version from package.json
 * @returns {string} Package version
 */
function getPathwayVersion() {
  const pkgPath = join(appDir, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  return pkg.version;
}
