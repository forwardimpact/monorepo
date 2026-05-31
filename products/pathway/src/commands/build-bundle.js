/**
 * Bundle generation for Pathway distribution.
 *
 * Emits `bundle.tar.gz` and `install.sh` alongside the static site so
 * engineers can install `@forwardimpact/pathway` globally via
 * `curl -fsSL <site>/install.sh | bash`. Invoked from build.js when
 * `standard.distribution.siteUrl` is configured.
 */

import { join } from "path";
import Mustache from "mustache";
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("pathway");

/**
 * Generate distribution bundle (bundle.tar.gz + install.sh)
 * @param {Object} params
 * @param {string} params.outputDir - Build output directory
 * @param {string} params.dataDir - Source data directory
 * @param {string} params.siteUrl - Base URL for the published site
 * @param {Object} params.standard - Standard configuration
 * @param {string} params.version - Pathway package version
 * @param {string} params.templatesDir - Absolute path to pathway/templates
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators
 */
export async function generateBundle({
  outputDir,
  dataDir,
  siteUrl,
  standard,
  version,
  templatesDir,
  runtime,
}) {
  logger.info("📦 Generating distribution bundle...");

  const standardTitle = standard.title || "Engineering Pathway";

  // 1. Create temporary bundle directory
  const bundleDir = join(outputDir, "_bundle");
  await runtime.fs.mkdir(bundleDir, { recursive: true });

  // 2. Generate minimal package.json for the bundle
  const bundlePkg = {
    name: "fit-pathway-local",
    version: version,
    private: true,
    dependencies: {
      "@forwardimpact/pathway": `^${version}`,
    },
  };
  await runtime.fs.writeFile(
    join(bundleDir, "package.json"),
    JSON.stringify(bundlePkg, null, 2) + "\n",
  );
  logger.info(`   ✓ package.json (pathway ^${version})`);

  // 3. Copy data files into bundle
  await runtime.fs.cp(dataDir, join(bundleDir, "data"), {
    recursive: true,
    dereference: true,
  });
  logger.info("   ✓ data/");

  // 4. Create tar.gz from the bundle directory
  const tarResult = await runtime.subprocess.run("tar", [
    "-czf",
    join(outputDir, "bundle.tar.gz"),
    "-C",
    outputDir,
    "_bundle",
  ]);
  if (tarResult.exitCode !== 0) {
    throw new Error(
      `tar exited with ${tarResult.exitCode}: ${(tarResult.stderr ?? "").trim()}`,
    );
  }
  logger.info("   ✓ bundle.tar.gz");

  // 5. Clean up temporary bundle directory
  await runtime.fs.rm(bundleDir, { recursive: true });

  // 6. Render install.sh from template
  const templatePath = join(templatesDir, "install.template.sh");
  const template = await runtime.fs.readFile(templatePath, "utf8");
  const installScript = Mustache.render(template, {
    siteUrl: siteUrl.replace(/\/$/, ""),
    version,
    standardTitle,
  });
  await runtime.fs.writeFile(join(outputDir, "install.sh"), installScript, {
    mode: 0o755,
  });
  logger.info("   ✓ install.sh");
}
