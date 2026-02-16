#!/usr/bin/env -S deno run --allow-all

// Build script for Basecamp (arm64 macOS).
//
// Usage:
//   deno run --allow-all build.js         Build standalone executable
//   deno run --allow-all build.js --pkg   Build executable + macOS .pkg installer

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

const __dirname =
  import.meta.dirname || dirname(new URL(import.meta.url).pathname);
const DIST_DIR = join(__dirname, "dist");
const APP_NAME = "fit-basecamp";
const STATUS_MENU_NAME = "BasecampStatus";
const STATUS_MENU_DIR = join(__dirname, "StatusMenu");
const VERSION = JSON.parse(
  readFileSync(join(__dirname, "package.json"), "utf8"),
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
// Compile standalone binary
// ---------------------------------------------------------------------------

function compile() {
  const outputPath = join(DIST_DIR, APP_NAME);

  console.log(`\nCompiling ${APP_NAME}...`);
  ensureDir(DIST_DIR);

  const cmd = [
    "deno compile",
    "--allow-all",
    "--no-check",
    `--output "${outputPath}"`,
    "basecamp.js",
  ].join(" ");

  run(cmd, { cwd: __dirname });

  console.log(`  -> ${outputPath}`);
  return outputPath;
}

// ---------------------------------------------------------------------------
// Compile Swift status menu binary
// ---------------------------------------------------------------------------

function compileStatusMenu() {
  console.log(`\nCompiling ${STATUS_MENU_NAME}...`);
  ensureDir(DIST_DIR);

  const buildDir = join(STATUS_MENU_DIR, ".build");
  rmSync(buildDir, { recursive: true, force: true });

  run("swift build -c release", { cwd: STATUS_MENU_DIR });

  const binary = join(buildDir, "release", STATUS_MENU_NAME);
  const outputPath = join(DIST_DIR, STATUS_MENU_NAME);
  run(`cp "${binary}" "${outputPath}"`);

  rmSync(buildDir, { recursive: true, force: true });

  console.log(`  -> ${outputPath}`);
  return outputPath;
}

// ---------------------------------------------------------------------------
// Build macOS installer package (.pkg)
// ---------------------------------------------------------------------------

function buildPKG(statusMenuBinaryPath) {
  const pkgName = `${APP_NAME}-${VERSION}.pkg`;

  console.log(`\nBuilding pkg: ${pkgName}...`);

  const buildPkg = join(__dirname, "pkg", "macos", "build-pkg.sh");
  run(
    `"${buildPkg}" "${DIST_DIR}" "${APP_NAME}" "${VERSION}" "${statusMenuBinaryPath}"`,
    { cwd: __dirname },
  );

  console.log(`  -> ${join(DIST_DIR, pkgName)}`);
  return join(DIST_DIR, pkgName);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = Deno?.args || process.argv.slice(2);
const wantPKG = args.includes("--pkg");

console.log(`Basecamp Build (v${VERSION})`);
console.log("==========================");

// Compile Deno binary first (before status menu exists in dist/),
// so the status menu binary is not embedded in the Deno binary.
compile();
const statusMenuBinary = compileStatusMenu();

if (wantPKG) {
  buildPKG(statusMenuBinary);
}

console.log("\nBuild complete! Output in dist/");
