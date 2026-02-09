/**
 * Update Command
 *
 * Re-downloads the distribution bundle from the published site URL
 * and updates the local ~/.fit/pathway/ installation.
 */

import { cp, mkdir, rm, readFile, writeFile, access } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { execFileSync, execSync } from "child_process";
import { loadFrameworkConfig } from "@forwardimpact/schema/loader";

const INSTALL_DIR = join(homedir(), ".fit", "pathway");

/**
 * Run the update command.
 * Reads siteUrl from the installed framework.yaml, re-downloads the bundle,
 * extracts data, and runs npm install to update dependencies.
 *
 * @param {Object} params - Command parameters
 * @param {string} params.dataDir - Path to data directory (may be the installed one)
 * @param {Object} params.options - Command options
 */
export async function runUpdateCommand({ dataDir: _dataDir, options }) {
  const installDataDir = join(INSTALL_DIR, "data");

  // Verify we have a home-directory installation
  try {
    await access(installDataDir);
  } catch {
    console.error("Error: No local installation found at ~/.fit/pathway/");
    console.error(
      "Install first using the install.sh script from your organization's pathway site.",
    );
    process.exit(1);
  }

  // Load framework config to get siteUrl
  const framework = await loadFrameworkConfig(installDataDir);
  const siteUrl = options.url || framework.distribution?.siteUrl;

  if (!siteUrl) {
    console.error(
      "Error: No siteUrl found in ~/.fit/pathway/data/framework.yaml (distribution.siteUrl)",
    );
    console.error("Provide one with --url=<URL> or add it to framework.yaml.");
    process.exit(1);
  }

  const baseUrl = siteUrl.replace(/\/$/, "");
  const bundleName = "bundle.tar.gz";

  console.log(`\n🔄 Updating from ${baseUrl}...\n`);

  // 1. Download bundle to temp location
  const tmpDir = join(INSTALL_DIR, "_update_tmp");
  await mkdir(tmpDir, { recursive: true });

  const tmpBundle = join(tmpDir, bundleName);

  try {
    console.log("   Downloading bundle...");
    execFileSync("curl", [
      "-fsSL",
      `${baseUrl}/${bundleName}`,
      "-o",
      tmpBundle,
    ]);
    console.log("   ✓ Downloaded");

    // 2. Extract bundle
    console.log("   Extracting...");
    const extractDir = join(tmpDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    execFileSync("tar", [
      "-xzf",
      tmpBundle,
      "-C",
      extractDir,
      "--strip-components=1",
    ]);
    console.log("   ✓ Extracted");

    // 3. Compare versions
    const newPkgPath = join(extractDir, "package.json");
    const oldPkgPath = join(INSTALL_DIR, "package.json");
    const newPkg = JSON.parse(await readFile(newPkgPath, "utf8"));
    let oldPkg;
    try {
      oldPkg = JSON.parse(await readFile(oldPkgPath, "utf8"));
    } catch {
      oldPkg = { version: "unknown", dependencies: {} };
    }

    const oldVersion =
      oldPkg.dependencies?.["@forwardimpact/pathway"] || "unknown";
    const newVersion =
      newPkg.dependencies?.["@forwardimpact/pathway"] || "unknown";

    // 4. Replace data
    console.log("   Updating data files...");
    await rm(installDataDir, { recursive: true });
    await cp(join(extractDir, "data"), installDataDir, { recursive: true });
    console.log("   ✓ Data updated");

    // 5. Update package.json if version changed
    if (oldVersion !== newVersion) {
      console.log(`   Updating pathway ${oldVersion} → ${newVersion}...`);
      await writeFile(oldPkgPath, JSON.stringify(newPkg, null, 2) + "\n");
      console.log("   ✓ package.json updated");
    }

    // 6. Run npm install
    console.log("   Installing dependencies...");
    execSync("npm install --production --ignore-scripts --no-audit --no-fund", {
      cwd: INSTALL_DIR,
      stdio: "ignore",
    });
    console.log("   ✓ Dependencies installed");

    // 7. Report
    console.log(`
✅ Update complete!

  Pathway: ${oldVersion === newVersion ? newVersion + " (unchanged)" : oldVersion + " → " + newVersion}
  Data:    updated from ${baseUrl}
`);
  } finally {
    // Clean up temp directory
    await rm(tmpDir, { recursive: true, force: true });
  }
}
