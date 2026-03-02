/**
 * Build Command
 *
 * Generates a static site from the Engineering Pathway data.
 * Copies all necessary files (HTML, JS, CSS) and data to an output directory.
 * Optionally generates a distribution bundle (bundle.tar.gz + install.sh)
 * for local installs by individual engineers.
 */

import {
  cp,
  mkdir,
  rm,
  access,
  realpath,
  readFile,
  writeFile,
} from "fs/promises";
import { readFileSync } from "fs";
import { join, dirname, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import Mustache from "mustache";
import { generateAllIndexes } from "@forwardimpact/map/index-generator";
import { loadFrameworkConfig } from "@forwardimpact/map/loader";

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

  // Generate distribution bundle if siteUrl is configured
  const siteUrl = options.url || framework.distribution?.siteUrl;
  if (siteUrl) {
    await generateBundle({ outputDir, dataDir, siteUrl, framework });
  }

  // Show summary
  console.log(`
✅ Site generated successfully!

Output: ${outputDir}
${siteUrl ? `\nDistribution:\n  ${outputDir}/bundle.tar.gz\n  ${outputDir}/install.sh\n` : ""}
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

/**
 * Generate distribution bundle (bundle.tar.gz + install.sh)
 * @param {Object} params
 * @param {string} params.outputDir - Build output directory
 * @param {string} params.dataDir - Source data directory
 * @param {string} params.siteUrl - Base URL for the published site
 * @param {Object} params.framework - Framework configuration
 */
async function generateBundle({ outputDir, dataDir, siteUrl, framework }) {
  console.log("📦 Generating distribution bundle...");

  const version = getPathwayVersion();
  const frameworkTitle = framework.title || "Engineering Pathway";

  // 1. Create temporary bundle directory
  const bundleDir = join(outputDir, "_bundle");
  await mkdir(bundleDir, { recursive: true });

  // 2. Generate minimal package.json for the bundle
  const bundlePkg = {
    name: "fit-pathway-local",
    version: version,
    private: true,
    dependencies: {
      "@forwardimpact/pathway": `^${version}`,
    },
  };
  await writeFile(
    join(bundleDir, "package.json"),
    JSON.stringify(bundlePkg, null, 2) + "\n",
  );
  console.log(`   ✓ package.json (pathway ^${version})`);

  // 3. Copy data files into bundle
  await cp(dataDir, join(bundleDir, "data"), {
    recursive: true,
    dereference: true,
  });
  console.log("   ✓ data/");

  // 4. Create tar.gz from the bundle directory
  execFileSync("tar", [
    "-czf",
    join(outputDir, "bundle.tar.gz"),
    "-C",
    outputDir,
    "_bundle",
  ]);
  console.log("   ✓ bundle.tar.gz");

  // 5. Clean up temporary bundle directory
  await rm(bundleDir, { recursive: true });

  // 6. Render install.sh from template
  const templatePath = join(appDir, "..", "templates", "install.template.sh");
  const template = await readFile(templatePath, "utf8");
  const installScript = Mustache.render(template, {
    siteUrl: siteUrl.replace(/\/$/, ""),
    version,
    frameworkTitle,
  });
  await writeFile(join(outputDir, "install.sh"), installScript, {
    mode: 0o755,
  });
  console.log("   ✓ install.sh");
}
