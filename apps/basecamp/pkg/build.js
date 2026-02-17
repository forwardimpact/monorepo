#!/usr/bin/env -S deno run --allow-all

// Build script for Basecamp (arm64 macOS).
//
// Usage:
//   deno run --allow-all pkg/build.js           Build scheduler + launcher
//   deno run --allow-all pkg/build.js --app     Build + assemble Basecamp.app
//   deno run --allow-all pkg/build.js --pkg     Build + assemble + .pkg installer

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

const __dirname =
  import.meta.dirname || dirname(new URL(import.meta.url).pathname);
const PROJECT_DIR = join(__dirname, "..");
const DIST_DIR = join(PROJECT_DIR, "dist");
const APP_NAME = "fit-basecamp";
const LAUNCHER_NAME = "Basecamp";
const LAUNCHER_DIR = join(PROJECT_DIR, "macos", "Basecamp");
const VERSION = JSON.parse(
  readFileSync(join(PROJECT_DIR, "package.json"), "utf8"),
).version;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

// ---------------------------------------------------------------------------
// Compile Deno scheduler binary
// ---------------------------------------------------------------------------

function compileScheduler() {
  const outputPath = join(DIST_DIR, APP_NAME);

  console.log(`\nCompiling ${APP_NAME}...`);
  ensureDir(DIST_DIR);

  const cmd = [
    "deno compile",
    "--allow-all",
    "--no-check",
    `--output "${outputPath}"`,
    "src/basecamp.js",
  ].join(" ");

  run(cmd, { cwd: PROJECT_DIR });

  console.log(`  -> ${outputPath}`);
  return outputPath;
}

// ---------------------------------------------------------------------------
// Compile Swift app launcher (includes status menu UI)
// ---------------------------------------------------------------------------

function compileLauncher() {
  console.log(`\nCompiling ${LAUNCHER_NAME}...`);
  ensureDir(DIST_DIR);

  const buildDir = join(LAUNCHER_DIR, ".build");
  rmSync(buildDir, { recursive: true, force: true });

  run("swift build -c release", { cwd: LAUNCHER_DIR });

  const binary = join(buildDir, "release", LAUNCHER_NAME);
  const outputPath = join(DIST_DIR, LAUNCHER_NAME);
  run(`cp "${binary}" "${outputPath}"`);

  rmSync(buildDir, { recursive: true, force: true });

  console.log(`  -> ${outputPath}`);
  return outputPath;
}

// ---------------------------------------------------------------------------
// Assemble Basecamp.app bundle
// ---------------------------------------------------------------------------

function buildApp() {
  console.log("\nAssembling Basecamp.app...");

  const buildApp = join(__dirname, "macos", "build-app.sh");
  run(`bash "${buildApp}"`, { cwd: PROJECT_DIR });
}

// ---------------------------------------------------------------------------
// Build macOS installer package (.pkg)
// ---------------------------------------------------------------------------

function buildPKG() {
  const pkgName = `${APP_NAME}-${VERSION}.pkg`;

  console.log(`\nBuilding pkg: ${pkgName}...`);

  const buildPkg = join(__dirname, "macos", "build-pkg.sh");
  run(`bash "${buildPkg}" "${DIST_DIR}" "${VERSION}"`, { cwd: PROJECT_DIR });

  console.log(`  -> ${join(DIST_DIR, pkgName)}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = Deno?.args || process.argv.slice(2);
const wantApp = args.includes("--app") || args.includes("--pkg");
const wantPKG = args.includes("--pkg");

console.log(`Basecamp Build (v${VERSION})`);
console.log("==========================");

// Compile Deno scheduler first (before launcher exists in dist/),
// so the launcher binary is not embedded in the Deno binary.
compileScheduler();
compileLauncher();

if (wantApp) {
  buildApp();
}

if (wantPKG) {
  buildPKG();
}

console.log("\nBuild complete! Output in dist/");
