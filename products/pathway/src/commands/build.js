/**
 * Build Command
 *
 * Generates a static site from the Engineering Pathway data.
 * Copies all necessary files (HTML, JS, CSS) and data to an output directory.
 * Optionally delegates to build-bundle and build-packs to produce the
 * distribution surfaces (bundle.tar.gz + install.sh for the curl|bash flow,
 * and agent/skill packs for ecosystem tools like `npx skills` and APM) when
 * `standard.distribution.siteUrl` is configured.
 */

import { join, dirname, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createIndexGenerator } from "@forwardimpact/map/index-generator";
import { createDataLoader } from "@forwardimpact/map/loader";

const logger = createLogger("pathway");
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
  // Top-level `import.meta.resolve(...)` runs at module load and fails inside
  // a `bun build --compile` bunfs root (no node_modules tree) — even on
  // `--help`, because `bin/fit-pathway.js` statically imports this module.
  // Call this lazily from the command handler that needs it.
  const mainUrl = import.meta.resolve(packageName);
  return dirname(fileURLToPath(mainUrl));
}

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

async function copyAssets(srcDir, assetNames, outputDir, runtime) {
  for (const asset of assetNames) {
    const src = join(srcDir, asset);
    const dest = join(outputDir, asset);
    try {
      await runtime.fs.access(src);
      await runtime.fs.cp(src, dest, { recursive: true });
      logger.info(`   ✓ ${asset}`);
    } catch (err) {
      logger.info(`   ⚠️  Skipped ${asset}: ${err.message}`);
    }
  }
}

/**
 * Run the build command
 * @param {Object} params - Command parameters
 * @param {string} params.dataDir - Path to data directory
 * @param {Object} params.options - Command options
 */
export async function runBuildCommand({ dataDir, options, runtime }) {
  const outputDir = options.output || join(runtime.proc.cwd(), "public");
  const clean = options.clean !== false;

  // Load standard config for display
  let standard;
  try {
    const loader = createDataLoader();
    standard = await loader.loadStandardConfig(dataDir);
  } catch {
    standard = { emojiIcon: "🚀", title: "Engineering Pathway" };
  }

  logger.info(`
${standard.emojiIcon} Generating ${standard.title} static site...
`);

  // Clean output directory if requested
  if (clean) {
    try {
      await runtime.fs.access(outputDir);
      logger.info(`🗑️  Cleaning ${outputDir}...`);
      await runtime.fs.rm(outputDir, { recursive: true });
    } catch {
      // Directory doesn't exist, nothing to clean
    }
  }

  // Create output directory
  await runtime.fs.mkdir(outputDir, { recursive: true });

  // Generate index files in data directory
  logger.info("📇 Generating index files...");
  const indexGenerator = createIndexGenerator();
  await indexGenerator.generateAllIndexes(dataDir);

  // Copy app assets
  logger.info("📦 Copying application files...");
  await copyAssets(appDir, PUBLIC_ASSETS, outputDir, runtime);

  // Copy root assets (templates, etc.)
  await copyAssets(join(appDir, ".."), ROOT_ASSETS, outputDir, runtime);

  // Copy @forwardimpact/map and @forwardimpact/libskill packages
  // These are needed by the browser's import map
  logger.info("📚 Copying package dependencies...");
  const mapLibDir = resolvePackageLib("@forwardimpact/map");
  const modelLibDir = resolvePackageLib("@forwardimpact/libskill");
  const uiLibDir = resolvePackageLib("@forwardimpact/libui");
  await runtime.fs.cp(mapLibDir, join(outputDir, "map/lib"), {
    recursive: true,
  });
  logger.info(`   ✓ map/lib`);
  await runtime.fs.cp(modelLibDir, join(outputDir, "model/lib"), {
    recursive: true,
  });
  logger.info(`   ✓ model/lib`);
  // Copy libui JS (src/) and CSS (src/css/)
  await runtime.fs.cp(uiLibDir, join(outputDir, "ui/lib"), { recursive: true });
  // CSS is within uiLibDir/css/ so it's already copied as ui/lib/css/
  // Create ui/css/ symlink-like copy for the CSS @import paths
  await runtime.fs.cp(join(uiLibDir, "css"), join(outputDir, "ui/css"), {
    recursive: true,
  });
  logger.info(`   ✓ ui/lib + ui/css`);

  // Copy vendor dependencies for offline usage
  logger.info("📦 Copying vendor dependencies...");
  const vendorDir = join(outputDir, "vendor");
  await runtime.fs.mkdir(vendorDir, { recursive: true });

  // mustache (ESM module)
  const mustacheSrc = fileURLToPath(import.meta.resolve("mustache"));
  const mustacheMjs = join(dirname(mustacheSrc), "mustache.mjs");
  await runtime.fs.cp(mustacheMjs, join(vendorDir, "mustache.mjs"));
  logger.info("   ✓ vendor/mustache.mjs");

  // yaml (browser ESM build — not in package exports, resolve via filesystem)
  // import.meta.resolve("yaml") → .../yaml/dist/index.js, go up two levels
  const yamlPkg = dirname(dirname(fileURLToPath(import.meta.resolve("yaml"))));
  const yamlBrowserDist = join(yamlPkg, "browser", "dist");
  await runtime.fs.cp(yamlBrowserDist, join(vendorDir, "yaml"), {
    recursive: true,
  });
  logger.info("   ✓ vendor/yaml/");

  // Copy data directory (dereference symlinks to copy actual content)
  logger.info("📁 Copying data files...");
  const dataOutputDir = join(outputDir, "data");

  // Check if source and destination are the same (e.g., when --output=.)
  const resolvedDataDir = await runtime.fs
    .realpath(dataDir)
    .catch(() => resolve(dataDir));
  const resolvedDataOutputDir = resolve(dataOutputDir);

  if (resolvedDataDir === resolvedDataOutputDir) {
    logger.info(`   ✓ data/ (already in place)`);
  } else {
    await runtime.fs.cp(dataDir, dataOutputDir, {
      recursive: true,
      dereference: true,
    });
    logger.info(`   ✓ data/ (from ${relative(runtime.proc.cwd(), dataDir)})`);
  }

  // Write version.json for the web app footer
  const version = await getPathwayVersion(runtime);
  await runtime.fs.writeFile(
    join(outputDir, "version.json"),
    JSON.stringify({ version }) + "\n",
  );
  logger.info(`   ✓ version.json (${version})`);

  // Generate distribution surfaces if siteUrl is configured
  const siteUrl = options.url || standard.distribution?.siteUrl;
  if (siteUrl) {
    const templatesDir = join(appDir, "..", "templates");
    await generateBundle({
      outputDir,
      dataDir,
      siteUrl,
      standard,
      version,
      templatesDir,
      runtime,
    });
    await generatePacks({
      outputDir,
      dataDir,
      siteUrl,
      standard,
      version,
      templatesDir,
      runtime,
    });
  }

  // Show summary
  logger.info(`
✅ Site generated successfully!

Output: ${outputDir}
${siteUrl ? `\nDistribution:\n  ${outputDir}/bundle.tar.gz\n  ${outputDir}/install.sh\n  ${outputDir}/packs/ (agent/skill packs)\n  ${outputDir}/packs/{name}/.well-known/skills/ (per-pack skill repositories)\n  ${outputDir}/packs/.well-known/skills/ (aggregate skill repository)\n  ${outputDir}/apm.yml\n` : ""}
To serve locally:
  npx fit-pathway serve ${relative(runtime.proc.cwd(), outputDir) || "."}
`);
}

/**
 * Read the pathway package version from package.json
 * @returns {Promise<string>} Package version
 */
async function getPathwayVersion(runtime) {
  const pkgPath = join(appDir, "..", "package.json");
  const pkg = JSON.parse(await runtime.fs.readFile(pkgPath, "utf8"));
  return pkg.version;
}
